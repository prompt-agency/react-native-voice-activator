#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface SherpaOnnxAssetPaths : NSObject

@property(nonatomic, copy) NSString *encoderPath;
@property(nonatomic, copy) NSString *decoderPath;
@property(nonatomic, copy) NSString *joinerPath;
@property(nonatomic, copy) NSString *tokensPath;
@property(nonatomic, copy) NSString *keywordsPath;
/// Path to bpe.model when the keywords file holds plain text rather than
/// pre-tokenized BPE output. nil for the bundled, already-tokenized presets.
@property(nonatomic, copy, nullable) NSString *bpeVocabPath;

- (instancetype)initWithEncoderPath:(NSString *)encoderPath
                        decoderPath:(NSString *)decoderPath
                         joinerPath:(NSString *)joinerPath
                         tokensPath:(NSString *)tokensPath
                       keywordsPath:(NSString *)keywordsPath
                       bpeVocabPath:(nullable NSString *)bpeVocabPath;

@end

@interface SherpaOnnxAssetLoader : NSObject

- (nullable SherpaOnnxAssetPaths *)loadAssetPathsWithModelAssetKey:(nullable NSString *)modelAssetKey
                                                   keywordAssetKey:(nullable NSString *)keywordAssetKey
                                                  rawTextKeywords:(BOOL)rawTextKeywords
                                                             error:(NSError * _Nullable * _Nullable)error;

@end

NS_ASSUME_NONNULL_END
