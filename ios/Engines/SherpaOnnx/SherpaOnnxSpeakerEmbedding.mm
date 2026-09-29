#import "SherpaOnnxSpeakerEmbedding.h"
#include "sherpa-onnx/c-api/c-api.h"

/**
 * Validate a decoded embedding against the extractor's dimension.
 *
 * The native SherpaOnnxSpeakerEmbeddingManager* calls read exactly `dim` floats
 * from the pointer they are given and have no length parameter, so a short or
 * corrupted base64 payload from JS would cause a heap over-read. The Android
 * implementation sizes its FloatArray from the actual decoded byte count and is
 * unaffected; this makes iOS equally safe.
 */
static BOOL SherpaValidateEmbeddingLength(NSData *data,
                                          int32_t dim,
                                          NSError *_Nullable *_Nullable error) {
  const NSUInteger required = (NSUInteger)dim * sizeof(float);
  if (data.length == required) {
    return YES;
  }

  if (error) {
    *error = [NSError
        errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                   code:-20
               userInfo:@{
                 NSLocalizedDescriptionKey : [NSString
                     stringWithFormat:@"Embedding is %lu bytes but this model "
                                      @"requires exactly %lu (%d float32 "
                                      @"values). Refusing to read out of bounds.",
                                      (unsigned long)data.length,
                                      (unsigned long)required, dim]
               }];
  }
  return NO;
}

@implementation SherpaOnnxSpeakerEmbedding {
  const SherpaOnnxSpeakerEmbeddingExtractor *_extractor;
  const SherpaOnnxSpeakerEmbeddingManager *_manager;
  NSString *_loadedModelPath;
}

- (void)dealloc
{
  [self dispose];
}

- (void)dispose
{
  if (_manager) {
    SherpaOnnxDestroySpeakerEmbeddingManager(_manager);
    _manager = NULL;
  }
  if (_extractor) {
    SherpaOnnxDestroySpeakerEmbeddingExtractor(_extractor);
    _extractor = NULL;
  }
  _loadedModelPath = nil;
}

// ── Configuration (lazy init / cache) ─────────────────────────────────────────

- (BOOL)configureWithModelPath:(NSString *)modelPath
                    numThreads:(int32_t)numThreads
                         error:(NSError **)error
{
  // Reuse the existing engine if the model path hasn't changed.
  if (_extractor && [_loadedModelPath isEqualToString:modelPath]) {
    return YES;
  }

  // Destroy old instances before creating new ones.
  if (_manager) {
    SherpaOnnxDestroySpeakerEmbeddingManager(_manager);
    _manager = NULL;
  }
  if (_extractor) {
    SherpaOnnxDestroySpeakerEmbeddingExtractor(_extractor);
    _extractor = NULL;
    _loadedModelPath = nil;
  }

  // Build the extractor config.
  SherpaOnnxSpeakerEmbeddingExtractorConfig config;
  memset(&config, 0, sizeof(config));
  config.model = [modelPath UTF8String];
  config.num_threads = numThreads;
  config.debug = 0;
  config.provider = "cpu";

  NSLog(@"[SherpaOnnxSpeakerEmbedding] creating extractor: %@", modelPath);
  _extractor = SherpaOnnxCreateSpeakerEmbeddingExtractor(&config);
  if (!_extractor) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-1
                               userInfo:@{
                                 NSLocalizedDescriptionKey :
                                     @"Failed to create speaker embedding extractor. "
                                     @"Verify that speakerModelPath points to a valid .onnx model file."
                               }];
    }
    return NO;
  }

  // Create the manager with the embedding dimension from the loaded extractor.
  int32_t dim = SherpaOnnxSpeakerEmbeddingExtractorDim(_extractor);
  NSLog(@"[SherpaOnnxSpeakerEmbedding] extractor loaded, dim=%d", dim);

  _manager = SherpaOnnxCreateSpeakerEmbeddingManager(dim);
  if (!_manager) {
    SherpaOnnxDestroySpeakerEmbeddingExtractor(_extractor);
    _extractor = NULL;
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-2
                               userInfo:@{
                                 NSLocalizedDescriptionKey :
                                     @"Failed to create speaker embedding manager."
                               }];
    }
    return NO;
  }

  _loadedModelPath = [modelPath copy];
  return YES;
}

// ── BRIDGE-01: extractEmbeddingFromPCMBase64 ───────────────────────────────────

- (nullable NSString *)extractEmbeddingFromPCMBase64:(NSString *)pcmBase64
                                          sampleRate:(int32_t)sampleRate
                                               error:(NSError **)error
{
  if (!_extractor) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-3
                               userInfo:@{NSLocalizedDescriptionKey : @"Extractor not configured."}];
    }
    return nil;
  }

  // Decode base64 → float32 samples.
  NSData *pcmData = [[NSData alloc] initWithBase64EncodedString:pcmBase64 options:0];
  if (!pcmData || pcmData.length == 0) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-4
                               userInfo:@{NSLocalizedDescriptionKey : @"Invalid base64 PCM data."}];
    }
    return nil;
  }

  const float *samples = (const float *)[pcmData bytes];
  int32_t numSamples = (int32_t)(pcmData.length / sizeof(float));

  // Create stream, feed audio, finalize.
  const SherpaOnnxOnlineStream *stream =
      SherpaOnnxSpeakerEmbeddingExtractorCreateStream(_extractor);
  if (!stream) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-5
                               userInfo:@{NSLocalizedDescriptionKey : @"Failed to create embedding stream."}];
    }
    return nil;
  }

  SherpaOnnxOnlineStreamAcceptWaveform(stream, sampleRate, samples, numSamples);
  SherpaOnnxOnlineStreamInputFinished(stream);

  // Check readiness (~2 seconds of speech required).
  if (SherpaOnnxSpeakerEmbeddingExtractorIsReady(_extractor, stream) == 0) {
    SherpaOnnxDestroyOnlineStream(stream);
    if (error) {
      *error = [NSError
          errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                     code:-6
                 userInfo:@{
                   NSLocalizedDescriptionKey :
                       @"Not enough audio for embedding (need ~2s of speech). "
                       @"Provide more audio samples before extracting an embedding."
                 }];
    }
    return nil;
  }

  // Compute embedding.
  const float *embedding =
      SherpaOnnxSpeakerEmbeddingExtractorComputeEmbedding(_extractor, stream);
  SherpaOnnxDestroyOnlineStream(stream);

  if (!embedding) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-7
                               userInfo:@{NSLocalizedDescriptionKey : @"Failed to compute speaker embedding."}];
    }
    return nil;
  }

  int32_t dim = SherpaOnnxSpeakerEmbeddingExtractorDim(_extractor);
  NSData *embeddingData = [NSData dataWithBytes:embedding length:(NSUInteger)(dim * sizeof(float))];
  SherpaOnnxSpeakerEmbeddingExtractorDestroyEmbedding(embedding);

  return [embeddingData base64EncodedStringWithOptions:0];
}

// ── BRIDGE-02: registerSpeakerWithName ────────────────────────────────────────

- (BOOL)registerSpeakerWithName:(NSString *)name
                embeddingBase64:(NSString *)embeddingBase64
                          error:(NSError **)error
{
  if (!_manager) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-3
                               userInfo:@{NSLocalizedDescriptionKey : @"Manager not configured."}];
    }
    return NO;
  }

  NSData *data = [[NSData alloc] initWithBase64EncodedString:embeddingBase64 options:0];
  if (!data || data.length == 0) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-4
                               userInfo:@{NSLocalizedDescriptionKey : @"Invalid base64 embedding data."}];
    }
    return NO;
  }

  int32_t expectedDim = SherpaOnnxSpeakerEmbeddingExtractorDim(_extractor);
  if (!SherpaValidateEmbeddingLength(data, expectedDim, error)) {
    return NO;
  }

  const float *floats = (const float *)[data bytes];
  int32_t result = SherpaOnnxSpeakerEmbeddingManagerAdd(_manager, [name UTF8String], floats);
  if (result == 0) {
    if (error) {
      *error = [NSError
          errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                     code:-8
                 userInfo:@{
                   NSLocalizedDescriptionKey :
                       @"Failed to register speaker. The name may already exist — "
                       @"use a unique name per enrollment sample, or call clearSpeakers first."
                 }];
    }
    return NO;
  }
  return YES;
}

// ── BRIDGE-03: verifySpeaker ──────────────────────────────────────────────────

- (nullable NSDictionary *)verifySpeaker:(NSString *)name
                         embeddingBase64:(NSString *)embeddingBase64
                               threshold:(float)threshold
                                   error:(NSError **)error
{
  if (!_manager) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-3
                               userInfo:@{NSLocalizedDescriptionKey : @"Manager not configured."}];
    }
    return nil;
  }

  NSData *data = [[NSData alloc] initWithBase64EncodedString:embeddingBase64 options:0];
  if (!data || data.length == 0) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-4
                               userInfo:@{NSLocalizedDescriptionKey : @"Invalid base64 embedding data."}];
    }
    return nil;
  }

  int32_t expectedDim = SherpaOnnxSpeakerEmbeddingExtractorDim(_extractor);
  if (!SherpaValidateEmbeddingLength(data, expectedDim, error)) {
    return nil;
  }

  const float *floats = (const float *)[data bytes];

  // Get the boolean match result.
  // Signature is (manager, name, const float *v, float threshold) — the
  // embedding comes before the threshold, matching GetBestMatches below.
  int32_t matched = SherpaOnnxSpeakerEmbeddingManagerVerify(_manager, [name UTF8String], floats, threshold);

  // Attempt to get a similarity score using GetBestMatches (returns score field).
  float score = 0.0f;
  const SherpaOnnxSpeakerEmbeddingManagerBestMatchesResult *bestMatches =
      SherpaOnnxSpeakerEmbeddingManagerGetBestMatches(_manager, floats, threshold, 1);
  if (bestMatches && bestMatches->matches && bestMatches->count > 0) {
    // Check if the top match is the requested speaker.
    const char *topName = bestMatches->matches[0].name;
    if (topName && strcmp(topName, [name UTF8String]) == 0) {
      score = bestMatches->matches[0].score;
    } else if (matched == 1) {
      // Verify said matched, but GetBestMatches returned a different top name.
      // Fallback: report 1.0 as score since verification passed.
      score = 1.0f;
    }
  } else if (matched == 1) {
    // GetBestMatches found nothing above threshold, but Verify said matched.
    // Fallback score.
    score = 1.0f;
  }
  if (bestMatches) {
    SherpaOnnxSpeakerEmbeddingManagerFreeBestMatches(bestMatches);
  }

  return @{@"matched" : @(matched == 1), @"score" : @(score)};
}

// ── BRIDGE-04: identifySpeaker ────────────────────────────────────────────────

- (nullable NSDictionary *)identifySpeaker:(NSString *)embeddingBase64
                                  threshold:(float)threshold
                                      error:(NSError **)error
{
  if (!_manager) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-3
                               userInfo:@{NSLocalizedDescriptionKey : @"Manager not configured."}];
    }
    return nil;
  }

  NSData *data = [[NSData alloc] initWithBase64EncodedString:embeddingBase64 options:0];
  if (!data || data.length == 0) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxSpeakerEmbedding"
                                   code:-4
                               userInfo:@{NSLocalizedDescriptionKey : @"Invalid base64 embedding data."}];
    }
    return nil;
  }

  int32_t expectedDim = SherpaOnnxSpeakerEmbeddingExtractorDim(_extractor);
  if (!SherpaValidateEmbeddingLength(data, expectedDim, error)) {
    return nil;
  }

  const float *floats = (const float *)[data bytes];

  // Use GetBestMatches (n=1) to get both name and score.
  const SherpaOnnxSpeakerEmbeddingManagerBestMatchesResult *bestMatches =
      SherpaOnnxSpeakerEmbeddingManagerGetBestMatches(_manager, floats, threshold, 1);

  id nameValue = [NSNull null];
  float score = 0.0f;

  if (bestMatches && bestMatches->matches && bestMatches->count > 0) {
    const char *topName = bestMatches->matches[0].name;
    if (topName && strlen(topName) > 0) {
      nameValue = [NSString stringWithUTF8String:topName];
      score = bestMatches->matches[0].score;
    }
  } else {
    // Fallback: use Search which returns the name as a const char*.
    const char *searchResult = SherpaOnnxSpeakerEmbeddingManagerSearch(_manager, floats, threshold);
    if (searchResult && strlen(searchResult) > 0) {
      nameValue = [NSString stringWithUTF8String:searchResult];
      score = 1.0f;  // Score not available from Search; use 1.0 as fallback.
    }
    if (searchResult) {
      SherpaOnnxSpeakerEmbeddingManagerFreeSearch(searchResult);
    }
  }

  if (bestMatches) {
    SherpaOnnxSpeakerEmbeddingManagerFreeBestMatches(bestMatches);
  }

  return @{@"name" : nameValue, @"score" : @(score)};
}

// ── BRIDGE-05: clearSpeakers ──────────────────────────────────────────────────

- (void)clearSpeakers
{
  if (!_manager || !_extractor) {
    return;
  }
  // No explicit "clear all" C API — destroy and recreate.
  SherpaOnnxDestroySpeakerEmbeddingManager(_manager);
  int32_t dim = SherpaOnnxSpeakerEmbeddingExtractorDim(_extractor);
  _manager = SherpaOnnxCreateSpeakerEmbeddingManager(dim);
}

@end
