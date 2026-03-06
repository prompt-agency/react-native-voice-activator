#import "VoiceActivatorAudioSessionController.h"

#import <AVFoundation/AVFoundation.h>

@implementation VoiceActivatorAudioSessionController

- (BOOL)activateSession:(NSError * _Nullable __autoreleasing * _Nullable)error
{
  AVAudioSession *audioSession = [AVAudioSession sharedInstance];

  if (![audioSession setCategory:AVAudioSessionCategoryPlayAndRecord
                            mode:AVAudioSessionModeMeasurement
                         options:AVAudioSessionCategoryOptionDefaultToSpeaker
                           error:error]) {
    return NO;
  }

  return [audioSession setActive:YES error:error];
}

- (BOOL)deactivateSession:(NSError * _Nullable __autoreleasing * _Nullable)error
{
  return [[AVAudioSession sharedInstance]
      setActive:NO
    withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
          error:error];
}

@end
