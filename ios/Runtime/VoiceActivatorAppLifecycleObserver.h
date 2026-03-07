#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^VoiceActivatorAppDidEnterBackgroundHandler)(void);
typedef void (^VoiceActivatorAppWillEnterForegroundHandler)(void);

@interface VoiceActivatorAppLifecycleObserver : NSObject

- (instancetype)initWithDidEnterBackgroundHandler:
                    (VoiceActivatorAppDidEnterBackgroundHandler)
                        didEnterBackgroundHandler
                         willEnterForegroundHandler:
                             (VoiceActivatorAppWillEnterForegroundHandler)
                                 willEnterForegroundHandler;
- (void)startObserving;
- (void)stopObserving;

@end

NS_ASSUME_NONNULL_END
