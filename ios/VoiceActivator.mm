#import "VoiceActivator.h"

#import "Runtime/AudioPlayback.h"
#import "Runtime/AudioSessionManager.h"
#import "Runtime/VADCapture.h"
#import "Runtime/WakeWordSessionCoordinator.h"

namespace {
NSString *const kWakeWordDetectedEventName = @"VoiceActivatorOnWakeWordDetected";
NSString *const kRuntimeStateChangedEventName = @"VoiceActivatorOnRuntimeStateChanged";
NSString *const kRuntimeErrorEventName = @"VoiceActivatorOnRuntimeError";
NSString *const kRuntimeInterruptionEventName = @"VoiceActivatorOnRuntimeInterruption";
NSString *const kRuntimeAudioRouteChangedEventName = @"VoiceActivatorOnAudioRouteChanged";
NSString *const kVADPCMFrameEventName = @"VoiceActivatorOnVADPCMFrame";
}

@implementation VoiceActivator {
  WakeWordSessionCoordinator *_sessionCoordinator;
  AudioPlayback *_audioPlayback;
  AudioSessionManager *_audioSessionManager;
  VADCapture *_vadCapture;
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
    _audioSessionManager = [AudioSessionManager new];
    _vadCapture = [VADCapture new];

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
    kRuntimeAudioRouteChangedEventName,
    kVADPCMFrameEventName
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
  // Register TTS interruption observer before starting playback
  __weak __typeof(self) weakSelf = self;
  [_audioSessionManager startObservingInterruptionsWithHandler:^(BOOL began,
                                                                  BOOL shouldResume) {
    if (began) {
      __strong __typeof(weakSelf) strongSelf = weakSelf;
      if (!strongSelf) {
        return;
      }
      if ([strongSelf->_audioPlayback isStreaming]) {
        [strongSelf->_audioPlayback stopStreaming];
      }
      [strongSelf->_audioSessionManager stopObservingInterruptions];
      [strongSelf sendEventWithName:kRuntimeInterruptionEventName
                               body:@{
                                 @"reason" : @"audio_interruption",
                                 @"recoverable" : @YES
                               }];
    }
    // shouldResume=YES on interruption end is not acted upon here;
    // resuming TTS synthesis requires the CustomTTSAdapter (Story 11-4).
  }];

  BOOL earpiece =
      [[_audioSessionManager desiredRoute] isEqualToString:@"earpiece"];

  NSError *error = nil;
  if (![_audioPlayback startStreamingWithSampleRate:sampleRate
                                    earpieceOutput:earpiece
                                             error:&error]) {
    [_audioSessionManager stopObservingInterruptions];
    [self reject:reject withCode:@"playback_start_failed" error:error];
    return;
  }

  // Apply route override (non-fatal: log but do not reject on failure)
  NSError *routeError = nil;
  if (![_audioSessionManager applyRouteOverride:&routeError]) {
    NSLog(@"[VoiceActivator] Route override failed (non-fatal): %@",
          routeError.localizedDescription);
  }

  [_audioPlayback writeChunkFromBase64:pcmBase64];
  resolve(nil);
}

RCT_EXPORT_METHOD(playWav
                  : (NSString *)filePath resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  __weak __typeof(self) weakSelf = self;
  [_audioSessionManager startObservingInterruptionsWithHandler:^(BOOL began,
                                                                  BOOL shouldResume) {
    if (began) {
      __strong __typeof(weakSelf) strongSelf = weakSelf;
      if (!strongSelf) {
        return;
      }
      [strongSelf->_audioPlayback stopStreaming];
      [strongSelf->_audioSessionManager stopObservingInterruptions];
      [strongSelf sendEventWithName:kRuntimeInterruptionEventName
                               body:@{
                                 @"reason" : @"audio_interruption",
                                 @"recoverable" : @YES
                               }];
    }
  }];

  BOOL earpiece =
      [[_audioSessionManager desiredRoute] isEqualToString:@"earpiece"];

  [_audioPlayback playWavFile:filePath
               earpieceOutput:earpiece
                   completion:^(NSError *_Nullable error) {
                     __strong __typeof(weakSelf) strongSelf = weakSelf;
                     if (strongSelf) {
                       [strongSelf->_audioSessionManager
                           stopObservingInterruptions];
                     }
                     if (error) {
                       reject(@"wav_playback_failed", error.localizedDescription,
                              error);
                     } else {
                       resolve(nil);
                     }
                   }];

  NSError *routeError = nil;
  if (![_audioSessionManager applyRouteOverride:&routeError]) {
    NSLog(@"[VoiceActivator] Route override failed (non-fatal): %@",
          routeError.localizedDescription);
  }
}

RCT_EXPORT_METHOD(stopPlayback
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [_audioPlayback stopStreaming];
  [_audioSessionManager stopObservingInterruptions];
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

RCT_EXPORT_METHOD(setAudioRoute
                  : (NSString *)route resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![_audioSessionManager setRoute:route error:&error]) {
    [self reject:reject withCode:@"invalid_audio_route" error:error];
    return;
  }

  // Apply immediately if TTS is currently streaming
  if ([_audioPlayback isStreaming]) {
    NSError *overrideError = nil;
    if (![_audioSessionManager applyRouteOverride:&overrideError]) {
      NSLog(@"[VoiceActivator] Route override (live) failed (non-fatal): %@",
            overrideError.localizedDescription);
    }
  }

  resolve(nil);
}

RCT_EXPORT_METHOD(startVADCapture
                  : (double)sampleRate resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  __weak __typeof(self) weakSelf = self;
  _vadCapture.pcmFrameHandler = ^(NSString *base64PCM) {
    __strong __typeof(weakSelf) strongSelf = weakSelf;
    if (strongSelf) {
      [strongSelf sendEventWithName:kVADPCMFrameEventName
                               body:@{@"pcm" : base64PCM}];
    }
  };

  NSError *error = nil;
  if (![_vadCapture startWithSampleRate:sampleRate error:&error]) {
    [self reject:reject withCode:@"vad_capture_start_failed" error:error];
    return;
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(stopVADCapture
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [_vadCapture stop];
  _vadCapture.pcmFrameHandler = nil;
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
