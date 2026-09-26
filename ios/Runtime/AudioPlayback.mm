#import "AudioPlayback.h"

#import <AVFoundation/AVFoundation.h>

#import "VoiceActivatorAudioSessionController.h"

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
  /** True while the WAV player holds a playback intent on the shared session. */
  BOOL _wavOwnsSession;
  /** True while streaming holds a playback intent on the shared session. */
  BOOL _streamOwnsSessionIntent;
}

@synthesize streaming = _streaming;

/**
 * Playback no longer configures the audio session itself.
 *
 * It used to call setCategory directly, and on the speaker path it chose plain
 * Playback — a category with no input — which silently killed the wake-word input
 * tap for as long as playback ran, taking barge-in and the next turn with it.
 * VoiceActivatorAudioSessionController now derives one configuration from the
 * live intents and leaves the category alone while detection holds a listening
 * intent.
 */
static VoiceActivatorAudioSessionController *VoiceActivatorSessionOwner(void)
{
  return [VoiceActivatorAudioSessionController sharedController];
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

  NSError *sessionError = nil;
  if (![VoiceActivatorSessionOwner() acquirePlaybackWithEarpieceOutput:earpieceOutput
                                                                error:&sessionError]) {
    if (error) {
      *error = sessionError;
    }
    return NO;
  }
  _streamOwnsSessionIntent = YES;

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

/**
 * Settle a pending WAV completion before tearing the player down.
 *
 * AVAudioPlayer's -stop does not call the delegate — only natural completion or
 * a decode error does. Nulling the delegate on stopPlayback(), or on a second
 * playWav(), therefore dropped the JS promise on the floor and `await playWav()`
 * hung forever. Same failure class as an unsettled provider promise: an awaited
 * call that can never resolve.
 */
- (void)settlePendingWavCompletionWithReason:(NSString *)reason
{
  _AudioPlaybackWavDelegate *delegate = _wavDelegate;
  if (delegate == nil) {
    return;
  }

  void (^pending)(NSError *_Nullable) = delegate.completion;
  // Cleared first so the delegate cannot also fire it if a callback is already
  // in flight.
  delegate.completion = nil;

  if (pending) {
    pending([NSError errorWithDomain:@"AudioPlayback"
                               code:-2
                           userInfo:@{NSLocalizedDescriptionKey : reason}]);
  }
}

- (void)stopStreaming
{
  if (_wavPlayer) {
    [self settlePendingWavCompletionWithReason:
              @"WAV playback was stopped before it finished."];
    [_wavPlayer stop];
    _wavPlayer.delegate = nil;
    _wavPlayer = nil;
    _wavDelegate = nil;
    if (_wavOwnsSession) {
      _wavOwnsSession = NO;
      [VoiceActivatorSessionOwner() releasePlayback];
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

  if (_streamOwnsSessionIntent) {
    _streamOwnsSessionIntent = NO;
    [VoiceActivatorSessionOwner() releasePlayback];
  }
}

// ─── WAV file playback ─────────────────────────────────────────────────────

- (void)playWavFile:(NSString *)filePath
     earpieceOutput:(BOOL)earpieceOutput
         completion:(void (^)(NSError *_Nullable))completion
{
  if (_wavPlayer) {
    [self settlePendingWavCompletionWithReason:
              @"WAV playback was superseded by another playWav call."];
    [_wavPlayer stop];
    _wavPlayer.delegate = nil;
    _wavPlayer = nil;
    _wavDelegate = nil;
    if (_wavOwnsSession) {
      _wavOwnsSession = NO;
      [VoiceActivatorSessionOwner() releasePlayback];
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
    NSError *sessionError = nil;
    if (![VoiceActivatorSessionOwner() acquirePlaybackWithEarpieceOutput:earpieceOutput
                                                                  error:&sessionError]) {
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
      AudioPlayback *strongSelf = weakSelf;
      if (strongSelf) {
        strongSelf->_wavPlayer = nil;
        strongSelf->_wavDelegate = nil;
        if (strongSelf->_wavOwnsSession) {
          strongSelf->_wavOwnsSession = NO;
          [VoiceActivatorSessionOwner() releasePlayback];
        }
      }
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
      _wavOwnsSession = NO;
      [VoiceActivatorSessionOwner() releasePlayback];
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
