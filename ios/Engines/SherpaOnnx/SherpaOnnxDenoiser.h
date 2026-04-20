#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Wraps the sherpa-onnx Offline Speech Denoiser C API (GTCRN model).
 *
 * The denoiser instance is lazily created on the first configureWithModelPath:
 * call and cached as long as the model path does not change, avoiding the cost
 * of reloading the ONNX model on every call.
 *
 * THREADING: The caller (VoiceActivator.mm) is responsible for calling
 * configureWithModelPath: on a thread with an 8MB stack to avoid ORT stack
 * overflow during ONNX model loading. See Pitfall 3 in RESEARCH.md.
 *
 * Implements bridge method: BRIDGE-06.
 */
@interface SherpaOnnxDenoiser : NSObject

/**
 * Configure (or reuse) the speech denoiser.
 *
 * If the model path is unchanged and the denoiser is already loaded, this is a
 * no-op (returns YES immediately). Otherwise the existing denoiser is destroyed
 * and recreated with the new model path.
 *
 * MUST be called on a thread with a large stack (≥8 MB) — ONNX model loading
 * via ORT uses deep recursion that overflows the default 512 KB GCD stack.
 *
 * @param modelPath  Absolute path to the GTCRN denoiser .onnx model file.
 * @param numThreads Number of ONNX runtime threads to use (typically 1).
 * @param error      On failure, populated with a descriptive error.
 * @return YES on success, NO on failure.
 */
- (BOOL)configureWithModelPath:(NSString *)modelPath
                    numThreads:(int32_t)numThreads
                         error:(NSError **)error;

/**
 * Denoise base64-encoded float32 PCM audio.
 *
 * PCM samples must be float32 in the range [-1, 1].
 *
 * @param pcmBase64  Base64-encoded float32 PCM samples (little-endian).
 * @param sampleRate Audio sample rate in Hz (e.g., 16000).
 * @param error      On failure, populated with a descriptive error.
 * @return Base64-encoded float32 denoised PCM samples, or nil on failure.
 */
- (nullable NSString *)denoiseFromPCMBase64:(NSString *)pcmBase64
                                 sampleRate:(int32_t)sampleRate
                                      error:(NSError **)error;

/** Release the cached denoiser and free native memory. */
- (void)dispose;

@end

NS_ASSUME_NONNULL_END
