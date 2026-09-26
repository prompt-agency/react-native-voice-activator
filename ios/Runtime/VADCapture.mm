#import "VADCapture.h"
#import <AVFoundation/AVFoundation.h>

static const NSUInteger kVADFrameSize = 512; // samples per frame (32 ms at 16 kHz)

@implementation VADCapture {
  AVAudioEngine *_audioEngine;
  BOOL _running;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _audioEngine = [[AVAudioEngine alloc] init];
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
  AVAudioFormat *captureFormat =
      [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32
                                       sampleRate:sampleRate
                                         channels:1
                                      interleaved:NO];
  if (!captureFormat) {
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

  // Installing a tap with a format that differs from the hardware format relies
  // on AVAudioEngine resampling into it. That works on the iOS versions this has
  // been run on, but it is not a documented guarantee, and a rejected format
  // raises NSInternalInconsistencyException — an Objective-C exception, which
  // bypasses the NSError path entirely and terminates the app.
  //
  // SherpaOnnxDetector uses [inputNode inputFormatForBus:0] and resamples
  // downstream, which is the documented approach; doing the same here means
  // adding an AVAudioConverter, and the VAD consumer needs exactly 16 kHz so the
  // conversion has to be correct. Until that can be verified on a device, the
  // exception is converted into the error path the caller already handles rather
  // than being left to crash.
  __weak __typeof(self) weakSelf = self;
  @try {
  [inputNode installTapOnBus:0
                  bufferSize:(AVAudioFrameCount)kVADFrameSize
                      format:captureFormat
                       block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
                         __strong __typeof(weakSelf) strongSelf = weakSelf;
                         if (!strongSelf || !strongSelf->_running) {
                           return;
                         }
                         if (!strongSelf.pcmFrameHandler) {
                           return;
                         }
                         AVAudioFrameCount frameCount = buffer.frameLength;
                         if (frameCount == 0) {
                           return;
                         }
                         // Null when the buffer is not float32 — possible if the
                         // engine negotiated a different format than requested.
                         if (buffer.floatChannelData == NULL) {
                           return;
                         }
                         float *samples = buffer.floatChannelData[0];
                         NSData *pcmData = [NSData dataWithBytes:samples
                                                          length:frameCount * sizeof(float)];
                         NSString *base64 =
                             [pcmData base64EncodedStringWithOptions:0];
                         strongSelf.pcmFrameHandler(base64);
                       }];
  } @catch (NSException *exception) {
    if (error) {
      *error = [NSError
          errorWithDomain:@"VADCapture"
                     code:-2
                 userInfo:@{
                   NSLocalizedDescriptionKey : [NSString
                       stringWithFormat:@"The audio input rejected a %.0f Hz "
                                        @"mono float32 tap (hardware format is "
                                        @"%.0f Hz): %@",
                       sampleRate,
                       [inputNode inputFormatForBus:0].sampleRate,
                       exception.reason ?: exception.name]
                 }];
    }
    return NO;
  }

  NSError *startError = nil;
  [_audioEngine prepare];
  if (![_audioEngine startAndReturnError:&startError]) {
    [inputNode removeTapOnBus:0];
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
}

- (void)dealloc
{
  [self stop];
}

@end
