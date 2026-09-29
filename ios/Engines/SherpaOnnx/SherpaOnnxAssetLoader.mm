#import "SherpaOnnxAssetLoader.h"

namespace {
NSString *const kAssetRoot =
    @"SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01";
NSString *const kTokens = @"tokens.txt";

NSArray<NSString *> *SherpaCandidateFiles(NSString *prefix)
{
  return @[
    [NSString stringWithFormat:@"%@.onnx", prefix],
    [NSString stringWithFormat:@"%@-epoch-12-avg-2-chunk-16-left-64.int8.onnx", prefix],
    [NSString stringWithFormat:@"%@-epoch-12-avg-2-chunk-16-left-64.onnx", prefix]
  ];
}

NSError *SherpaAssetError(NSString *message)
{
  return [NSError errorWithDomain:@"VoiceActivator"
                             code:2
                         userInfo:@{NSLocalizedDescriptionKey : message}];
}
}

@implementation SherpaOnnxAssetPaths

- (instancetype)initWithEncoderPath:(NSString *)encoderPath
                        decoderPath:(NSString *)decoderPath
                         joinerPath:(NSString *)joinerPath
                         tokensPath:(NSString *)tokensPath
                       keywordsPath:(NSString *)keywordsPath
                       bpeVocabPath:(nullable NSString *)bpeVocabPath
{
  self = [super init];
  if (self) {
    _encoderPath = [encoderPath copy];
    _decoderPath = [decoderPath copy];
    _joinerPath = [joinerPath copy];
    _tokensPath = [tokensPath copy];
    _keywordsPath = [keywordsPath copy];
    _bpeVocabPath = [bpeVocabPath copy];
  }
  return self;
}

@end

@implementation SherpaOnnxAssetLoader

- (nullable NSString *)resolvePathForAsset:(NSString *)assetName
                                  rootPath:(NSString *)rootPath
                              bundleSearch:(BOOL)bundleSearch
                                     error:(NSError * _Nullable * _Nullable)error
{
  NSFileManager *fileManager = [NSFileManager defaultManager];

  if ([assetName hasPrefix:@"/"] && [fileManager fileExistsAtPath:assetName]) {
    return assetName;
  }

  NSURL *assetURL = [NSURL URLWithString:assetName];
  if ([assetURL isFileURL] && [fileManager fileExistsAtPath:assetURL.path]) {
    return assetURL.path;
  }

  NSString *directPath = [rootPath stringByAppendingPathComponent:assetName];
  if ([fileManager fileExistsAtPath:directPath]) {
    return directPath;
  }

  if (!bundleSearch) {
    if (error != nil) {
      *error = SherpaAssetError(
          [NSString stringWithFormat:@"Missing Sherpa-ONNX asset at path: %@", directPath]);
    }
    return nil;
  }

  NSString *foundPath =
      [[NSBundle mainBundle] pathForResource:assetName ofType:nil inDirectory:rootPath];
  if (foundPath != nil) {
    return foundPath;
  }

  NSArray<NSURL *> *matches =
      [[NSBundle mainBundle] URLsForResourcesWithExtension:nil subdirectory:rootPath];
  for (NSURL *candidateURL in matches) {
    if ([candidateURL.lastPathComponent isEqualToString:assetName]) {
      return candidateURL.path;
    }
  }

  if (error != nil) {
    *error = SherpaAssetError(
        [NSString stringWithFormat:@"Missing bundled Sherpa-ONNX asset named %@ in %@",
                                   assetName,
                                   rootPath]);
  }

  return nil;
}

- (nullable NSString *)resolveModelPathForPrefix:(NSString *)prefix
                                        rootPath:(NSString *)rootPath
                                    bundleSearch:(BOOL)bundleSearch
                                           error:(NSError * _Nullable * _Nullable)error
{
  for (NSString *candidate in SherpaCandidateFiles(prefix)) {
    NSError *candidateError = nil;
    NSString *resolved = [self resolvePathForAsset:candidate
                                          rootPath:rootPath
                                      bundleSearch:bundleSearch
                                             error:&candidateError];
    if (resolved != nil) {
      return resolved;
    }
  }

  if (error != nil) {
    *error = SherpaAssetError(
        [NSString stringWithFormat:@"Missing bundled Sherpa-ONNX %@ model in %@",
                                   prefix,
                                   rootPath]);
  }
  return nil;
}

- (nullable SherpaOnnxAssetPaths *)loadAssetPathsWithModelAssetKey:(nullable NSString *)modelAssetKey
                                                   keywordAssetKey:(nullable NSString *)keywordAssetKey
                                                  rawTextKeywords:(BOOL)rawTextKeywords
                                                             error:(NSError * _Nullable * _Nullable)error
{
  // Only a TRAILING slash is noise. A leading slash is load-bearing: it is what
  // marks the key as an absolute filesystem path rather than a directory inside
  // the app bundle, and the on-demand model bundle is always absolute (see
  // src/public/voice-activator.ts, which passes the downloaded directory
  // through as modelAssetKey). Trimming both ends, as this used to, silently
  // reclassified every downloaded bundle as a bundle-relative path and made the
  // default flow fail with "Missing bundled Sherpa-ONNX encoder model in
  // var/mobile/...". Mirrors normalizeAssetRoot in the Android loader.
  NSString *trimmedModelAssetKey = [modelAssetKey
      stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  while (trimmedModelAssetKey.length > 1 && [trimmedModelAssetKey hasSuffix:@"/"]) {
    trimmedModelAssetKey =
        [trimmedModelAssetKey substringToIndex:trimmedModelAssetKey.length - 1];
  }
  NSString *modelRoot = trimmedModelAssetKey.length > 0 ? trimmedModelAssetKey : kAssetRoot;
  BOOL bundleSearch = ![modelRoot hasPrefix:@"/"] && ![modelRoot hasPrefix:@"file://"];
  if (!bundleSearch) {
    NSURL *modelRootURL = [NSURL URLWithString:modelRoot];
    if ([modelRootURL isFileURL]) {
      modelRoot = modelRootURL.path;
    }
  }

  NSString *encoderPath = [self resolveModelPathForPrefix:@"encoder"
                                                 rootPath:modelRoot
                                             bundleSearch:bundleSearch
                                                    error:error];
  if (encoderPath == nil) {
    return nil;
  }

  NSString *decoderPath = [self resolveModelPathForPrefix:@"decoder"
                                                 rootPath:modelRoot
                                             bundleSearch:bundleSearch
                                                    error:error];
  if (decoderPath == nil) {
    return nil;
  }

  NSString *joinerPath = [self resolveModelPathForPrefix:@"joiner"
                                                rootPath:modelRoot
                                            bundleSearch:bundleSearch
                                                   error:error];
  if (joinerPath == nil) {
    return nil;
  }

  NSString *tokensPath = [self resolvePathForAsset:kTokens
                                          rootPath:modelRoot
                                      bundleSearch:bundleSearch
                                             error:error];
  if (tokensPath == nil) {
    return nil;
  }

  NSString *trimmedKeywordAssetKey =
      [keywordAssetKey stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  NSString *keywordAssetName = trimmedKeywordAssetKey.length > 0 ? trimmedKeywordAssetKey : @"keywords.txt";
  NSString *keywordRoot = modelRoot;
  BOOL keywordBundleSearch = bundleSearch;
  if ([keywordAssetName containsString:@"/"] &&
      ![keywordAssetName hasPrefix:@"/"] &&
      ![keywordAssetName hasPrefix:@"file://"]) {
    keywordRoot = @"";
  }

  NSString *keywordsPath = [self resolvePathForAsset:keywordAssetName
                                            rootPath:keywordRoot
                                        bundleSearch:keywordBundleSearch
                                               error:error];
  if (keywordsPath == nil) {
    return nil;
  }

  // A generated wakePhrase keywords file is plain text, so sherpa-onnx needs
  // bpe.model to tokenize it. The bundled presets are already tokenized and must
  // not go through that path, hence the explicit flag rather than always loading
  // the vocabulary when it happens to be present.
  NSString *bpeVocabPath = nil;
  if (rawTextKeywords) {
    bpeVocabPath = [self resolvePathForAsset:@"bpe.model"
                                    rootPath:modelRoot
                                bundleSearch:bundleSearch
                                       error:error];
    if (bpeVocabPath == nil) {
      return nil;
    }
  }

  return [[SherpaOnnxAssetPaths alloc] initWithEncoderPath:encoderPath
                                               decoderPath:decoderPath
                                                joinerPath:joinerPath
                                                tokensPath:tokensPath
                                              keywordsPath:keywordsPath
                                              bpeVocabPath:bpeVocabPath];
}

@end
