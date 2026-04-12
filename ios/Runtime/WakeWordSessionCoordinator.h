#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^VoiceActivatorWakeWordDetectedHandler)(NSDictionary *payload);
typedef void (^VoiceActivatorRuntimeStatusHandler)(NSDictionary *status);
typedef void (^VoiceActivatorRuntimeErrorHandler)(NSDictionary *error);
typedef void (^VoiceActivatorInterruptionEventHandler)(NSDictionary *payload);
typedef void (^VoiceActivatorAudioRouteChangedHandler)(NSDictionary *payload);

@interface WakeWordSessionCoordinator : NSObject

@property(nonatomic, copy, nullable) VoiceActivatorWakeWordDetectedHandler
    wakeWordDetectedHandler;
@property(nonatomic, copy, nullable) VoiceActivatorRuntimeStatusHandler
    runtimeStatusHandler;
@property(nonatomic, copy, nullable) VoiceActivatorRuntimeErrorHandler
    runtimeErrorHandler;
@property(nonatomic, copy, nullable) VoiceActivatorInterruptionEventHandler
    interruptionHandler;
@property(nonatomic, copy, nullable) VoiceActivatorAudioRouteChangedHandler
    audioRouteChangedHandler;

- (NSDictionary *)currentStatus;
- (BOOL)initializeWithOptions:(NSDictionary *)options
                        error:(NSError * _Nullable * _Nullable)error;
- (BOOL)startDetection:(NSError * _Nullable * _Nullable)error;
- (BOOL)stopDetection:(NSError * _Nullable * _Nullable)error;
- (BOOL)dispose:(NSError * _Nullable * _Nullable)error;

/** Pauses Sherpa microphone tap so another AVAudioEngine (VAD) can capture. Safe if detection is off. */
- (void)pauseWakeWordAudioForSecondaryCapture;
/** Restores Sherpa tap after VAD capture stops. No-op if Sherpa was not suspended for secondary capture. */
- (BOOL)resumeWakeWordAudioAfterSecondaryCapture:(NSError * _Nullable * _Nullable)error;

@end

NS_ASSUME_NONNULL_END
