#import "VoiceActivator.h"

namespace {
NSString *const kWakeWordDetectedEventName = @"VoiceActivatorOnWakeWordDetected";
NSString *const kDefaultDetectedPhrase = @"hey react native";
}

@implementation VoiceActivator {
  NSDictionary *_status;
  NSString *_detectedPhrase;
  NSTimer *_detectionTimer;
}

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _detectedPhrase = kDefaultDetectedPhrase;
    _status = @{
      @"state" : @"idle",
      @"isAvailable" : @YES,
      @"isListening" : @NO,
      @"canStart" : @NO,
      @"lastError" : [NSNull null]
    };
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kWakeWordDetectedEventName ];
}

- (NSDictionary *)currentStatus
{
  return [_status copy];
}

- (void)updateStatus:(NSDictionary *)overrides
{
  NSMutableDictionary *nextStatus = [_status mutableCopy];
  [nextStatus addEntriesFromDictionary:overrides];
  _status = [nextStatus copy];
}

- (void)clearDetectionTimer
{
  if (_detectionTimer != nil) {
    [_detectionTimer invalidate];
    _detectionTimer = nil;
  }
}

- (void)emitWakeWordDetected
{
  _detectionTimer = nil;

  if (![[_status objectForKey:@"state"] isEqual:@"running"]) {
    return;
  }

  [self sendEventWithName:kWakeWordDetectedEventName
                     body:@{
                       @"detectedPhrase" : _detectedPhrase,
                       @"detectedAt" : [NSISO8601DateFormatter stringFromDate:[NSDate date]
                                                                    timeZone:[NSTimeZone timeZoneWithAbbreviation:@"UTC"]
                                                                 formatOptions:NSISO8601DateFormatWithInternetDateTime]
                     }];
}

RCT_EXPORT_METHOD(initialize
                  : (__unused NSDictionary *)options resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (__unused RCTPromiseRejectBlock)reject)
{
  [self clearDetectionTimer];
  _detectedPhrase = kDefaultDetectedPhrase;

  [self updateStatus:@{
    @"state" : @"ready",
    @"isAvailable" : @YES,
    @"isListening" : @NO,
    @"canStart" : @YES,
    @"lastError" : [NSNull null]
  }];

  resolve(nil);
}

RCT_EXPORT_METHOD(startDetection
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  if (![[_status objectForKey:@"canStart"] boolValue]) {
    reject(
        @"runtime_not_ready",
        @"VoiceActivator.startDetection requires initialize() to complete before detection can begin.",
        nil);
    return;
  }

  [self updateStatus:@{
    @"state" : @"running",
    @"isAvailable" : @YES,
    @"isListening" : @YES,
    @"canStart" : @NO,
    @"lastError" : [NSNull null]
  }];

  [self clearDetectionTimer];
  _detectionTimer =
      [NSTimer scheduledTimerWithTimeInterval:0.0
                                       target:self
                                     selector:@selector(emitWakeWordDetected)
                                     userInfo:nil
                                      repeats:NO];

  resolve(nil);
}

RCT_EXPORT_METHOD(stopDetection
                  : (RCTPromiseResolveBlock)resolve reject
                  : (__unused RCTPromiseRejectBlock)reject)
{
  [self clearDetectionTimer];

  NSString *currentState = [_status objectForKey:@"state"];
  BOOL shouldRemainStartable =
      [currentState isEqual:@"running"] || [currentState isEqual:@"starting"] ||
      [currentState isEqual:@"ready"] || [currentState isEqual:@"stopped"];
  NSString *nextState = shouldRemainStartable ? @"stopped" : @"idle";

  [self updateStatus:@{
    @"state" : nextState,
    @"isAvailable" : @YES,
    @"isListening" : @NO,
    @"canStart" : @(shouldRemainStartable),
    @"lastError" : [NSNull null]
  }];

  resolve(nil);
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getStatus)
{
  return [self currentStatus];
}

RCT_EXPORT_METHOD(dispose
                  : (RCTPromiseResolveBlock)resolve reject
                  : (__unused RCTPromiseRejectBlock)reject)
{
  [self clearDetectionTimer];
  [self updateStatus:@{
    @"state" : @"idle",
    @"isAvailable" : @YES,
    @"isListening" : @NO,
    @"canStart" : @NO,
    @"lastError" : [NSNull null]
  }];

  resolve(nil);
}

RCT_EXPORT_METHOD(addListener : (__unused NSString *)eventName) {}

RCT_EXPORT_METHOD(removeListeners : (__unused double)count) {}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeVoiceActivatorSpecJSI>(params);
}

@end
