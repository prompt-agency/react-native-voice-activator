#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Single owner of the process-wide AVAudioSession.
 *
 * AVAudioSession is a singleton, and two independent callers were writing it:
 * the wake-word engine set PlayAndRecord/Measurement to listen, while TTS
 * playback set plain Playback — a category with no input — whenever output went
 * to the speaker. Nothing restored the listening category afterwards, so the
 * product's core loop broke: detection running, app speaks a reply, and the
 * wake-word input tap goes silent for as long as playback owns the session. That
 * takes barge-in and the next turn with it.
 *
 * Both concerns now declare an *intent* instead of setting the category
 * directly, and this class derives one configuration from the set of live
 * intents:
 *
 * - While a listening intent is held the category stays PlayAndRecord with the
 *   listening mode, and playback never changes it. Playback still chooses its
 *   output route, which `overrideOutputAudioPort:` does without touching the
 *   category — so the input tap is never torn down mid-detection, and the engine
 *   does not need restarting.
 * - With no listening intent, playback configures the session as it always did.
 * - The session is deactivated only when the last intent is released.
 *
 * Every method must be called from the main thread.
 */
@interface VoiceActivatorAudioSessionController : NSObject

/**
 * Shared instance.
 *
 * Arbitration only works if every caller goes through one object, so the
 * playback layer and the wake-word coordinator must both use this rather than
 * allocating their own.
 */
+ (instancetype)sharedController;

/**
 * Declare that the wake-word engine is listening: PlayAndRecord, measurement
 * mode, speaker default.
 *
 * Idempotent rather than reference counted, because the listening side has
 * exactly one owner (the session coordinator) which calls begin and end
 * unbalanced — several teardown paths end listening, only two start it. A count
 * would drift; a boolean cannot.
 */
- (BOOL)beginListening:(NSError *_Nullable *_Nullable)error;

/** Declare that the engine has stopped. Deactivates only if nothing else needs the session. */
- (void)endListening;

/**
 * Take a playback intent, routed to the earpiece or the speaker.
 *
 * While a listening intent is held this only sets the output route; the category
 * is left alone. Reference counted, balanced by `releasePlayback`.
 */
- (BOOL)acquirePlaybackWithEarpieceOutput:(BOOL)earpieceOutput
                                    error:(NSError *_Nullable *_Nullable)error;

/** Release a playback intent. Deactivates only if no intent remains. */
- (void)releasePlayback;

/** True while a listening intent is held, so playback can avoid downgrading. */
@property(nonatomic, readonly) BOOL isListeningIntentHeld;

- (BOOL)supportsBackgroundAudio;

/** @internal Test/diagnostic seam: drops every intent without touching the session. */
- (void)resetIntentsForTesting;

@end

NS_ASSUME_NONNULL_END
