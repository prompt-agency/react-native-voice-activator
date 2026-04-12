#import "WakeWordSessionCoordinator.h"

#import "../Engines/SherpaOnnx/SherpaOnnxAssetLoader.h"
#import "../Engines/SherpaOnnx/SherpaOnnxDetector.h"
#import "VoiceActivatorAudioSessionController.h"
#import "VoiceActivatorAppLifecycleObserver.h"
#import "VoiceActivatorInterruptionObserver.h"
#import "VoiceActivatorRouteChangeObserver.h"
#import "VoiceActivatorRuntimeStateStore.h"

namespace {
NSString *const kPlatform = @"ios";
}

static NSDictionary *VoiceActivatorMakeError(
    NSString *category,
    NSString *code,
    NSString *message,
    BOOL recoverable)
{
  return @{
    @"category" : category,
    @"code" : code,
    @"message" : message,
    @"recoverable" : @(recoverable),
    @"platform" : kPlatform
  };
}

@implementation WakeWordSessionCoordinator {
  VoiceActivatorAudioSessionController *_audioSessionController;
  VoiceActivatorRuntimeStateStore *_runtimeStateStore;
  VoiceActivatorInterruptionObserver *_interruptionObserver;
  VoiceActivatorRouteChangeObserver *_routeChangeObserver;
  VoiceActivatorAppLifecycleObserver *_appLifecycleObserver;
  SherpaOnnxAssetLoader *_assetLoader;
  SherpaOnnxDetector *_detector;
  BOOL _isObservingInterruptions;
  BOOL _isObservingRouteChanges;
  BOOL _isObservingAppLifecycle;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _audioSessionController = [VoiceActivatorAudioSessionController new];
    _assetLoader = [SherpaOnnxAssetLoader new];
    _detector = [SherpaOnnxDetector new];
    _runtimeStateStore = [[VoiceActivatorRuntimeStateStore alloc]
        initWithInitialStatus:@{
          @"state" : @"idle",
          @"isAvailable" : @YES,
          @"isListening" : @NO,
          @"canStart" : @NO,
          @"lastError" : [NSNull null]
        }];

    __weak __typeof(self) weakSelf = self;
    _interruptionObserver = [[VoiceActivatorInterruptionObserver alloc]
        initWithHandler:^(BOOL began, BOOL shouldResume) {
          [weakSelf handleInterruptionBegan:began shouldResume:shouldResume];
        }];
    _routeChangeObserver = [[VoiceActivatorRouteChangeObserver alloc]
        initWithHandler:^(NSString *route, NSString *previousRoute) {
          [weakSelf handleAudioRouteChanged:route previousRoute:previousRoute];
        }];
    _appLifecycleObserver = [[VoiceActivatorAppLifecycleObserver alloc]
        initWithDidEnterBackgroundHandler:^{
          [weakSelf handleDidEnterBackground];
        }
                 willEnterForegroundHandler:^{
                   [weakSelf handleWillEnterForeground];
                 }];
    _detector.detectionHandler = ^(NSString *detectedPhrase) {
      if (weakSelf.wakeWordDetectedHandler != nil) {
        weakSelf.wakeWordDetectedHandler(@{
          @"detectedPhrase" : detectedPhrase,
          @"detectedAt" : [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]]
        });
      }
    };
    _detector.errorHandler = ^(NSError *detectorError) {
      [weakSelf setErrorStateWithCategory:@"engine"
                                     code:@"sherpa_detector_failed"
                                  message:detectorError.localizedDescription
                                 canStart:YES];
    };
  }
  return self;
}

- (void)dealloc
{
  [self stopObservingAppLifecycle];
  [self stopObservingInterruptions];
  [self stopObservingRouteChanges];
}

- (NSDictionary *)currentStatus
{
  return [_runtimeStateStore currentStatus];
}

- (BOOL)initializeWithOptions:(NSDictionary *)options
                        error:(NSError * _Nullable __autoreleasing * _Nullable)error
{
  NSDictionary *status = [self currentStatus];
  BOOL requiresSessionCleanup =
      _isObservingInterruptions || [status[@"isListening"] boolValue];

  if (requiresSessionCleanup) {
    NSError *audioSessionError = nil;
    [_audioSessionController deactivateSession:&audioSessionError];
    if (audioSessionError != nil) {
      [self setErrorStateWithCategory:@"platform"
                                 code:@"audio_session_deactivation_failed"
                              message:audioSessionError.localizedDescription
                             canStart:NO];
      if (error != nil) {
        *error = audioSessionError;
      }
      return NO;
    }
  }

  [self stopObservingInterruptions];
  [self startObservingRouteChanges];
  [self startObservingAppLifecycle];

  double sensitivity = 0.5;
  NSDictionary *engineConfig = [options[@"engineConfig"] isKindOfClass:[NSDictionary class]]
      ? options[@"engineConfig"]
      : nil;
  NSDictionary *assetKeys = [engineConfig[@"assetKeys"] isKindOfClass:[NSDictionary class]]
      ? engineConfig[@"assetKeys"]
      : nil;
  NSNumber *configuredSensitivity = [engineConfig[@"sensitivity"] isKindOfClass:[NSNumber class]]
      ? engineConfig[@"sensitivity"]
      : nil;
  if (configuredSensitivity != nil) {
    sensitivity = configuredSensitivity.doubleValue;
  }

  NSError *assetError = nil;
  NSString *modelAssetKey = [assetKeys[@"modelAssetKey"] isKindOfClass:[NSString class]]
      ? assetKeys[@"modelAssetKey"]
      : nil;
  NSString *keywordAssetKey = [assetKeys[@"keywordAssetKey"] isKindOfClass:[NSString class]]
      ? assetKeys[@"keywordAssetKey"]
      : nil;
  SherpaOnnxAssetPaths *assetPaths =
      [_assetLoader loadAssetPathsWithModelAssetKey:modelAssetKey
                                    keywordAssetKey:keywordAssetKey
                                              error:&assetError];
  if (assetPaths == nil || ![_detector configureWithAssetPaths:assetPaths
                                                   sensitivity:sensitivity
                                                         error:&assetError]) {
    [self setErrorStateWithCategory:@"engine"
                               code:@"sherpa_assets_unavailable"
                            message:assetError.localizedDescription
                           canStart:NO];
    if (error != nil) {
      *error = assetError;
    }
    return NO;
  }

  [self setStatus:@{
    @"state" : @"ready",
    @"isAvailable" : @YES,
    @"isListening" : @NO,
    @"canStart" : @YES,
    @"lastError" : [NSNull null]
  }];
  return YES;
}

- (BOOL)startDetection:(NSError * _Nullable __autoreleasing * _Nullable)error
{
  NSDictionary *status = [self currentStatus];
  if (![status[@"canStart"] boolValue]) {
    NSString *message =
        @"VoiceActivator.startDetection requires initialize() to complete before detection can begin.";
    [self setErrorStateWithCategory:@"lifecycle"
                               code:@"runtime_not_ready"
                            message:message
                                canStart:NO];
    if (error != nil) {
      *error = [NSError errorWithDomain:@"VoiceActivator"
                                   code:1
                               userInfo:@{NSLocalizedDescriptionKey : message}];
    }
    return NO;
  }

  NSError *audioSessionError = nil;
  if (![_audioSessionController activateSession:&audioSessionError]) {
    [self setErrorStateWithCategory:@"platform"
                               code:@"audio_session_activation_failed"
                            message:audioSessionError.localizedDescription
                           canStart:YES];
    if (error != nil) {
      *error = audioSessionError;
    }
    return NO;
  }

  [self startObservingInterruptions];

  NSError *detectorError = nil;
  if (![_detector start:&detectorError]) {
    [self setErrorStateWithCategory:@"engine"
                               code:@"sherpa_start_failed"
                            message:detectorError.localizedDescription
                           canStart:YES];
    if (error != nil) {
      *error = detectorError;
    }
    return NO;
  }

  [self setStatus:@{
    @"state" : @"running",
    @"isAvailable" : @YES,
    @"isListening" : @YES,
    @"canStart" : @NO,
    @"lastError" : [NSNull null]
  }];
  return YES;
}

- (BOOL)stopDetection:(NSError * _Nullable __autoreleasing * _Nullable)error
{
  NSDictionary *status = [self currentStatus];
  NSString *currentState = status[@"state"];
  BOOL shouldRemainStartable =
      [currentState isEqual:@"running"] || [currentState isEqual:@"starting"] ||
      [currentState isEqual:@"ready"] || [currentState isEqual:@"stopped"] ||
      [currentState isEqual:@"interrupted"];
  NSString *nextState = shouldRemainStartable ? @"stopped" : @"idle";

  NSError *audioSessionError = nil;
  [_detector stop:nil];
  [_audioSessionController deactivateSession:&audioSessionError];
  if (audioSessionError != nil) {
    [self setErrorStateWithCategory:@"platform"
                               code:@"audio_session_deactivation_failed"
                            message:audioSessionError.localizedDescription
                           canStart:shouldRemainStartable];
    if (error != nil) {
      *error = audioSessionError;
    }
    return NO;
  }

  [self stopObservingInterruptions];
  [self stopObservingRouteChanges];

  [self setStatus:@{
    @"state" : nextState,
    @"isAvailable" : @YES,
    @"isListening" : @NO,
    @"canStart" : @(shouldRemainStartable),
    @"lastError" : [NSNull null]
  }];
  return YES;
}

- (BOOL)dispose:(NSError * _Nullable __autoreleasing * _Nullable)error
{
  NSError *audioSessionError = nil;
  [_detector dispose];
  [_audioSessionController deactivateSession:&audioSessionError];
  if (audioSessionError != nil) {
    [self setErrorStateWithCategory:@"platform"
                               code:@"audio_session_deactivation_failed"
                            message:audioSessionError.localizedDescription
                           canStart:NO];
    if (error != nil) {
      *error = audioSessionError;
    }
    return NO;
  }

  [self stopObservingInterruptions];
  [self stopObservingAppLifecycle];
  [self stopObservingRouteChanges];

  [self setStatus:@{
    @"state" : @"idle",
    @"isAvailable" : @YES,
    @"isListening" : @NO,
    @"canStart" : @NO,
    @"lastError" : [NSNull null]
  }];
  return YES;
}

- (void)handleInterruptionBegan:(BOOL)began shouldResume:(BOOL)shouldResume
{
  if (began) {
    if (self.interruptionHandler != nil) {
      self.interruptionHandler(@{
        @"reason" : @"audio_session_interrupted",
        @"recoverable" : @YES
      });
    }
    [self setStatus:@{
      @"state" : @"interrupted",
      @"isAvailable" : @YES,
      @"isListening" : @NO,
      @"canStart" : @NO,
      @"lastError" : VoiceActivatorMakeError(
          @"lifecycle",
          @"audio_interrupted",
          @"The iOS audio session was interrupted.",
          YES)
    }];
    return;
  }

  if (shouldResume) {
    NSError *audioSessionError = nil;
    if (![_audioSessionController activateSession:&audioSessionError]) {
      [self setErrorStateWithCategory:@"platform"
                                 code:@"audio_session_activation_failed"
                              message:audioSessionError.localizedDescription
                             canStart:YES];
      return;
    }

    NSError *detectorError = nil;
    if (![_detector start:&detectorError]) {
      [self setErrorStateWithCategory:@"engine"
                                 code:@"sherpa_resume_failed"
                              message:detectorError.localizedDescription
                             canStart:YES];
      return;
    }

    [self setStatus:@{
      @"state" : @"running",
      @"isAvailable" : @YES,
      @"isListening" : @YES,
      @"canStart" : @NO,
      @"lastError" : [NSNull null]
    }];
    return;
  }

  if (self.interruptionHandler != nil) {
    self.interruptionHandler(@{
      @"reason" : @"audio_session_interruption_not_resumable",
      @"recoverable" : @NO
    });
  }
  [self stopObservingInterruptions];
  [self setUnsupportedStateWithCode:@"audio_interruption_not_resumable"
                            message:
                                @"The iOS audio session interruption cannot be resumed automatically."
                        isAvailable:NO];
}

- (void)setErrorStateWithCategory:(NSString *)category
                             code:(NSString *)code
                          message:(NSString *)message
                         canStart:(BOOL)canStart
{
  NSDictionary *runtimeError = VoiceActivatorMakeError(category, code, message, YES);
  [self setStatus:@{
    @"state" : @"error",
    @"isAvailable" : @YES,
    @"isListening" : @NO,
    @"canStart" : @(canStart),
    @"lastError" : runtimeError
  }];

  if (self.runtimeErrorHandler != nil) {
    self.runtimeErrorHandler(runtimeError);
  }
}

- (void)setUnsupportedStateWithCode:(NSString *)code
                            message:(NSString *)message
                        isAvailable:(BOOL)isAvailable
{
  NSDictionary *runtimeError =
      VoiceActivatorMakeError(@"platform", code, message, YES);
  [self setStatus:@{
    @"state" : @"unsupported",
    @"isAvailable" : @(isAvailable),
    @"isListening" : @NO,
    @"canStart" : @NO,
    @"reason" : message,
    @"lastError" : runtimeError
  }];

  if (self.runtimeErrorHandler != nil) {
    self.runtimeErrorHandler(runtimeError);
  }
}

- (void)setStatus:(NSDictionary *)status
{
  [_runtimeStateStore setStatus:status];

  if (self.runtimeStatusHandler != nil) {
    self.runtimeStatusHandler([_runtimeStateStore currentStatus]);
  }
}

- (void)startObservingInterruptions
{
  if (_isObservingInterruptions) {
    return;
  }

  _isObservingInterruptions = YES;
  [_interruptionObserver startObserving];
}

- (void)stopObservingInterruptions
{
  if (!_isObservingInterruptions) {
    return;
  }

  _isObservingInterruptions = NO;
  [_interruptionObserver stopObserving];
}

- (void)startObservingAppLifecycle
{
  if (_isObservingAppLifecycle) {
    return;
  }

  _isObservingAppLifecycle = YES;
  [_appLifecycleObserver startObserving];
}

- (void)stopObservingAppLifecycle
{
  if (!_isObservingAppLifecycle) {
    return;
  }

  _isObservingAppLifecycle = NO;
  [_appLifecycleObserver stopObserving];
}

- (void)startObservingRouteChanges
{
  if (_isObservingRouteChanges) {
    return;
  }

  _isObservingRouteChanges = YES;
  [_routeChangeObserver startObserving];
}

- (void)stopObservingRouteChanges
{
  if (!_isObservingRouteChanges) {
    return;
  }

  _isObservingRouteChanges = NO;
  [_routeChangeObserver stopObserving];
}

- (void)handleDidEnterBackground
{
  NSDictionary *status = [self currentStatus];
  if (![status[@"isListening"] boolValue]) {
    return;
  }

  if ([_audioSessionController supportsBackgroundAudio]) {
    NSMutableDictionary *nextStatus = [status mutableCopy];
    nextStatus[@"state"] = @"running";
    nextStatus[@"isAvailable"] = @YES;
    nextStatus[@"isListening"] = @YES;
    nextStatus[@"canStart"] = @NO;
    nextStatus[@"reason"] =
        @"Wake word detection is continuing in a supported iOS background audio state.";
    nextStatus[@"lastError"] = [NSNull null];
    [self setStatus:nextStatus];
    return;
  }

  NSError *audioSessionError = nil;
  [_audioSessionController deactivateSession:&audioSessionError];
  [self stopObservingInterruptions];
  if (audioSessionError != nil) {
    [self setErrorStateWithCategory:@"platform"
                               code:@"audio_session_deactivation_failed"
                            message:audioSessionError.localizedDescription
                           canStart:NO];
    return;
  }

  [self setUnsupportedStateWithCode:@"background_audio_mode_required"
                            message:
                                @"iOS background wake word detection requires the audio background mode to remain active after the app enters the background."
                        isAvailable:NO];
}

- (void)handleWillEnterForeground
{
  NSDictionary *status = [self currentStatus];
  if (![status[@"state"] isEqual:@"running"]) {
    return;
  }

  if (![status[@"isListening"] boolValue]) {
    return;
  }

  if (!status[@"reason"]) {
    return;
  }

  NSMutableDictionary *nextStatus = [status mutableCopy];
  [nextStatus removeObjectForKey:@"reason"];
  [self setStatus:nextStatus];
}

- (void)handleAudioRouteChanged:(NSString *)route previousRoute:(NSString *)previousRoute
{
  NSDictionary *status = [self currentStatus];
  NSString *state = status[@"state"];
  if (![status[@"isListening"] boolValue] &&
      ![state isEqual:@"interrupted"] &&
      ![state isEqual:@"running"]) {
    return;
  }

  if (self.audioRouteChangedHandler != nil) {
    NSMutableDictionary *payload = [@{ @"route" : route ?: @"unknown" } mutableCopy];
    if (previousRoute != nil) {
      payload[@"previousRoute"] = previousRoute;
    }
    self.audioRouteChangedHandler(payload);
  }
}

- (void)pauseWakeWordAudioForSecondaryCapture
{
  NSDictionary *status = [self currentStatus];
  if ([status[@"state"] isEqual:@"running"] && [status[@"isListening"] boolValue]) {
    [self setStatus:@{
      @"state" : @"running",
      @"isAvailable" : @YES,
      @"isListening" : @NO,
      @"canStart" : @NO,
      @"reason" : @"Wake word capture is paused while VAD owns the microphone.",
      @"lastError" : [NSNull null]
    }];
  }
  [_detector pauseAudioInputForSecondaryCapture];
}

- (BOOL)resumeWakeWordAudioAfterSecondaryCapture:(NSError * _Nullable __autoreleasing * _Nullable)error
{
  if (![_detector resumeAudioInputAfterSecondaryCapture:error]) {
    return NO;
  }

  NSDictionary *status = [self currentStatus];
  if ([status[@"state"] isEqual:@"running"] && ![status[@"isListening"] boolValue]) {
    [self setStatus:@{
      @"state" : @"running",
      @"isAvailable" : @YES,
      @"isListening" : @YES,
      @"canStart" : @NO,
      @"lastError" : [NSNull null]
    }];
  }
  return YES;
}

@end
