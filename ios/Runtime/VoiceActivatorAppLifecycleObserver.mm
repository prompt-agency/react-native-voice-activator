#import "VoiceActivatorAppLifecycleObserver.h"

#import <UIKit/UIKit.h>

@implementation VoiceActivatorAppLifecycleObserver {
  VoiceActivatorAppDidEnterBackgroundHandler _didEnterBackgroundHandler;
  VoiceActivatorAppWillEnterForegroundHandler _willEnterForegroundHandler;
  BOOL _isObserving;
}

- (instancetype)initWithDidEnterBackgroundHandler:
                    (VoiceActivatorAppDidEnterBackgroundHandler)
                        didEnterBackgroundHandler
                         willEnterForegroundHandler:
                             (VoiceActivatorAppWillEnterForegroundHandler)
                                 willEnterForegroundHandler
{
  self = [super init];
  if (self) {
    _didEnterBackgroundHandler = [didEnterBackgroundHandler copy];
    _willEnterForegroundHandler = [willEnterForegroundHandler copy];
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
  NSNotificationCenter *notificationCenter = [NSNotificationCenter defaultCenter];
  [notificationCenter addObserver:self
                         selector:@selector(handleDidEnterBackground)
                             name:UIApplicationDidEnterBackgroundNotification
                           object:nil];
  [notificationCenter addObserver:self
                         selector:@selector(handleWillEnterForeground)
                             name:UIApplicationWillEnterForegroundNotification
                           object:nil];
}

- (void)stopObserving
{
  if (!_isObserving) {
    return;
  }

  _isObserving = NO;
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)handleDidEnterBackground
{
  _didEnterBackgroundHandler();
}

- (void)handleWillEnterForeground
{
  _willEnterForegroundHandler();
}

@end
