#import "SherpaOnnxOfflineEvaluator.h"

#import "SherpaOnnxAssetLoader.h"

#import <sherpa-onnx/c-api/c-api.h>

#import "SherpaOnnxSensitivity.h"

/** ~64 ms at 16 kHz. Detections are reported at the end of the chunk that
 *  produced them, so a smaller chunk means a tighter offset. */
static const int32_t kEvaluationChunkSamples = 1024;

static NSError *EvaluatorError(NSString *message)
{
  return [NSError errorWithDomain:@"SherpaOnnxOfflineEvaluator"
                             code:-1
                         userInfo:@{NSLocalizedDescriptionKey : message}];
}

@implementation SherpaOnnxOfflineEvaluator

- (nullable NSDictionary *)evaluateWavAtPath:(NSString *)wavPath
                                  assetPaths:(SherpaOnnxAssetPaths *)assetPaths
                                 sensitivity:(double)sensitivity
                                       error:(NSError *_Nullable __autoreleasing *_Nullable)error
{
  const SherpaOnnxWave *wave = SherpaOnnxReadWave(wavPath.UTF8String);
  if (wave == nullptr) {
    if (error) {
      *error = EvaluatorError([NSString
          stringWithFormat:@"Could not read a WAV file at %@.", wavPath]);
    }
    return nil;
  }

  SherpaOnnxKeywordSpotterConfig config;
  memset(&config, 0, sizeof(config));
  config.feat_config.sample_rate = 16000;
  config.feat_config.feature_dim = 80;
  config.model_config.transducer.encoder = assetPaths.encoderPath.UTF8String;
  config.model_config.transducer.decoder = assetPaths.decoderPath.UTF8String;
  config.model_config.transducer.joiner = assetPaths.joinerPath.UTF8String;
  config.model_config.tokens = assetPaths.tokensPath.UTF8String;
  config.model_config.num_threads = 1;
  config.model_config.provider = "cpu";
  config.max_active_paths = 4;
  config.num_trailing_blanks = 1;
  config.keywords_file = assetPaths.keywordsPath.UTF8String;
  // The keywords file is pre-tokenized by src/internal/keyword-tokenizer.ts, so
  // modeling_unit and bpe_vocab stay unset. Setting them does NOT make
  // sherpa-onnx tokenize plain text: it exits the process instead. See
  // https://github.com/prompt-agency/react-native-voice-activator/issues/31.
  config.keywords_score = 1.0f;
  config.keywords_threshold = SherpaThresholdFromSensitivity(sensitivity);

  const SherpaOnnxKeywordSpotter *spotter = SherpaOnnxCreateKeywordSpotter(&config);
  if (spotter == nullptr) {
    SherpaOnnxFreeWave(wave);
    if (error) {
      *error = EvaluatorError(@"Failed to create a keyword spotter for evaluation.");
    }
    return nil;
  }

  const SherpaOnnxOnlineStream *stream = SherpaOnnxCreateKeywordStream(spotter);
  if (stream == nullptr) {
    SherpaOnnxDestroyKeywordSpotter(spotter);
    SherpaOnnxFreeWave(wave);
    if (error) {
      *error = EvaluatorError(@"Failed to create a keyword stream for evaluation.");
    }
    return nil;
  }

  NSMutableArray<NSDictionary *> *detections = [NSMutableArray array];

  for (int32_t offset = 0; offset < wave->num_samples; offset += kEvaluationChunkSamples) {
    const int32_t remaining = wave->num_samples - offset;
    const int32_t count =
        remaining < kEvaluationChunkSamples ? remaining : kEvaluationChunkSamples;

    SherpaOnnxOnlineStreamAcceptWaveform(stream, wave->sample_rate,
                                         wave->samples + offset, count);

    while (SherpaOnnxIsKeywordStreamReady(spotter, stream)) {
      SherpaOnnxDecodeKeywordStream(spotter, stream);
    }

    const SherpaOnnxKeywordResult *result = SherpaOnnxGetKeywordResult(spotter, stream);
    if (result == nullptr) {
      continue;
    }

    if (result->keyword != nullptr && strlen(result->keyword) > 0) {
      const double atMs = (offset + count) * 1000.0 / (double)wave->sample_rate;
      [detections addObject:@{
        @"keyword" : [NSString stringWithUTF8String:result->keyword],
        @"atMs" : @(atMs),
      }];
      SherpaOnnxDestroyKeywordResult(result);
      SherpaOnnxResetKeywordStream(spotter, stream);
      continue;
    }

    SherpaOnnxDestroyKeywordResult(result);
  }

  NSDictionary *payload = @{
    @"detections" : [detections copy],
    @"durationMs" : @(wave->num_samples * 1000.0 / (double)wave->sample_rate),
    @"sampleRate" : @(wave->sample_rate),
  };

  SherpaOnnxDestroyOnlineStream(stream);
  SherpaOnnxDestroyKeywordSpotter(spotter);
  SherpaOnnxFreeWave(wave);

  return payload;
}

@end
