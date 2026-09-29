#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * VADCapture — Captures real-time 16kHz mono PCM frames using AVAudioEngine
 * and delivers them as base64-encoded float32 arrays via the pcmFrameHandler block.
 *
 * One frame = 512 float32 samples (32 ms at 16 kHz).
 * Only active between start and stop — does not capture during wake word detection.
 */
@interface VADCapture : NSObject

/**
 * Called on each 512-sample PCM frame with a base64-encoded float32 buffer.
 * Invoked on an internal audio I/O thread — handler must be thread-safe.
 *
 * Deliberately atomic. The tap block reads this on the audio I/O thread while
 * callers clear it on their own queue; with a nonatomic accessor that read is a
 * bare ivar load, so a concurrent assignment can release the old block while the
 * audio thread still holds the raw pointer. The atomic getter returns a
 * retained, autoreleased value, which the tap block snapshots into a strong
 * local once per callback and calls through for the rest of the callback.
 */
@property (atomic, copy, nullable) void (^pcmFrameHandler)(NSString *base64PCM);

/**
 * Start PCM capture at the given sample rate (should be 16000 Hz for Silero VAD).
 * Returns NO and sets error if AVAudioEngine cannot be started.
 */
- (BOOL)startWithSampleRate:(double)sampleRate error:(NSError *_Nullable *)error;

/** Stop PCM capture and remove the audio tap. */
- (void)stop;

/** Whether capture is currently active. */
@property (nonatomic, readonly, getter=isRunning) BOOL running;

@end

NS_ASSUME_NONNULL_END
