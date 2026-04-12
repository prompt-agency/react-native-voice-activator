#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * AudioSessionManager — TTS audio session route selection and interruption handling.
 *
 * Manages output route preference for TTS playback (speaker / earpiece / bluetooth / default)
 * and observes AVAudioSession interruptions during active playback.
 *
 * Owned by VoiceActivator.mm. Coordinates with AudioPlayback for TTS streaming lifecycle.
 *
 * Does NOT affect the wake word session (PlayAndRecord / Measurement) managed by
 * VoiceActivatorAudioSessionController — those are separate concerns.
 */
@interface AudioSessionManager : NSObject

/** Current desired output route. Defaults to @"default". */
@property (nonatomic, readonly) NSString *desiredRoute;

/**
 * Set the desired output route preference.
 * Valid values: "default", "speaker", "earpiece", "bluetooth".
 * Returns NO and sets error for any other value.
 *
 * This call does NOT immediately apply the override — call applyRouteOverride:
 * after the audio session is active.
 */
- (BOOL)setRoute:(NSString *)route error:(NSError **)error;

/**
 * Apply the stored route preference to the currently active AVAudioSession.
 *
 * Must be called AFTER the session category is set and activated (e.g. after
 * AudioPlayback.startStreamingWithSampleRate returns YES).
 *
 * Route mapping:
 *   "speaker"             → AVAudioSessionPortOverrideSpeaker
 *   "default", "earpiece",
 *   "bluetooth"           → AVAudioSessionPortOverrideNone (system decides)
 *
 * Note: "earpiece" routing requires PlayAndRecord category. In Playback category
 * (used by TTS streaming), earpiece is not accessible; the call succeeds with
 * PortOverrideNone and the system routes to the default output.
 *
 * @return YES on success, NO with error set on failure.
 */
- (BOOL)applyRouteOverride:(NSError **)error;

/**
 * Begin observing AVAudioSessionInterruptionNotification for TTS playback context.
 *
 * The handler fires on the thread that posts the notification (usually main).
 *   - began=YES:  interruption started (phone call, Siri). Stop playback and emit event.
 *   - began=NO:   interruption ended. shouldResume indicates system recommendation.
 *
 * Calling again while already observing replaces the previous handler.
 */
- (void)startObservingInterruptionsWithHandler:(void (^)(BOOL began,
                                                         BOOL shouldResume))handler;

/** Stop observing AVAudioSessionInterruptionNotification and release the observer. */
- (void)stopObservingInterruptions;

@end

NS_ASSUME_NONNULL_END
