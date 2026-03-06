#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^VoiceActivatorInterruptionHandler)(BOOL began, BOOL shouldResume);

@interface VoiceActivatorInterruptionObserver : NSObject

- (instancetype)initWithHandler:(VoiceActivatorInterruptionHandler)handler;
- (void)startObserving;
- (void)stopObserving;

@end

NS_ASSUME_NONNULL_END
