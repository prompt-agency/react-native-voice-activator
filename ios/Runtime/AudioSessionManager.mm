#import "AudioSessionManager.h"

#import <AVFoundation/AVFoundation.h>
#import "VoiceActivatorInterruptionObserver.h"

@implementation AudioSessionManager {
  NSString *_desiredRoute;
  VoiceActivatorInterruptionObserver *_interruptionObserver;
  void (^_interruptionHandler)(BOOL began, BOOL shouldResume);
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
  // The handler is stored separately from the observer so repeated calls swap it
  // without touching the NSNotificationCenter registration.
  //
  // This used to stopObserving and re-register every time. playPCMChunk calls it
  // per chunk, so during streaming that was dozens of deregister/register pairs a
  // second, each with a window in which an interruption notification would be
  // missed entirely.
  _interruptionHandler = [handler copy];

  if (_interruptionObserver != nil) {
    return;
  }

  __weak __typeof(self) weakSelf = self;
  _interruptionObserver = [[VoiceActivatorInterruptionObserver alloc]
      initWithHandler:^(BOOL began, BOOL shouldResume) {
        __strong __typeof(weakSelf) strongSelf = weakSelf;
        if (strongSelf == nil) {
          return;
        }
        void (^current)(BOOL, BOOL) = strongSelf->_interruptionHandler;
        if (current) {
          current(began, shouldResume);
        }
      }];
  [_interruptionObserver startObserving];
}

- (void)stopObservingInterruptions
{
  _interruptionHandler = nil;
  [_interruptionObserver stopObserving];
  _interruptionObserver = nil;
}

@end
