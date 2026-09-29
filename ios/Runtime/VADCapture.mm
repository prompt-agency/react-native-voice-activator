#import "VADCapture.h"
#import <AVFoundation/AVFoundation.h>

static const NSUInteger kVADFrameSize = 512; // samples per frame (32 ms at 16 kHz)

@implementation VADCapture {
  AVAudioEngine *_audioEngine;
  AVAudioConverter *_converter;
  AVAudioFormat *_targetFormat;
  // Converted samples that have not yet formed a whole VAD frame. Rate
  // conversion returns a variable number of frames per callback, but Silero
  // requires exactly kVADFrameSize samples per inference, so the remainder
  // carries into the next callback.
  NSMutableData *_pendingSamples;
  BOOL _running;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _audioEngine = [[AVAudioEngine alloc] init];
    _pendingSamples = [NSMutableData data];
    _running = NO;
  }
  return self;
}

- (BOOL)isRunning
{
  return _running;
}

- (BOOL)startWithSampleRate:(double)sampleRate error:(NSError **)error
{
  if (_running) {
    return YES;
  }

  AVAudioInputNode *inputNode = _audioEngine.inputNode;

  // Tap at the hardware format and convert downstream. Installing a tap with a
  // format the bus does not provide is not a documented guarantee: on hardware
  // running at 48 kHz a 16 kHz request is refused outright. SherpaOnnxDetector
  // already taps at the hardware format and resamples after the fact, and this
  // does the same so both capture paths behave identically.
  AVAudioFormat *inputFormat = [inputNode inputFormatForBus:0];
  if (!inputFormat || inputFormat.sampleRate <= 0) {
    if (error) {
      *error = [NSError
          errorWithDomain:@"VADCapture"
                     code:-1
                 userInfo:@{
                   NSLocalizedDescriptionKey : @"The audio input reported no usable hardware format"
                 }];
    }
    return NO;
  }

  // The VAD consumer requires exactly this format, so the converter output is
  // what it receives, never the raw tap buffer.
  AVAudioFormat *targetFormat =
      [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32
                                       sampleRate:sampleRate
                                         channels:1
                                      interleaved:NO];
  if (!targetFormat) {
    if (error) {
      *error = [NSError
          errorWithDomain:@"VADCapture"
                     code:-1
                 userInfo:@{
                   NSLocalizedDescriptionKey : @"Failed to create AVAudioFormat for VAD capture"
                 }];
    }
    return NO;
  }

  AVAudioConverter *converter = [[AVAudioConverter alloc] initFromFormat:inputFormat
                                                                toFormat:targetFormat];
  if (!converter) {
    if (error) {
      *error = [NSError
          errorWithDomain:@"VADCapture"
                     code:-1
                 userInfo:@{
                   NSLocalizedDescriptionKey : [NSString
                       stringWithFormat:@"Cannot convert the %.0f Hz hardware input to %.0f Hz "
                                        @"mono float32 for VAD capture",
                       inputFormat.sampleRate, sampleRate]
                 }];
    }
    return NO;
  }
  _converter = converter;
  _targetFormat = targetFormat;

  // Ask for enough hardware frames that each callback yields roughly one VAD
  // frame after downsampling. AVAudioEngine treats this as a hint, so the
  // conversion below never assumes an exact count.
  AVAudioFrameCount tapBufferSize =
      (AVAudioFrameCount)ceil((double)kVADFrameSize * inputFormat.sampleRate / sampleRate);

  // The tap format now matches the bus, so a rejection is no longer expected.
  // The guard stays because installTapOnBus reports a bad format by raising an
  // Objective-C exception, which would bypass the NSError path and terminate
  // the app rather than surfacing to the caller.
  __weak __typeof(self) weakSelf = self;
  @try {
  [inputNode installTapOnBus:0
                  bufferSize:tapBufferSize
                      format:inputFormat
                       block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
                         __strong __typeof(weakSelf) strongSelf = weakSelf;
                         if (!strongSelf || !strongSelf->_running) {
                           return;
                         }
                         if (!strongSelf.pcmFrameHandler) {
                           return;
                         }
                         if (buffer.frameLength == 0) {
                           return;
                         }
                         AVAudioConverter *activeConverter = strongSelf->_converter;
                         AVAudioFormat *outputFormat = strongSelf->_targetFormat;
                         if (!activeConverter || !outputFormat) {
                           return;
                         }

                         // Rate conversion buffers internally, so the output
                         // frame count varies. Size generously and trust
                         // frameLength afterwards.
                         double ratio = outputFormat.sampleRate / buffer.format.sampleRate;
                         AVAudioFrameCount capacity =
                             (AVAudioFrameCount)ceil((double)buffer.frameLength * ratio) + 32;
                         AVAudioPCMBuffer *converted =
                             [[AVAudioPCMBuffer alloc] initWithPCMFormat:outputFormat
                                                           frameCapacity:capacity];
                         if (!converted) {
                           return;
                         }

                         // The converter pulls until satisfied; hand it this
                         // buffer once, then report no more data so it emits
                         // what it has instead of blocking for a refill.
                         __block BOOL consumed = NO;
                         NSError *conversionError = nil;
                         AVAudioConverterOutputStatus status = [activeConverter
                             convertToBuffer:converted
                                       error:&conversionError
                          withInputFromBlock:^AVAudioBuffer *_Nullable(
                              AVAudioPacketCount inNumberOfPackets,
                              AVAudioConverterInputStatus *_Nonnull outStatus) {
                            if (consumed) {
                              *outStatus = AVAudioConverterInputStatus_NoDataNow;
                              return nil;
                            }
                            consumed = YES;
                            *outStatus = AVAudioConverterInputStatus_HaveData;
                            return buffer;
                          }];

                         if (status == AVAudioConverterOutputStatus_Error) {
                           return;
                         }
                         if (converted.frameLength == 0 ||
                             converted.floatChannelData == NULL) {
                           return;
                         }

                         // Silero rejects anything other than exactly
                         // kVADFrameSize samples: a short frame changes the
                         // encoder output shape and the decoder LSTM fails on
                         // the tensor rank. Accumulate and emit whole frames,
                         // carrying the remainder to the next callback.
                         float *samples = converted.floatChannelData[0];
                         [strongSelf->_pendingSamples
                             appendBytes:samples
                                  length:converted.frameLength * sizeof(float)];

                         const NSUInteger frameBytes = kVADFrameSize * sizeof(float);
                         while (strongSelf->_pendingSamples.length >= frameBytes) {
                           NSData *frame = [strongSelf->_pendingSamples
                               subdataWithRange:NSMakeRange(0, frameBytes)];
                           [strongSelf->_pendingSamples
                               replaceBytesInRange:NSMakeRange(0, frameBytes)
                                         withBytes:NULL
                                            length:0];
                           NSString *base64 =
                               [frame base64EncodedStringWithOptions:0];
                           strongSelf.pcmFrameHandler(base64);
                         }
                       }];
  } @catch (NSException *exception) {
    _converter = nil;
    _targetFormat = nil;
    if (error) {
      *error = [NSError
          errorWithDomain:@"VADCapture"
                     code:-2
                 userInfo:@{
                   NSLocalizedDescriptionKey : [NSString
                       stringWithFormat:@"The audio input rejected a %.0f Hz tap: %@",
                       inputFormat.sampleRate,
                       exception.reason ?: exception.name]
                 }];
    }
    return NO;
  }

  NSError *startError = nil;
  [_audioEngine prepare];
  if (![_audioEngine startAndReturnError:&startError]) {
    [inputNode removeTapOnBus:0];
    _converter = nil;
    _targetFormat = nil;
    if (error) {
      *error = startError;
    }
    return NO;
  }

  _running = YES;
  return YES;
}

- (void)stop
{
  if (!_running) {
    return;
  }
  _running = NO;
  [_audioEngine.inputNode removeTapOnBus:0];
  [_audioEngine stop];
  // The converter carries resampler state across calls, so a restart at a
  // different hardware rate must not inherit it. The same applies to a partial
  // frame, which would otherwise be spliced onto the start of the next session.
  [_converter reset];
  _converter = nil;
  _targetFormat = nil;
  [_pendingSamples setLength:0];
}

- (void)dealloc
{
  [self stop];
}

@end
