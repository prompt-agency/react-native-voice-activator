#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Wraps the sherpa-onnx Offline TTS C API for Piper VITS synthesis.
 *
 * The TTS engine instance is lazily created on the first synthesize call and
 * cached as long as the model path does not change, avoiding the cost of
 * reloading the ONNX model on every call.
 *
 * All sherpa-onnx synthesis is blocking — callers must dispatch to a background
 * queue before calling synthesizeText:… and return to the main queue for any
 * UI or playback work.
 */
@interface SherpaOnnxTTS : NSObject

/**
 * Synthesize text into a temporary WAV file.
 *
 * @param text        Input text to synthesize.
 * @param modelPath   Absolute path to the Piper .onnx model file.
 * @param tokensPath  Absolute path to tokens.txt shipped with the model.
 * @param dataDir     Absolute path to the espeak-ng-data/ directory.
 * @param speakerId   Speaker ID; 0 for single-speaker models.
 * @param speed       Playback speed multiplier (1.0 = normal).
 * @param noiseScale  VITS noise_scale — phoneme duration variation (default 0.667).
 * @param noiseScaleW VITS noise_scale_w — pitch variation (default 0.8).
 * @param lengthScale VITS length_scale — base speech rate (default 1.0).
 * @param outPath     On success, set to the absolute path of the generated WAV.
 *                    The caller is responsible for deleting the file after playback.
 * @param error       On failure, populated with a descriptive error.
 * @return YES on success, NO on failure.
 */
- (BOOL)synthesizeText:(NSString *)text
             modelPath:(NSString *)modelPath
            tokensPath:(NSString *)tokensPath
               dataDir:(NSString *)dataDir
             speakerId:(int32_t)speakerId
                 speed:(float)speed
            noiseScale:(float)noiseScale
           noiseScaleW:(float)noiseScaleW
           lengthScale:(float)lengthScale
               outPath:(NSString *_Nullable *_Nullable)outPath
                 error:(NSError **)error;

/** Release the cached TTS engine and free native memory. */
- (void)dispose;

@end

NS_ASSUME_NONNULL_END
