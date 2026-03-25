#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * AudioPlayback — Streaming PCM ring-buffer playback + WAV file playback.
 *
 * Used by Epic 11 (Custom TTS) to play synthesised audio on device.
 * PCM float32 chunks are fed via base64 strings (bridge-safe transport),
 * decoded, and scheduled on AVAudioPlayerNode for low-latency output.
 *
 * Audio ducking: activates AVAudioSessionCategoryOptionDuckOthers when
 * streaming starts; restores session on stop.
 *
 * NOTE: iOS audio routing and session management is expanded in Story 11-3
 * (AudioSessionManager). This class only manages the playback category locally.
 */
@interface AudioPlayback : NSObject

/**
 * Start the streaming engine at the given sample rate.
 * Creates AVAudioEngine + AVAudioPlayerNode and activates audio session with
 * DuckOthers option. Idempotent — calling again while streaming is a no-op.
 *
 * @param sampleRate PCM sample rate in Hz (e.g. 22050 for Piper TTS output)
 * @param error       Set on failure; streaming will NOT start in that case
 * @return YES on success
 */
- (BOOL)startStreamingWithSampleRate:(double)sampleRate error:(NSError **)error;

/**
 * Feed a chunk of PCM float32 audio for playback.
 * Decodes the base64 string → raw bytes → AVAudioPCMBuffer and schedules it
 * on the player node. Thread-safe: may be called from any thread.
 *
 * @param pcmBase64 Base64-encoded little-endian float32 PCM data
 */
- (void)writeChunkFromBase64:(NSString *)pcmBase64;

/**
 * Stop all playback: stops any WAV `AVAudioPlayer`, then stops the streaming
 * engine if active, and deactivates the audio session when this layer owns it
 * (restores ducked audio).
 */
- (void)stopStreaming;

/**
 * Play a WAV file to completion asynchronously.
 * Uses a dedicated AVAudioPlayer instance. Calls completion on the main queue.
 *
 * @param filePath   Absolute local file path
 * @param completion Called with nil on success, NSError on failure
 */
- (void)playWavFile:(NSString *)filePath
         completion:(void (^)(NSError *_Nullable))completion;

/** YES while the streaming engine is running. */
@property (nonatomic, readonly, getter=isStreaming) BOOL streaming;

@end

NS_ASSUME_NONNULL_END
