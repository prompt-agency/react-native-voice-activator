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

  __weak __typeof(self) weakSelf = self;
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
                         float *samples = buffer.floatChannelData[0];
                         NSData *pcmData = [NSData dataWithBytes:samples
                                                          length:frameCount * sizeof(float)];
                         NSString *base64 =
                             [pcmData base64EncodedStringWithOptions:0];
                         strongSelf.pcmFrameHandler(base64);
                       }];

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
