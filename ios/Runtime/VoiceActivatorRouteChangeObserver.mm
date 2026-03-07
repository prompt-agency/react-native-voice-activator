#import "VoiceActivatorRouteChangeObserver.h"

#import <AVFoundation/AVFoundation.h>

namespace {
NSString *VoiceActivatorDescribeRoute(AVAudioSessionRouteDescription *route)
{
  AVAudioSessionPortDescription *port =
      route.outputs.firstObject ?: route.inputs.firstObject;
  if (port == nil) {
    return @"unknown";
  }

  NSString *portType = port.portType;
  if ([portType isEqualToString:AVAudioSessionPortBuiltInSpeaker]) {
    return @"speaker";
  }
  if ([portType isEqualToString:AVAudioSessionPortBuiltInReceiver]) {
    return @"earpiece";
  }
  if ([portType isEqualToString:AVAudioSessionPortHeadphones]) {
    return @"headphones";
  }
  if ([portType isEqualToString:AVAudioSessionPortBluetoothA2DP] ||
      [portType isEqualToString:AVAudioSessionPortBluetoothLE] ||
      [portType isEqualToString:AVAudioSessionPortBluetoothHFP]) {
    return @"bluetooth";
  }
  if ([portType isEqualToString:AVAudioSessionPortUSBAudio]) {
    return @"usb";
  }

  return portType ?: @"unknown";
}
}

@implementation VoiceActivatorRouteChangeObserver {
  VoiceActivatorRouteChangeHandler _handler;
  BOOL _isObserving;
}

- (instancetype)initWithHandler:(VoiceActivatorRouteChangeHandler)handler
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
         selector:@selector(handleAudioRouteChange:)
             name:AVAudioSessionRouteChangeNotification
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

- (void)handleAudioRouteChange:(NSNotification *)notification
{
  NSDictionary *userInfo = notification.userInfo ?: @{};
  AVAudioSessionRouteDescription *previousRoute =
      userInfo[AVAudioSessionRouteChangePreviousRouteKey];
  AVAudioSessionRouteDescription *currentRoute =
      [AVAudioSession sharedInstance].currentRoute;

  _handler(VoiceActivatorDescribeRoute(currentRoute),
           previousRoute != nil ? VoiceActivatorDescribeRoute(previousRoute)
                                : nil);
}

@end
