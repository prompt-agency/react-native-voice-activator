#import <Foundation/Foundation.h>

@class SherpaOnnxAssetPaths;

NS_ASSUME_NONNULL_BEGIN

typedef void (^SherpaOnnxDetectionHandler)(NSString *detectedPhrase);
typedef void (^SherpaOnnxErrorHandler)(NSError *error);

@interface SherpaOnnxDetector : NSObject

@property(nonatomic, copy, nullable) SherpaOnnxDetectionHandler detectionHandler;
@property(nonatomic, copy, nullable) SherpaOnnxErrorHandler errorHandler;

- (BOOL)configureWithAssetPaths:(SherpaOnnxAssetPaths *)assetPaths
                    sensitivity:(double)sensitivity
                          error:(NSError * _Nullable * _Nullable)error;
- (BOOL)start:(NSError * _Nullable * _Nullable)error;
- (BOOL)stop:(NSError * _Nullable * _Nullable)error;
/** Stops Sherpa's AVAudioEngine tap while keeping the spotter alive (e.g. for VAD capture). */
- (void)pauseAudioInputForSecondaryCapture;
/** Restores Sherpa's tap/engine after pauseAudioInputForSecondaryCapture. No-op if not suspended. */
- (BOOL)resumeAudioInputAfterSecondaryCapture:(NSError * _Nullable * _Nullable)error;
- (void)dispose;
- (void)flushPendingWork;

@end

NS_ASSUME_NONNULL_END
