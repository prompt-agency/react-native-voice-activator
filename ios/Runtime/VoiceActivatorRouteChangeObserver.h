#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^VoiceActivatorRouteChangeHandler)(NSString *route,
                                                 NSString *_Nullable previousRoute);

@interface VoiceActivatorRouteChangeObserver : NSObject

- (instancetype)initWithHandler:(VoiceActivatorRouteChangeHandler)handler;
- (void)startObserving;
- (void)stopObserving;

@end

NS_ASSUME_NONNULL_END
