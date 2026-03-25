#import "VoiceActivator.h"

#import "Runtime/AudioPlayback.h"
#import "Runtime/WakeWordSessionCoordinator.h"

namespace {
NSString *const kWakeWordDetectedEventName = @"VoiceActivatorOnWakeWordDetected";
NSString *const kRuntimeStateChangedEventName = @"VoiceActivatorOnRuntimeStateChanged";
NSString *const kRuntimeErrorEventName = @"VoiceActivatorOnRuntimeError";
NSString *const kRuntimeInterruptionEventName = @"VoiceActivatorOnRuntimeInterruption";
NSString *const kRuntimeAudioRouteChangedEventName = @"VoiceActivatorOnAudioRouteChanged";
}

@implementation VoiceActivator {
  WakeWordSessionCoordinator *_sessionCoordinator;
  AudioPlayback *_audioPlayback;
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
    _sessionCoordinator = [WakeWordSessionCoordinator new];
    _audioPlayback = [AudioPlayback new];

    __weak __typeof(self) weakSelf = self;
    _sessionCoordinator.wakeWordDetectedHandler = ^(NSDictionary *payload) {
      [weakSelf sendEventWithName:kWakeWordDetectedEventName body:payload];
    };
    _sessionCoordinator.runtimeStatusHandler = ^(NSDictionary *status) {
      [weakSelf sendEventWithName:kRuntimeStateChangedEventName body:status];
    };
    _sessionCoordinator.runtimeErrorHandler = ^(NSDictionary *errorPayload) {
      [weakSelf sendEventWithName:kRuntimeErrorEventName body:errorPayload];
    };
    _sessionCoordinator.interruptionHandler = ^(NSDictionary *payload) {
      [weakSelf sendEventWithName:kRuntimeInterruptionEventName body:payload];
    };
    _sessionCoordinator.audioRouteChangedHandler = ^(NSDictionary *payload) {
      [weakSelf sendEventWithName:kRuntimeAudioRouteChangedEventName body:payload];
    };
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[
    kWakeWordDetectedEventName,
    kRuntimeStateChangedEventName,
    kRuntimeErrorEventName,
    kRuntimeInterruptionEventName,
    kRuntimeAudioRouteChangedEventName
  ];
}

- (void)reject:(RCTPromiseRejectBlock)reject
      withCode:(NSString *)code
         error:(NSError *)error
{
  reject(code, error.localizedDescription, error);
}

RCT_EXPORT_METHOD(initialize
                  : (NSDictionary *)options resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![_sessionCoordinator initializeWithOptions:options error:&error]) {
    [self reject:reject withCode:@"initialize_failed" error:error];
    return;
  }

  resolve(nil);
}

RCT_EXPORT_METHOD(startDetection
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![_sessionCoordinator startDetection:&error]) {
    [self reject:reject withCode:@"start_detection_failed" error:error];
    return;
  }

  resolve(nil);
}

RCT_EXPORT_METHOD(stopDetection
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![_sessionCoordinator stopDetection:&error]) {
    [self reject:reject withCode:@"stop_detection_failed" error:error];
    return;
  }

  resolve(nil);
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getStatus)
{
  return [_sessionCoordinator currentStatus];
}

RCT_EXPORT_METHOD(dispose
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![_sessionCoordinator dispose:&error]) {
    [self reject:reject withCode:@"dispose_failed" error:error];
    return;
  }

  resolve(nil);
}

RCT_EXPORT_METHOD(playPCMChunk
                  : (NSString *)pcmBase64 sampleRate
                  : (double)sampleRate resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![_audioPlayback startStreamingWithSampleRate:sampleRate error:&error]) {
    [self reject:reject withCode:@"playback_start_failed" error:error];
    return;
  }
  [_audioPlayback writeChunkFromBase64:pcmBase64];
  resolve(nil);
}

RCT_EXPORT_METHOD(playWav
                  : (NSString *)filePath resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [_audioPlayback playWavFile:filePath
                   completion:^(NSError *_Nullable error) {
                     if (error) {
                       [self reject:reject withCode:@"wav_playback_failed" error:error];
                     } else {
                       resolve(nil);
                     }
                   }];
}

RCT_EXPORT_METHOD(stopPlayback
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [_audioPlayback stopStreaming];
  resolve(nil);
}

RCT_EXPORT_METHOD(setVolumeDucking
                  : (BOOL)active resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  // Ducking is managed automatically in AudioPlayback startStreaming/stopStreaming.
  // This method is a no-op on iOS since DuckOthers is set on the session category
  // when streaming activates. Exposed for API parity with Android.
  resolve(nil);
}

RCT_EXPORT_METHOD(addListener : (NSString *)eventName)
{
  [super addListener:eventName];
}

RCT_EXPORT_METHOD(removeListeners : (double)count)
{
  [super removeListeners:count];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeVoiceActivatorSpecJSI>(params);
}

@end
