#import "SherpaOnnxDenoiser.h"
#include "sherpa-onnx/c-api/c-api.h"

@implementation SherpaOnnxDenoiser {
  const SherpaOnnxOfflineSpeechDenoiser *_denoiser;
  NSString *_loadedModelPath;
}

- (void)dealloc
{
  [self dispose];
}

- (void)dispose
{
  if (_denoiser) {
    SherpaOnnxDestroyOfflineSpeechDenoiser(_denoiser);
    _denoiser = NULL;
    _loadedModelPath = nil;
  }
}

// ── Configuration (lazy init / cache) ─────────────────────────────────────────

- (BOOL)configureWithModelPath:(NSString *)modelPath
                    numThreads:(int32_t)numThreads
                         error:(NSError **)error
{
  // Reuse the existing engine if the model path hasn't changed.
  if (_denoiser && [_loadedModelPath isEqualToString:modelPath]) {
    return YES;
  }

  // Destroy old instance before creating a new one.
  if (_denoiser) {
    SherpaOnnxDestroyOfflineSpeechDenoiser(_denoiser);
    _denoiser = NULL;
    _loadedModelPath = nil;
  }

  // Build the denoiser config.
  SherpaOnnxOfflineSpeechDenoiserGtcrnModelConfig gtcrnConfig;
  memset(&gtcrnConfig, 0, sizeof(gtcrnConfig));
  gtcrnConfig.model = [modelPath UTF8String];

  SherpaOnnxOfflineSpeechDenoiserModelConfig modelConfig;
  memset(&modelConfig, 0, sizeof(modelConfig));
  modelConfig.gtcrn = gtcrnConfig;
  modelConfig.num_threads = numThreads;
  modelConfig.debug = 0;
  modelConfig.provider = "cpu";

  SherpaOnnxOfflineSpeechDenoiserConfig denoiserConfig;
  memset(&denoiserConfig, 0, sizeof(denoiserConfig));
  denoiserConfig.model = modelConfig;

  NSLog(@"[SherpaOnnxDenoiser] creating denoiser: %@", modelPath);
  _denoiser = SherpaOnnxCreateOfflineSpeechDenoiser(&denoiserConfig);
  if (!_denoiser) {
    if (error) {
      *error = [NSError
          errorWithDomain:@"SherpaOnnxDenoiser"
                     code:-1
                 userInfo:@{
                   NSLocalizedDescriptionKey :
                       @"Failed to create speech denoiser. "
                       @"Verify that denoiserModelPath points to a valid GTCRN .onnx model file."
                 }];
    }
    return NO;
  }

  _loadedModelPath = [modelPath copy];
  NSLog(@"[SherpaOnnxDenoiser] denoiser loaded: %@", modelPath);
  return YES;
}

// ── BRIDGE-06: denoiseFromPCMBase64 ───────────────────────────────────────────

- (nullable NSString *)denoiseFromPCMBase64:(NSString *)pcmBase64
                                 sampleRate:(int32_t)sampleRate
                                      error:(NSError **)error
{
  if (!_denoiser) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxDenoiser"
                                   code:-2
                               userInfo:@{NSLocalizedDescriptionKey : @"Denoiser not configured."}];
    }
    return nil;
  }

  // Decode base64 → float32 samples.
  NSData *pcmData = [[NSData alloc] initWithBase64EncodedString:pcmBase64 options:0];
  if (!pcmData || pcmData.length == 0) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxDenoiser"
                                   code:-3
                               userInfo:@{NSLocalizedDescriptionKey : @"Invalid base64 PCM data."}];
    }
    return nil;
  }

  const float *samples = (const float *)[pcmData bytes];
  int32_t numSamples = (int32_t)(pcmData.length / sizeof(float));

  // Run denoising.
  const SherpaOnnxDenoisedAudio *result =
      SherpaOnnxOfflineSpeechDenoiserRun(_denoiser, samples, numSamples, sampleRate);

  if (!result) {
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxDenoiser"
                                   code:-4
                               userInfo:@{NSLocalizedDescriptionKey : @"Speech denoising failed."}];
    }
    return nil;
  }

  if (result->n == 0 || !result->samples) {
    SherpaOnnxDestroyDenoisedAudio(result);
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxDenoiser"
                                   code:-5
                               userInfo:@{NSLocalizedDescriptionKey : @"Denoiser returned no samples."}];
    }
    return nil;
  }

  // Encode denoised samples to base64.
  NSData *denoisedData =
      [NSData dataWithBytes:result->samples length:(NSUInteger)(result->n * sizeof(float))];
  SherpaOnnxDestroyDenoisedAudio(result);

  return [denoisedData base64EncodedStringWithOptions:0];
}

@end
