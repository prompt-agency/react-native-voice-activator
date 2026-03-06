#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface VoiceActivatorRuntimeStateStore : NSObject

- (instancetype)initWithInitialStatus:(NSDictionary *)initialStatus;
- (NSDictionary *)currentStatus;
- (void)setStatus:(NSDictionary *)status;
- (void)updateStatus:(NSDictionary *)overrides;

@end

NS_ASSUME_NONNULL_END
