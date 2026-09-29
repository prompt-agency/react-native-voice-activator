#import "VADCapture.h"
#import <AVFoundation/AVFoundation.h>
#import <os/lock.h>

static const NSUInteger kVADFrameSize = 512; // samples per frame (32 ms at 16 kHz)

@implementation VADCapture {
  AVAudioEngine *_audioEngine;
  // ── Shared between the AVAudioEngine I/O thread and the caller's queue ──
  // Everything below _stateLock is touched from the tap block as well as from
  // start/stop, so every access goes through _stateLock. removeTapOnBus: does
  // not promise that an already-entered tap block has returned, so without this
  // stop() can free the pending buffer while the tap is appending to it.
  os_unfair_lock _stateLock;
  AVAudioConverter *_converter;
  AVAudioFormat *_targetFormat;
  // Converted samples that have not yet formed a whole VAD frame. Rate
  // conversion returns a variable number of frames per callback, but Silero
  // requires exactly kVADFrameSize samples per inference, so the remainder
  // carries into the next callback.
  NSMutableData *_pendingSamples;
  BOOL _running;
  // One log per capture session. The tap fires about 31 times a second, so a
  // route change that breaks the converter would otherwise flood the log with
  // an identical line; after the first, a failure costs one BOOL test.
  BOOL _conversionErrorLogged;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _audioEngine = [[AVAudioEngine alloc] init];
    _stateLock = OS_UNFAIR_LOCK_INIT;
    _pendingSamples = [NSMutableData data];
    _running = NO;
    _conversionErrorLogged = NO;
  }
  return self;
}

- (BOOL)isRunning
{
  os_unfair_lock_lock(&_stateLock);
  BOOL running = _running;
  os_unfair_lock_unlock(&_stateLock);
  return running;
}

- (BOOL)startWithSampleRate:(double)sampleRate error:(NSError **)error
{
  os_unfair_lock_lock(&_stateLock);
  BOOL alreadyRunning = _running;
  os_unfair_lock_unlock(&_stateLock);
  if (alreadyRunning) {
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

  // No tap is installed yet, so nothing else can be reading these, but the
  // lock is taken anyway so that every write to the shared state goes through
  // one discipline.
  os_unfair_lock_lock(&_stateLock);
  _converter = converter;
  _targetFormat = targetFormat;
  _conversionErrorLogged = NO;
  [_pendingSamples setLength:0];
  os_unfair_lock_unlock(&_stateLock);

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
                         if (!strongSelf) {
                           return;
                         }
                         if (buffer.frameLength == 0) {
                           return;
                         }

                         // Snapshot once into a strong local. The property is
                         // atomic, so this cannot tear against a caller
                         // clearing the handler, and the block stays alive for
                         // the whole emit loop below rather than being
                         // re-read and possibly nil on a later iteration.
                         void (^frameHandler)(NSString *) = strongSelf.pcmFrameHandler;
                         if (!frameHandler) {
                           return;
                         }

                         // Everything from here to the end of the block touches
                         // state that stop() tears down, so it runs under the
                         // lock. stop() releases the lock before removing the
                         // tap, so this can never deadlock against it.
                         os_unfair_lock_lock(&strongSelf->_stateLock);

                         if (!strongSelf->_running) {
                           os_unfair_lock_unlock(&strongSelf->_stateLock);
                           return;
                         }

                         AVAudioConverter *activeConverter = strongSelf->_converter;
                         AVAudioFormat *outputFormat = strongSelf->_targetFormat;
                         if (!activeConverter || !outputFormat) {
                           os_unfair_lock_unlock(&strongSelf->_stateLock);
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
                           os_unfair_lock_unlock(&strongSelf->_stateLock);
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
                           // The converter is built once from the hardware
                           // format at start. If the route changes under it,
                           // for example a Bluetooth HFP headset dropping the
                           // input to 16 or 8 kHz, every later callback fails
                           // the same way and capture goes silent with
                           // startVADCapture already resolved. Swallowing this
                           // left no trace anywhere; log it once so the
                           // silence is at least diagnosable.
                           BOOL shouldLog = !strongSelf->_conversionErrorLogged;
                           if (shouldLog) {
                             strongSelf->_conversionErrorLogged = YES;
                           }
                           double sourceRate = buffer.format.sampleRate;
                           double destRate = outputFormat.sampleRate;
                           os_unfair_lock_unlock(&strongSelf->_stateLock);
                           if (shouldLog) {
                             NSLog(@"[VoiceActivator] VAD capture conversion failed (%.0f Hz -> "
                                   @"%.0f Hz); no further PCM frames will be emitted until "
                                   @"capture is restarted. Further failures in this session are "
                                   @"not logged. Error: %@",
                                   sourceRate, destRate,
                                   conversionError.localizedDescription ?: @"unknown error");
                           }
                           return;
                         }
                         if (converted.frameLength == 0 ||
                             converted.floatChannelData == NULL) {
                           os_unfair_lock_unlock(&strongSelf->_stateLock);
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

                         // Frames are gathered under the lock and delivered
                         // after it is released. The handler hops the React
                         // Native bridge, which is far more work than the
                         // buffer manipulation here, and stop() waits on this
                         // lock; keeping the emit outside it bounds that wait
                         // to buffer work alone.
                         NSMutableArray<NSString *> *readyFrames = nil;
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
                           if (!readyFrames) {
                             readyFrames = [NSMutableArray arrayWithCapacity:2];
                           }
                           [readyFrames addObject:base64];
                         }

                         os_unfair_lock_unlock(&strongSelf->_stateLock);

                         for (NSString *base64 in readyFrames) {
                           frameHandler(base64);
                         }
                       }];
  } @catch (NSException *exception) {
    os_unfair_lock_lock(&_stateLock);
    _converter = nil;
    _targetFormat = nil;
    os_unfair_lock_unlock(&_stateLock);
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
    os_unfair_lock_lock(&_stateLock);
    _converter = nil;
    _targetFormat = nil;
    os_unfair_lock_unlock(&_stateLock);
    if (error) {
      *error = startError;
    }
    return NO;
  }

  os_unfair_lock_lock(&_stateLock);
  _running = YES;
  os_unfair_lock_unlock(&_stateLock);
  return YES;
}

- (void)stop
{
  // Phase 1: flip the flag under the lock. A tap block that has not yet taken
  // the lock will take it, see NO, and return without touching anything.
  os_unfair_lock_lock(&_stateLock);
  if (!_running) {
    os_unfair_lock_unlock(&_stateLock);
    return;
  }
  _running = NO;
  os_unfair_lock_unlock(&_stateLock);

  // Phase 2: tear down the graph with the lock released. removeTapOnBus: and
  // -stop can wait on the audio I/O thread, and that thread may be waiting on
  // _stateLock, so holding the lock across these calls would deadlock.
  [_audioEngine.inputNode removeTapOnBus:0];
  [_audioEngine stop];

  // Phase 3: retake the lock to free the shared state. A tap block that was
  // already inside its body when phase 1 ran still holds the lock, so this
  // waits for it to finish rather than reallocating _pendingSamples under its
  // appendBytes: or resetting the resampler under its convertToBuffer:.
  // The converter carries resampler state across calls, so a restart at a
  // different hardware rate must not inherit it. The same applies to a partial
  // frame, which would otherwise be spliced onto the start of the next session.
  os_unfair_lock_lock(&_stateLock);
  [_converter reset];
  _converter = nil;
  _targetFormat = nil;
  [_pendingSamples setLength:0];
  _conversionErrorLogged = NO;
  os_unfair_lock_unlock(&_stateLock);
}

- (void)dealloc
{
  [self stop];
}

@end
