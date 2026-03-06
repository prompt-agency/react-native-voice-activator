#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface VoiceActivatorAudioSessionController : NSObject

- (BOOL)activateSession:(NSError * _Nullable * _Nullable)error;
- (BOOL)deactivateSession:(NSError * _Nullable * _Nullable)error;

@end

NS_ASSUME_NONNULL_END
