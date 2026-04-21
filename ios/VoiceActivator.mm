#import "VoiceActivator.h"

#import "Engines/SherpaOnnx/SherpaOnnxDenoiser.h"
#import "Engines/SherpaOnnx/SherpaOnnxSpeakerEmbedding.h"
#import "Engines/SherpaOnnx/SherpaOnnxTTS.h"
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
  SherpaOnnxTTS *_sherpaOnnxTTS;
  SherpaOnnxSpeakerEmbedding *_speakerEmbedding;
  SherpaOnnxDenoiser *_denoiser;
  NSString *_speakerModelPath;
  NSString *_denoiserModelPath;
  NSUInteger _lastSynthesisCallId;
  NSString *_pendingTTSWavPath;
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
    _sherpaOnnxTTS = [SherpaOnnxTTS new];
    _speakerEmbedding = [SherpaOnnxSpeakerEmbedding new];
    _denoiser = [SherpaOnnxDenoiser new];
    _lastSynthesisCallId = 0;

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

  // Store optional model paths for speaker embedding and denoiser.
  // These are used lazily when the respective bridge methods are first called.
  _speakerModelPath = options[@"speakerModelPath"];
  _denoiserModelPath = options[@"denoiserModelPath"];

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

  [_speakerEmbedding dispose];
  [_denoiser dispose];

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
  // Invalidate any in-flight synthesizeTTS call so the background thread
  // does not start WAV playback after stop() returns.
  ++_lastSynthesisCallId;

  [_audioPlayback stopStreaming];
  [_audioSessionManager stopObservingInterruptions];

  if (_pendingTTSWavPath) {
    [[NSFileManager defaultManager] removeItemAtPath:_pendingTTSWavPath error:nil];
    _pendingTTSWavPath = nil;
  }

  resolve(nil);
}

RCT_EXPORT_METHOD(synthesizeTTS
                  : (NSDictionary *)options resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  NSString *modelPath  = options[@"modelPath"];
  NSString *tokensPath = options[@"tokensPath"];
  NSString *dataDir    = options[@"dataDir"];
  NSString *text       = options[@"text"];

  if (!modelPath.length || !tokensPath.length || !dataDir.length || !text.length) {
    reject(@"invalid_tts_options",
           @"synthesizeTTS requires modelPath, tokensPath, dataDir, and text", nil);
    return;
  }

  int32_t speakerId   = [options[@"speakerId"]   intValue];
  float   speed       = [options[@"speed"]       floatValue] ?: 1.0f;
  float   noiseScale  = [options[@"noiseScale"]  floatValue] ?: 0.667f;
  float   noiseScaleW = [options[@"noiseScaleW"] floatValue] ?: 0.8f;
  float   lengthScale = [options[@"lengthScale"] floatValue] ?: 1.0f;

  // Per-call token: stopPlayback() increments this to cancel in-flight synthesis.
  NSUInteger callId = ++_lastSynthesisCallId;

  __weak __typeof(self) weakSelf = self;

  // ORT loads large ONNX models with deep shape-inference recursion; the default
  // GCD global-queue stack (512 KB) is too small and causes a stack-overflow crash.
  // Use an NSThread with an explicit 8 MB stack to give ORT enough room.
  NSThread *ttsThread = [[NSThread alloc] initWithBlock:^{
    NSString *wavPath   = nil;
    NSError  *synthError = nil;

    BOOL ok = [self->_sherpaOnnxTTS synthesizeText:text
                                         modelPath:modelPath
                                        tokensPath:tokensPath
                                           dataDir:dataDir
                                         speakerId:speakerId
                                             speed:speed
                                        noiseScale:noiseScale
                                       noiseScaleW:noiseScaleW
                                       lengthScale:lengthScale
                                           outPath:&wavPath
                                             error:&synthError];
    if (!ok || !wavPath) {
      reject(@"tts_synthesis_failed",
             synthError.localizedDescription ?: @"No audio produced", synthError);
      return;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
      __strong __typeof(weakSelf) strongSelf = weakSelf;
      if (!strongSelf) {
        [[NSFileManager defaultManager] removeItemAtPath:wavPath error:nil];
        reject(@"tts_deallocated", @"VoiceActivator was deallocated during synthesis", nil);
        return;
      }

      // If stopPlayback() was called while synthesis was running, discard the audio.
      if (strongSelf->_lastSynthesisCallId != callId) {
        [[NSFileManager defaultManager] removeItemAtPath:wavPath error:nil];
        resolve(nil);
        return;
      }

      strongSelf->_pendingTTSWavPath = wavPath;

      __weak __typeof(strongSelf) weakSelf2 = strongSelf;
      [strongSelf->_audioSessionManager
          startObservingInterruptionsWithHandler:^(BOOL began, BOOL shouldResume) {
        if (began) {
          __strong __typeof(weakSelf2) s2 = weakSelf2;
          if (!s2) return;
          [s2->_audioPlayback stopStreaming];
          [s2->_audioSessionManager stopObservingInterruptions];
          [s2 sendEventWithName:kRuntimeInterruptionEventName
                           body:@{@"reason" : @"audio_interruption", @"recoverable" : @YES}];
        }
      }];

      BOOL earpiece = [[strongSelf->_audioSessionManager desiredRoute]
                            isEqualToString:@"earpiece"];

      [strongSelf->_audioPlayback
          playWavFile:wavPath
       earpieceOutput:earpiece
           completion:^(NSError *_Nullable playError) {
             __strong __typeof(weakSelf2) s2 = weakSelf2;
             if (s2) {
               [s2->_audioSessionManager stopObservingInterruptions];
               s2->_pendingTTSWavPath = nil;
             }
             [[NSFileManager defaultManager] removeItemAtPath:wavPath error:nil];
             if (playError) {
               reject(@"tts_playback_failed", playError.localizedDescription, playError);
             } else {
               resolve(nil);
             }
           }];

      NSError *routeError = nil;
      if (![strongSelf->_audioSessionManager applyRouteOverride:&routeError]) {
        NSLog(@"[VoiceActivator] synthesizeTTS route override failed (non-fatal): %@",
              routeError.localizedDescription);
      }
    });
  }];
  ttsThread.stackSize = 8 * 1024 * 1024; // 8 MB — ORT needs >512 KB for large model loading
  ttsThread.qualityOfService = NSQualityOfServiceUserInitiated;
  [ttsThread start];
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
  // Sherpa and VAD each use their own AVAudioEngine; pause wake-word capture so only one graph records from the mic at a time.
  [_sessionCoordinator pauseWakeWordAudioForSecondaryCapture];

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
    (void)[_sessionCoordinator resumeWakeWordAudioAfterSecondaryCapture:nil];
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

  NSError *resumeError = nil;
  if (![_sessionCoordinator resumeWakeWordAudioAfterSecondaryCapture:&resumeError]) {
    NSLog(@"[VoiceActivator] Failed to resume wake word audio after VAD stop: %@",
          resumeError.localizedDescription ?: @"unknown error");
  }
  resolve(nil);
}

// ── Speaker embedding & denoiser lazy-init helpers ───────────────────────────

/**
 * Ensures the speaker embedding engine is configured on an 8MB stack thread.
 * ORT loads ONNX models with deep recursion — the default 512KB GCD stack
 * is too small (see Pitfall 3 in RESEARCH.md). Caches result across calls.
 */
- (void)ensureSpeakerEngineConfigured:(void (^)(NSError *_Nullable))completion
{
  if (!_speakerModelPath.length) {
    completion([NSError
        errorWithDomain:@"VoiceActivator"
                   code:-1
               userInfo:@{
                 NSLocalizedDescriptionKey :
                     @"speakerModelPath not set — pass speakerModelPath in initialize() options"
               }]);
    return;
  }

  NSThread *initThread = [[NSThread alloc] initWithBlock:^{
    NSError *error = nil;
    [self->_speakerEmbedding configureWithModelPath:self->_speakerModelPath
                                         numThreads:1
                                              error:&error];
    dispatch_async(dispatch_get_main_queue(), ^{
      completion(error);
    });
  }];
  initThread.stackSize = 8 * 1024 * 1024;
  initThread.qualityOfService = NSQualityOfServiceUserInitiated;
  [initThread start];
}

/**
 * Ensures the speech denoiser is configured on an 8MB stack thread.
 * Caches result across calls.
 */
- (void)ensureDenoiserConfigured:(void (^)(NSError *_Nullable))completion
{
  if (!_denoiserModelPath.length) {
    completion([NSError
        errorWithDomain:@"VoiceActivator"
                   code:-1
               userInfo:@{
                 NSLocalizedDescriptionKey :
                     @"denoiserModelPath not set — pass denoiserModelPath in initialize() options"
               }]);
    return;
  }

  NSThread *initThread = [[NSThread alloc] initWithBlock:^{
    NSError *error = nil;
    [self->_denoiser configureWithModelPath:self->_denoiserModelPath
                                 numThreads:1
                                      error:&error];
    dispatch_async(dispatch_get_main_queue(), ^{
      completion(error);
    });
  }];
  initThread.stackSize = 8 * 1024 * 1024;
  initThread.qualityOfService = NSQualityOfServiceUserInitiated;
  [initThread start];
}

// ── BRIDGE-01: extractSpeakerEmbedding ───────────────────────────────────────

RCT_EXPORT_METHOD(extractSpeakerEmbedding
                  : (NSString *)pcmBase64 sampleRate
                  : (double)sampleRate resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [self ensureSpeakerEngineConfigured:^(NSError *initError) {
    if (initError) {
      [self reject:reject withCode:@"speaker_engine_init_failed" error:initError];
      return;
    }
    NSError *error = nil;
    NSString *result = [self->_speakerEmbedding extractEmbeddingFromPCMBase64:pcmBase64
                                                                    sampleRate:(int32_t)sampleRate
                                                                         error:&error];
    if (!result) {
      [self reject:reject withCode:@"extract_embedding_failed" error:error];
      return;
    }
    resolve(result);
  }];
}

// ── BRIDGE-02: registerSpeaker ────────────────────────────────────────────────

RCT_EXPORT_METHOD(registerSpeaker
                  : (NSString *)name embeddingBase64
                  : (NSString *)embeddingBase64 resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [self ensureSpeakerEngineConfigured:^(NSError *initError) {
    if (initError) {
      [self reject:reject withCode:@"speaker_engine_init_failed" error:initError];
      return;
    }
    NSError *error = nil;
    if (![self->_speakerEmbedding registerSpeakerWithName:name
                                          embeddingBase64:embeddingBase64
                                                    error:&error]) {
      [self reject:reject withCode:@"register_speaker_failed" error:error];
      return;
    }
    resolve(nil);
  }];
}

// ── BRIDGE-03: verifySpeaker ──────────────────────────────────────────────────

RCT_EXPORT_METHOD(verifySpeaker
                  : (NSString *)name embeddingBase64
                  : (NSString *)embeddingBase64 threshold
                  : (double)threshold resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [self ensureSpeakerEngineConfigured:^(NSError *initError) {
    if (initError) {
      [self reject:reject withCode:@"speaker_engine_init_failed" error:initError];
      return;
    }
    NSError *error = nil;
    NSDictionary *result = [self->_speakerEmbedding verifySpeaker:name
                                                  embeddingBase64:embeddingBase64
                                                        threshold:(float)threshold
                                                            error:&error];
    if (!result) {
      [self reject:reject withCode:@"verify_speaker_failed" error:error];
      return;
    }
    resolve(result);
  }];
}

// ── BRIDGE-04: identifySpeaker ────────────────────────────────────────────────

RCT_EXPORT_METHOD(identifySpeaker
                  : (NSString *)embeddingBase64 threshold
                  : (double)threshold resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [self ensureSpeakerEngineConfigured:^(NSError *initError) {
    if (initError) {
      [self reject:reject withCode:@"speaker_engine_init_failed" error:initError];
      return;
    }
    NSError *error = nil;
    NSDictionary *result = [self->_speakerEmbedding identifySpeaker:embeddingBase64
                                                          threshold:(float)threshold
                                                              error:&error];
    if (!result) {
      [self reject:reject withCode:@"identify_speaker_failed" error:error];
      return;
    }
    resolve(result);
  }];
}

// ── BRIDGE-05: clearSpeakers ──────────────────────────────────────────────────

RCT_EXPORT_METHOD(clearSpeakers
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [_speakerEmbedding clearSpeakers];
  resolve(nil);
}

// ── BRIDGE-06: denoiseAudio ───────────────────────────────────────────────────

RCT_EXPORT_METHOD(denoiseAudio
                  : (NSString *)pcmBase64 sampleRate
                  : (double)sampleRate resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [self ensureDenoiserConfigured:^(NSError *initError) {
    if (initError) {
      [self reject:reject withCode:@"denoiser_init_failed" error:initError];
      return;
    }
    NSError *error = nil;
    NSString *result = [self->_denoiser denoiseFromPCMBase64:pcmBase64
                                                  sampleRate:(int32_t)sampleRate
                                                       error:&error];
    if (!result) {
      [self reject:reject withCode:@"denoise_failed" error:error];
      return;
    }
    resolve(result);
  }];
}

// ── SPOOF-01: detectSpoofing (stub) ───────────────────────────────────────────

RCT_EXPORT_METHOD(detectSpoofing
                  : (NSString *)pcmBase64 sampleRate
                  : (double)sampleRate resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  // Stub: returns 0.0 (not a spoof) until anti-spoofing model is available.
  // Sherpa-ONNX v1.12.29 and upstream v1.12.39 do not expose an anti-spoofing
  // API. See RESEARCH.md Pitfall 6 and Open Question 1 for details.
  // Real AASIST integration is deferred to v1.1+ per PROJECT.md Out of Scope.
  resolve(@(0.0));
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
