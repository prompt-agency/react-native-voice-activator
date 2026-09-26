#import <Foundation/Foundation.h>

@class SherpaOnnxAssetPaths;

NS_ASSUME_NONNULL_BEGIN

/**
 * Offline evaluation of the keyword spotter against a WAV file.
 *
 * This is what makes detection rate and false-accepts-per-hour measurable without
 * an acoustic rig. It bypasses the microphone, the audio session and the hardware
 * front-end, so it is NOT a substitute for playing audio at a device — but it
 * produces the same numbers against a fixed corpus, reproducibly, which acoustic
 * runs cannot.
 *
 * Deliberately independent of SherpaOnnxDetector: that class owns an
 * AVAudioEngine tap and the live detection session, and an evaluation pass must
 * not disturb either. A sensitivity sweep runs many passes and would otherwise
 * tear the running engine down repeatedly.
 */
@interface SherpaOnnxOfflineEvaluator : NSObject

/**
 * Feed the whole file through a fresh spotter.
 *
 * Returns `@{ @"detections": @[ @{ @"keyword": …, @"atMs": … } ],
 *             @"durationMs": …, @"sampleRate": … }`, or nil on failure.
 */
- (nullable NSDictionary *)evaluateWavAtPath:(NSString *)wavPath
                                  assetPaths:(SherpaOnnxAssetPaths *)assetPaths
                                 sensitivity:(double)sensitivity
                                       error:(NSError *_Nullable *_Nullable)error;

@end

NS_ASSUME_NONNULL_END
