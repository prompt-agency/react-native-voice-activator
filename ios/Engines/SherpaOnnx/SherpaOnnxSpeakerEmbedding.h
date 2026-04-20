#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Wraps the sherpa-onnx Speaker Embedding Extractor and Manager C APIs.
 *
 * The extractor and manager instances are lazily created on the first
 * configureWithModelPath: call and cached as long as the model path does not
 * change, avoiding the cost of reloading the ONNX model on every call.
 *
 * THREADING: The caller (VoiceActivator.mm) is responsible for calling
 * configureWithModelPath: on a thread with an 8MB stack to avoid ORT stack
 * overflow during ONNX model loading. See Pitfall 3 in RESEARCH.md.
 *
 * Implements bridge methods: BRIDGE-01 through BRIDGE-05.
 */
@interface SherpaOnnxSpeakerEmbedding : NSObject

/**
 * Configure (or reuse) the speaker embedding extractor and manager.
 *
 * If the model path is unchanged and the extractor is already loaded, this is a
 * no-op (returns YES immediately). Otherwise the existing extractor and manager
 * are destroyed and recreated with the new model path.
 *
 * MUST be called on a thread with a large stack (≥8 MB) — ONNX model loading
 * via ORT uses deep recursion that overflows the default 512 KB GCD stack.
 *
 * @param modelPath  Absolute path to the speaker embedding .onnx model file.
 * @param numThreads Number of ONNX runtime threads to use (typically 1).
 * @param error      On failure, populated with a descriptive error.
 * @return YES on success, NO on failure.
 */
- (BOOL)configureWithModelPath:(NSString *)modelPath
                    numThreads:(int32_t)numThreads
                         error:(NSError **)error;

/**
 * Extract a speaker embedding from base64-encoded float32 PCM audio.
 *
 * PCM samples must be float32 in the range [-1, 1]. Approximately 2 seconds
 * of speech is required for the extractor to be ready.
 *
 * @param pcmBase64  Base64-encoded float32 PCM samples (little-endian).
 * @param sampleRate Audio sample rate in Hz (e.g., 16000).
 * @param error      On failure, populated with a descriptive error.
 * @return Base64-encoded float32 embedding vector, or nil on failure.
 */
- (nullable NSString *)extractEmbeddingFromPCMBase64:(NSString *)pcmBase64
                                          sampleRate:(int32_t)sampleRate
                                               error:(NSError **)error;

/**
 * Register a speaker with the in-memory speaker manager.
 *
 * @param name           Unique speaker name for this enrollment sample.
 * @param embeddingBase64 Base64-encoded float32 embedding (from extractEmbeddingFromPCMBase64).
 * @param error          On failure, populated with a descriptive error.
 * @return YES on success, NO if the name is already registered or on failure.
 */
- (BOOL)registerSpeakerWithName:(NSString *)name
                embeddingBase64:(NSString *)embeddingBase64
                          error:(NSError **)error;

/**
 * Verify whether a speaker embedding matches a registered speaker.
 *
 * Returns a dictionary with keys:
 *   - "matched" (NSNumber<BOOL>): YES if the embedding matches within threshold.
 *   - "score" (NSNumber<float>): Similarity score (0.0–1.0); 1.0 if matched and
 *     the exact score is unavailable from the C API, 0.0 if not matched.
 *
 * @param name           Registered speaker name to verify against.
 * @param embeddingBase64 Base64-encoded float32 embedding to test.
 * @param threshold      Similarity threshold (0.0–1.0; higher = stricter).
 * @param error          On failure, populated with a descriptive error.
 * @return Result dictionary, or nil on failure.
 */
- (nullable NSDictionary *)verifySpeaker:(NSString *)name
                         embeddingBase64:(NSString *)embeddingBase64
                               threshold:(float)threshold
                                   error:(NSError **)error;

/**
 * Identify the best-matching registered speaker for a given embedding.
 *
 * Returns a dictionary with keys:
 *   - "name" (NSString or NSNull): Best matching speaker name, or NSNull if no
 *     speaker exceeds the threshold.
 *   - "score" (NSNumber<float>): Similarity score of the best match (0.0–1.0).
 *
 * @param embeddingBase64 Base64-encoded float32 embedding to identify.
 * @param threshold       Similarity threshold (0.0–1.0).
 * @param error           On failure, populated with a descriptive error.
 * @return Result dictionary, or nil on failure.
 */
- (nullable NSDictionary *)identifySpeaker:(NSString *)embeddingBase64
                                  threshold:(float)threshold
                                      error:(NSError **)error;

/**
 * Clear all registered speakers from the in-memory manager.
 *
 * Implemented via destroy-and-recreate (no explicit "clear all" C API exists).
 * Has no effect if the extractor has not been configured.
 */
- (void)clearSpeakers;

/** Release the cached extractor and manager and free native memory. */
- (void)dispose;

@end

NS_ASSUME_NONNULL_END
