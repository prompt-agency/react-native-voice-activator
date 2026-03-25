#import "AudioPlayback.h"

#import <AVFoundation/AVFoundation.h>

// ─── AVAudioPlayer completion delegate ────────────────────────────────────────

@interface _AudioPlaybackWavDelegate : NSObject <AVAudioPlayerDelegate>
@property (nonatomic, copy) void (^completion)(NSError *_Nullable);
@end

@implementation _AudioPlaybackWavDelegate
- (void)audioPlayerDidFinishPlaying:(AVAudioPlayer *)player
                       successfully:(BOOL)flag
{
  if (self.completion) {
    self.completion(flag ? nil
                         : [NSError errorWithDomain:@"AudioPlayback"
                                              code:-1
                                          userInfo:@{
                                            NSLocalizedDescriptionKey :
                                                @"WAV playback did not complete successfully"
                                          }]);
  }
}

- (void)audioPlayerDecodeErrorDidOccur:(AVAudioPlayer *)player
                                 error:(NSError *_Nullable)error
{
  if (self.completion) {
    self.completion(error ?: [NSError errorWithDomain:@"AudioPlayback"
                                                code:-2
                                            userInfo:@{
                                              NSLocalizedDescriptionKey :
                                                  @"WAV decode error"
                                            }]);
  }
}
@end

// ─── AudioPlayback ─────────────────────────────────────────────────────────

@implementation AudioPlayback {
  AVAudioEngine *_engine;
  AVAudioPlayerNode *_playerNode;
  AVAudioFormat *_format;

  // WAV player and its delegate — retained for the duration of playback
  AVAudioPlayer *_wavPlayer;
  _AudioPlaybackWavDelegate *_wavDelegate;

  BOOL _streaming;
  /** Matches last successful startStreamingWithSampleRate:earpieceOutput: category choice. */
  BOOL _streamingUsesEarpieceCategory;
  /** YES when this instance activated the audio session solely for WAV (no streaming). */
  BOOL _wavOwnsSession;
}

@synthesize streaming = _streaming;

static BOOL VoiceActivatorConfigureTTSSession(AVAudioSession *session,
                                              BOOL earpieceOutput,
                                              NSError **error)
{
  NSError *sessionError = nil;
  BOOL ok;
  if (earpieceOutput) {
    ok = [session
        setCategory:AVAudioSessionCategoryPlayAndRecord
                mode:AVAudioSessionModeDefault
             options:(AVAudioSessionCategoryOptionDuckOthers |
                      AVAudioSessionCategoryOptionAllowBluetooth |
                      AVAudioSessionCategoryOptionAllowBluetoothA2DP |
                      AVAudioSessionCategoryOptionAllowAirPlayEnhancement)
               error:&sessionError];
  } else {
    ok = [session
        setCategory:AVAudioSessionCategoryPlayback
            options:(AVAudioSessionCategoryOptionDuckOthers |
                     AVAudioSessionCategoryOptionAllowBluetoothA2DP |
                     AVAudioSessionCategoryOptionAllowAirPlayEnhancement)
              error:&sessionError];
  }
  if (!ok && error) {
    *error = sessionError;
  }
  return ok;
}

// ─── Streaming ─────────────────────────────────────────────────────────────

- (BOOL)startStreamingWithSampleRate:(double)sampleRate
                     earpieceOutput:(BOOL)earpieceOutput
                              error:(NSError **)error
{
  if (_streaming) {
    if (_streamingUsesEarpieceCategory == earpieceOutput) {
      return YES;
    }
    [self stopStreaming];
  }

  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSError *sessionError = nil;
  if (!VoiceActivatorConfigureTTSSession(session, earpieceOutput, &sessionError)) {
    if (error) {
      *error = sessionError;
    }
    return NO;
  }
  if (![session setActive:YES error:&sessionError]) {
    if (error) {
      *error = sessionError;
    }
    return NO;
  }

  // Build engine and player node
  _engine = [[AVAudioEngine alloc] init];
  _playerNode = [[AVAudioPlayerNode alloc] init];
  _format = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32
                                            sampleRate:sampleRate
                                              channels:1
                                           interleaved:NO];

  [_engine attachNode:_playerNode];
  [_engine connect:_playerNode to:_engine.mainMixerNode format:_format];
  [_playerNode play];

  NSError *engineError = nil;
  if (![_engine startAndReturnError:&engineError]) {
    [_playerNode stop];
    _engine = nil;
    _playerNode = nil;
    _format = nil;
    if (error) {
      *error = engineError;
    }
    return NO;
  }

  _streaming = YES;
  _streamingUsesEarpieceCategory = earpieceOutput;
  return YES;
}

- (void)writeChunkFromBase64:(NSString *)pcmBase64
{
  if (!_streaming || !_playerNode || !_format) {
    return;
  }

  NSData *pcmData = [[NSData alloc] initWithBase64EncodedString:pcmBase64
                                                        options:0];
  if (!pcmData || pcmData.length == 0) {
    return;
  }

  NSUInteger frameCount = pcmData.length / sizeof(float);
  if (frameCount == 0) {
    return;
  }

  AVAudioPCMBuffer *buffer =
      [[AVAudioPCMBuffer alloc] initWithPCMFormat:_format
                                    frameCapacity:(AVAudioFrameCount)frameCount];
  if (!buffer) {
    return;
  }
  buffer.frameLength = (AVAudioFrameCount)frameCount;
  memcpy(buffer.floatChannelData[0], pcmData.bytes, pcmData.length);

  [_playerNode scheduleBuffer:buffer completionHandler:nil];
}

- (void)stopStreaming
{
  if (_wavPlayer) {
    [_wavPlayer stop];
    _wavPlayer.delegate = nil;
    _wavPlayer = nil;
    _wavDelegate = nil;
    if (_wavOwnsSession) {
      [[AVAudioSession sharedInstance]
          setActive:NO
        withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
              error:nil];
      _wavOwnsSession = NO;
    }
  }

  if (!_streaming) {
    return;
  }
  _streaming = NO;
  _streamingUsesEarpieceCategory = NO;

  [_playerNode stop];
  [_engine stop];
  _playerNode = nil;
  _engine = nil;
  _format = nil;

  [[AVAudioSession sharedInstance]
      setActive:NO
    withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
          error:nil];
}

// ─── WAV file playback ─────────────────────────────────────────────────────

- (void)playWavFile:(NSString *)filePath
     earpieceOutput:(BOOL)earpieceOutput
         completion:(void (^)(NSError *_Nullable))completion
{
  if (_wavPlayer) {
    [_wavPlayer stop];
    _wavPlayer.delegate = nil;
    _wavPlayer = nil;
    _wavDelegate = nil;
    if (_wavOwnsSession && !_streaming) {
      [[AVAudioSession sharedInstance]
          setActive:NO
        withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
              error:nil];
      _wavOwnsSession = NO;
    }
  }

  NSError *error = nil;
  NSURL *url = [NSURL fileURLWithPath:filePath];
  AVAudioPlayer *player = [[AVAudioPlayer alloc] initWithContentsOfURL:url
                                                                 error:&error];
  if (!player) {
    if (completion) {
      dispatch_async(dispatch_get_main_queue(), ^{
        completion(error ?: [NSError errorWithDomain:@"AudioPlayback"
                                               code:-3
                                           userInfo:@{
                                             NSLocalizedDescriptionKey :
                                                 @"Failed to create AVAudioPlayer"
                                           }]);
      });
    }
    return;
  }

  if (!_streaming) {
    AVAudioSession *session = [AVAudioSession sharedInstance];
    NSError *sessionError = nil;
    if (!VoiceActivatorConfigureTTSSession(session, earpieceOutput, &sessionError) ||
        ![session setActive:YES error:&sessionError]) {
      if (completion) {
        dispatch_async(dispatch_get_main_queue(), ^{
          completion(sessionError ?: [NSError errorWithDomain:@"AudioPlayback"
                                                       code:-4
                                                   userInfo:@{
                                                     NSLocalizedDescriptionKey :
                                                         @"Failed to activate audio session for WAV playback"
                                                   }]);
        });
      }
      return;
    }
    _wavOwnsSession = YES;
  } else {
    _wavOwnsSession = NO;
  }

  _wavPlayer = player;
  _AudioPlaybackWavDelegate *delegate = [_AudioPlaybackWavDelegate new];
  __weak __typeof(self) weakSelf = self;
  delegate.completion = ^(NSError *_Nullable err) {
    dispatch_async(dispatch_get_main_queue(), ^{
      weakSelf->_wavPlayer = nil;
      weakSelf->_wavDelegate = nil;
      if (weakSelf->_wavOwnsSession && !weakSelf->_streaming) {
        [[AVAudioSession sharedInstance]
            setActive:NO
          withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                error:nil];
      }
      weakSelf->_wavOwnsSession = NO;
      if (completion) {
        completion(err);
      }
    });
  };
  _wavDelegate = delegate;
  player.delegate = delegate;

  if (![player play]) {
    _wavPlayer = nil;
    _wavDelegate = nil;
    if (_wavOwnsSession) {
      [[AVAudioSession sharedInstance]
          setActive:NO
        withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
              error:nil];
      _wavOwnsSession = NO;
    }
    if (completion) {
      dispatch_async(dispatch_get_main_queue(), ^{
        completion([NSError errorWithDomain:@"AudioPlayback"
                                       code:-5
                                   userInfo:@{
                                     NSLocalizedDescriptionKey :
                                         @"AVAudioPlayer failed to start playback"
                                   }]);
      });
    }
    return;
  }
}

@end
