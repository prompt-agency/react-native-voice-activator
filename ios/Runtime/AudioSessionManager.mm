#import "AudioSessionManager.h"

#import <AVFoundation/AVFoundation.h>
#import "VoiceActivatorInterruptionObserver.h"

@implementation AudioSessionManager {
  NSString *_desiredRoute;
  VoiceActivatorInterruptionObserver *_interruptionObserver;
}

@synthesize desiredRoute = _desiredRoute;

- (instancetype)init
{
  self = [super init];
  if (self) {
    _desiredRoute = @"default";
  }
  return self;
}

// ─── Route selection ────────────────────────────────────────────────────────

- (BOOL)setRoute:(NSString *)route error:(NSError **)error
{
  NSArray<NSString *> *validRoutes = @[ @"default", @"speaker", @"earpiece", @"bluetooth" ];
  if (![validRoutes containsObject:route]) {
    if (error) {
      *error = [NSError
          errorWithDomain:@"AudioSessionManager"
                     code:400
                 userInfo:@{
                   NSLocalizedDescriptionKey :
                       [NSString stringWithFormat:@"Invalid audio route '%@'. "
                                                   "Valid values: default, speaker, earpiece, bluetooth",
                                                  route]
                 }];
    }
    return NO;
  }
  _desiredRoute = [route copy];
  return YES;
}

- (BOOL)applyRouteOverride:(NSError **)error
{
  AVAudioSession *session = [AVAudioSession sharedInstance];
  AVAudioSessionPortOverride portOverride = AVAudioSessionPortOverrideNone;
  if ([_desiredRoute isEqualToString:@"speaker"]) {
    portOverride = AVAudioSessionPortOverrideSpeaker;
  }
  // For "bluetooth" and "earpiece": clear any override and let session category
  // options (AllowBluetoothA2DP, AllowAirPlayEnhancement) handle routing.
  return [session overrideOutputAudioPort:portOverride error:error];
}

// ─── Interruption observation ────────────────────────────────────────────────

- (void)startObservingInterruptionsWithHandler:(void (^)(BOOL began,
                                                         BOOL shouldResume))handler
{
  // Stop any previous observation before starting a new one
  [_interruptionObserver stopObserving];

  __weak __typeof(self) weakSelf = self;
  _interruptionObserver = [[VoiceActivatorInterruptionObserver alloc]
      initWithHandler:^(BOOL began, BOOL shouldResume) {
        (void)weakSelf; // capture to extend lifetime if needed
        if (handler) {
          handler(began, shouldResume);
        }
      }];
  [_interruptionObserver startObserving];
}

- (void)stopObservingInterruptions
{
  [_interruptionObserver stopObserving];
  _interruptionObserver = nil;
}

@end
