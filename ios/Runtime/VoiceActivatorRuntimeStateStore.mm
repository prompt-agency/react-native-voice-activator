#import "VoiceActivatorRuntimeStateStore.h"

@implementation VoiceActivatorRuntimeStateStore {
  NSDictionary *_status;
}

- (instancetype)initWithInitialStatus:(NSDictionary *)initialStatus
{
  self = [super init];
  if (self) {
    _status = [initialStatus copy];
  }
  return self;
}

- (NSDictionary *)currentStatus
{
  return [_status copy];
}

- (void)setStatus:(NSDictionary *)status
{
  _status = [status copy];
}

- (void)updateStatus:(NSDictionary *)overrides
{
  NSMutableDictionary *nextStatus = [_status mutableCopy];
  [nextStatus addEntriesFromDictionary:overrides];
  _status = [nextStatus copy];
}

@end
