#import "VoiceActivatorInterruptionObserver.h"

#import <AVFoundation/AVFoundation.h>

@implementation VoiceActivatorInterruptionObserver {
  VoiceActivatorInterruptionHandler _handler;
  BOOL _isObserving;
}

- (instancetype)initWithHandler:(VoiceActivatorInterruptionHandler)handler
{
  self = [super init];
  if (self) {
    _handler = [handler copy];
  }
  return self;
}

- (void)dealloc
{
  [self stopObserving];
}

- (void)startObserving
{
  if (_isObserving) {
    return;
  }

  _isObserving = YES;
  [[NSNotificationCenter defaultCenter]
      addObserver:self
         selector:@selector(handleAudioSessionInterruption:)
             name:AVAudioSessionInterruptionNotification
           object:[AVAudioSession sharedInstance]];
}

- (void)stopObserving
{
  if (!_isObserving) {
    return;
  }

  _isObserving = NO;
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)handleAudioSessionInterruption:(NSNotification *)notification
{
  NSDictionary *userInfo = notification.userInfo ?: @{};
  NSUInteger interruptionType =
      [userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue];

  if (interruptionType == AVAudioSessionInterruptionTypeBegan) {
    _handler(YES, NO);
    return;
  }

  NSUInteger options =
      [userInfo[AVAudioSessionInterruptionOptionKey] unsignedIntegerValue];
  BOOL shouldResume =
      (options & AVAudioSessionInterruptionOptionShouldResume) != 0;
  _handler(NO, shouldResume);
}

@end
