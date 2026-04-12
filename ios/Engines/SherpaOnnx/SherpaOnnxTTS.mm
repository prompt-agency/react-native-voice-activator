#import "SherpaOnnxTTS.h"
#include "sherpa-onnx/c-api/c-api.h"
#include <stdexcept>

@implementation SherpaOnnxTTS {
  const SherpaOnnxOfflineTts *_tts;
  NSString *_loadedModelPath;
}

- (void)dealloc
{
  [self dispose];
}

- (void)dispose
{
  if (_tts) {
    SherpaOnnxDestroyOfflineTts(_tts);
    _tts = NULL;
    _loadedModelPath = nil;
  }
}

- (BOOL)synthesizeText:(NSString *)text
             modelPath:(NSString *)modelPath
            tokensPath:(NSString *)tokensPath
               dataDir:(NSString *)dataDir
             speakerId:(int32_t)speakerId
                 speed:(float)speed
            noiseScale:(float)noiseScale
           noiseScaleW:(float)noiseScaleW
           lengthScale:(float)lengthScale
               outPath:(NSString **)outPath
                 error:(NSError **)error
{
  // ── Load (or reuse) the TTS engine ────────────────────────────────────────
  if (!_tts || ![_loadedModelPath isEqualToString:modelPath]) {
    if (_tts) {
      SherpaOnnxDestroyOfflineTts(_tts);
      _tts = NULL;
      _loadedModelPath = nil;
    }

    NSFileManager *fm = [NSFileManager defaultManager];
    BOOL modelExists  = [fm fileExistsAtPath:modelPath];
    BOOL tokensExists = [fm fileExistsAtPath:tokensPath];
    BOOL dataDirExists = [fm fileExistsAtPath:dataDir];
    NSDictionary *modelAttrs = modelExists ? [fm attributesOfItemAtPath:modelPath error:nil] : nil;
    NSLog(@"[SherpaOnnxTTS] modelPath=%@ exists=%d size=%lld",
          modelPath, modelExists, [modelAttrs[NSFileSize] longLongValue]);
    NSLog(@"[SherpaOnnxTTS] tokensPath=%@ exists=%d", tokensPath, tokensExists);
    NSLog(@"[SherpaOnnxTTS] dataDir=%@ exists=%d", dataDir, dataDirExists);
    if (dataDirExists) {
      NSArray *dataDirContents = [fm contentsOfDirectoryAtPath:dataDir error:nil];
      NSLog(@"[SherpaOnnxTTS] dataDir contents count=%lu first=%@",
            (unsigned long)dataDirContents.count, dataDirContents.firstObject);
    }

    SherpaOnnxOfflineTtsVitsModelConfig vitsConfig;
    memset(&vitsConfig, 0, sizeof(vitsConfig));
    vitsConfig.model       = [modelPath UTF8String];
    vitsConfig.lexicon     = "";
    vitsConfig.tokens      = [tokensPath UTF8String];
    vitsConfig.data_dir    = [dataDir UTF8String];
    vitsConfig.dict_dir    = "";
    vitsConfig.noise_scale  = noiseScale;
    vitsConfig.noise_scale_w = noiseScaleW;
    vitsConfig.length_scale  = lengthScale;

    SherpaOnnxOfflineTtsModelConfig modelConfig;
    memset(&modelConfig, 0, sizeof(modelConfig));
    modelConfig.vits        = vitsConfig;
    modelConfig.num_threads = 2;
    modelConfig.debug       = 1;  // enable for crash diagnosis
    modelConfig.provider    = "cpu";

    SherpaOnnxOfflineTtsConfig ttsConfig;
    memset(&ttsConfig, 0, sizeof(ttsConfig));
    ttsConfig.model            = modelConfig;
    ttsConfig.max_num_sentences = 1;

    NSLog(@"[SherpaOnnxTTS] calling SherpaOnnxCreateOfflineTts...");
    try {
      _tts = SherpaOnnxCreateOfflineTts(&ttsConfig);
    } catch (const std::exception &e) {
      NSString *msg = [NSString stringWithFormat:@"C++ exception in SherpaOnnxCreateOfflineTts: %s", e.what()];
      NSLog(@"[SherpaOnnxTTS] %@", msg);
      if (error) {
        *error = [NSError errorWithDomain:@"SherpaOnnxTTS" code:-4
                      userInfo:@{NSLocalizedDescriptionKey : msg}];
      }
      return NO;
    } catch (...) {
      NSLog(@"[SherpaOnnxTTS] Unknown C++ exception in SherpaOnnxCreateOfflineTts");
      if (error) {
        *error = [NSError errorWithDomain:@"SherpaOnnxTTS" code:-4
                      userInfo:@{NSLocalizedDescriptionKey :
                                     @"Unknown native exception during TTS engine creation. "
                                     @"Check device console for details."}];
      }
      return NO;
    }
    NSLog(@"[SherpaOnnxTTS] SherpaOnnxCreateOfflineTts returned %s", _tts ? "non-null" : "NULL");

    if (!_tts) {
      if (error) {
        *error = [NSError
            errorWithDomain:@"SherpaOnnxTTS"
                       code:-1
                   userInfo:@{
                     NSLocalizedDescriptionKey :
                         @"Failed to create TTS engine. Verify that modelPath, "
                         @"tokensPath, and dataDir are correct."
                   }];
      }
      return NO;
    }
    _loadedModelPath = [modelPath copy];
    NSLog(@"[SherpaOnnxTTS] engine loaded: %@", modelPath);
  }

  // ── Synthesize ─────────────────────────────────────────────────────────────
  const SherpaOnnxGeneratedAudio *audio = nullptr;
  try {
    audio = SherpaOnnxOfflineTtsGenerate(_tts, [text UTF8String], speakerId, speed);
  } catch (const std::exception &e) {
    NSString *msg = [NSString stringWithFormat:@"C++ exception in SherpaOnnxOfflineTtsGenerate: %s", e.what()];
    NSLog(@"[SherpaOnnxTTS] %@", msg);
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxTTS" code:-5
                    userInfo:@{NSLocalizedDescriptionKey : msg}];
    }
    return NO;
  } catch (...) {
    NSLog(@"[SherpaOnnxTTS] Unknown C++ exception in SherpaOnnxOfflineTtsGenerate");
    if (error) {
      *error = [NSError errorWithDomain:@"SherpaOnnxTTS" code:-5
                    userInfo:@{NSLocalizedDescriptionKey :
                                   @"Unknown native exception during TTS synthesis. "
                                   @"Check device console for details."}];
    }
    return NO;
  }

  if (!audio || audio->n == 0) {
    SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio);
    if (error) {
      *error = [NSError
          errorWithDomain:@"SherpaOnnxTTS"
                     code:-2
                 userInfo:@{NSLocalizedDescriptionKey :
                                @"TTS synthesis produced no audio samples."}];
    }
    return NO;
  }

  // ── Write WAV ──────────────────────────────────────────────────────────────
  NSString *wavPath = [NSTemporaryDirectory()
      stringByAppendingPathComponent:@"sherpa-onnx-tts-output.wav"];

  int32_t wrote = SherpaOnnxWriteWave(
      audio->samples, audio->n, audio->sample_rate, [wavPath UTF8String]);
  SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio);

  if (wrote == 0) {
    if (error) {
      *error = [NSError
          errorWithDomain:@"SherpaOnnxTTS"
                     code:-3
                 userInfo:@{NSLocalizedDescriptionKey :
                                @"Failed to write synthesized audio to temp WAV file."}];
    }
    return NO;
  }

  if (outPath) {
    *outPath = wavPath;
  }
  return YES;
}

@end
