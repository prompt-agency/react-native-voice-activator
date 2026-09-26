#import "VoiceActivatorAudioSessionController.h"

#import <AVFoundation/AVFoundation.h>

@implementation VoiceActivatorAudioSessionController {
  BOOL _listening;
  NSInteger _playbackIntents;
  /** Last route applied for playback, so releasing one can restore the other. */
  BOOL _playbackWantsEarpiece;
}

+ (instancetype)sharedController
{
  static VoiceActivatorAudioSessionController *shared = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    shared = [[self alloc] init];
  });
  return shared;
}

- (BOOL)isListeningIntentHeld
{
  return _listening;
}

// ─── Listening ────────────────────────────────────────────────────────────────

- (BOOL)beginListening:(NSError *_Nullable __autoreleasing *_Nullable)error
{
  const BOOL wasListening = _listening;
  _listening = YES;

  if (![self applyListeningCategory:error]) {
    _listening = wasListening;
    return NO;
  }

  if (![[AVAudioSession sharedInstance] setActive:YES error:error]) {
    _listening = wasListening;
    return NO;
  }

  // A playback intent taken while no listening intent existed may have routed to
  // the earpiece; re-apply it so acquiring listening does not silently move audio
  // back to the speaker mid-playback.
  if (_playbackIntents > 0) {
    [self applyPlaybackRoute:_playbackWantsEarpiece];
  }

  return YES;
}

- (void)endListening
{
  if (!_listening) {
    return;
  }
  _listening = NO;

  if (_playbackIntents > 0) {
    // Playback outlives detection: hand the session over rather than deactivate
    // it under a player that is still running.
    NSError *unused = nil;
    [self applyPlaybackCategory:_playbackWantsEarpiece error:&unused];
    return;
  }

  [self deactivate];
}

// ─── Playback ─────────────────────────────────────────────────────────────────

- (BOOL)acquirePlaybackWithEarpieceOutput:(BOOL)earpieceOutput
                                    error:(NSError *_Nullable __autoreleasing *_Nullable)error
{
  _playbackIntents += 1;
  _playbackWantsEarpiece = earpieceOutput;

  if (self.isListeningIntentHeld) {
    // The listening category (PlayAndRecord) already plays. Changing it here is
    // what used to break detection, so only the output route is set —
    // overrideOutputAudioPort does that without disturbing the input tap.
    [self applyPlaybackRoute:earpieceOutput];
    return YES;
  }

  if (![self applyPlaybackCategory:earpieceOutput error:error]) {
    _playbackIntents -= 1;
    return NO;
  }

  if (![[AVAudioSession sharedInstance] setActive:YES error:error]) {
    _playbackIntents -= 1;
    return NO;
  }

  return YES;
}

- (void)releasePlayback
{
  if (_playbackIntents == 0) {
    return;
  }
  _playbackIntents -= 1;
  if (_playbackIntents > 0) {
    return;
  }

  if (self.isListeningIntentHeld) {
    // Detection continues. Drop the earpiece override so the next playback
    // starts from a known route, and leave the category and the session alone.
    [self applyPlaybackRoute:NO];
    return;
  }

  [self deactivate];
}

// ─── Configuration ────────────────────────────────────────────────────────────

- (BOOL)applyListeningCategory:(NSError *_Nullable __autoreleasing *_Nullable)error
{
  // Measurement mode minimises input processing, which is what the keyword
  // spotter wants. It is deliberately kept even while playback is active: the
  // alternative, switching to VoiceChat for echo cancellation, changes input
  // characteristics mid-detection and would invalidate any measured detection
  // rate. Revisit once there are acoustic numbers to compare against.
  return [[AVAudioSession sharedInstance]
      setCategory:AVAudioSessionCategoryPlayAndRecord
             mode:AVAudioSessionModeMeasurement
          options:AVAudioSessionCategoryOptionDefaultToSpeaker
            error:error];
}

- (BOOL)applyPlaybackCategory:(BOOL)earpieceOutput
                        error:(NSError *_Nullable __autoreleasing *_Nullable)error
{
  AVAudioSession *session = [AVAudioSession sharedInstance];

  if (earpieceOutput) {
    return [session setCategory:AVAudioSessionCategoryPlayAndRecord
                           mode:AVAudioSessionModeDefault
                        options:(AVAudioSessionCategoryOptionDuckOthers |
                                 AVAudioSessionCategoryOptionAllowBluetoothA2DP |
                                 AVAudioSessionCategoryOptionAllowAirPlay)
                          error:error];
  }

  return [session setCategory:AVAudioSessionCategoryPlayback
                         mode:AVAudioSessionModeSpokenAudio
                      options:AVAudioSessionCategoryOptionDuckOthers
                        error:error];
}

/**
 * Route output without touching the category.
 *
 * Failure is swallowed deliberately: the route is a preference, and refusing to
 * play because the earpiece override was rejected would be worse than playing
 * out of the speaker.
 */
- (void)applyPlaybackRoute:(BOOL)earpieceOutput
{
  NSError *routeError = nil;
  [[AVAudioSession sharedInstance]
      overrideOutputAudioPort:(earpieceOutput ? AVAudioSessionPortOverrideNone
                                              : AVAudioSessionPortOverrideSpeaker)
                        error:&routeError];
}

- (void)deactivate
{
  NSError *deactivateError = nil;
  [[AVAudioSession sharedInstance]
      setActive:NO
    withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
          error:&deactivateError];
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

- (BOOL)supportsBackgroundAudio
{
  NSArray<NSString *> *backgroundModes =
      [[NSBundle mainBundle] objectForInfoDictionaryKey:@"UIBackgroundModes"];
  if (![backgroundModes isKindOfClass:[NSArray class]]) {
    return NO;
  }

  return [backgroundModes containsObject:@"audio"];
}

- (void)resetIntentsForTesting
{
  _listening = NO;
  _playbackIntents = 0;
  _playbackWantsEarpiece = NO;
}

@end
