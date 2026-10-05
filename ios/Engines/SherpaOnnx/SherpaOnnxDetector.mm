#import "SherpaOnnxDetector.h"

#import "SherpaOnnxAssetLoader.h"

#import <AVFoundation/AVFoundation.h>
#import <cstdlib>
#import <cstring>
#import <dispatch/dispatch.h>

#import "sherpa-onnx/c-api/c-api.h"

#import "SherpaOnnxSensitivity.h"

namespace {
NSError *SherpaError(NSString *message)
{
  return [NSError errorWithDomain:@"VoiceActivator"
                             code:3
                         userInfo:@{NSLocalizedDescriptionKey : message}];
}

void *const kSherpaProcessingQueueKey = (void *)&kSherpaProcessingQueueKey;
}  // namespace

@implementation SherpaOnnxDetector {
  AVAudioEngine *_audioEngine;
  dispatch_queue_t _processingQueue;
  const SherpaOnnxKeywordSpotter *_spotter;
  const SherpaOnnxOnlineStream *_stream;
  BOOL _isRunning;
  BOOL _audioSuspendedForSecondaryCapture;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _audioEngine = [AVAudioEngine new];
    _processingQueue =
        dispatch_queue_create("com.voiceactivator.sherpa-ios", DISPATCH_QUEUE_SERIAL);
    dispatch_queue_set_specific(_processingQueue,
                                kSherpaProcessingQueueKey,
                                kSherpaProcessingQueueKey,
                                nullptr);
  }
  return self;
}

- (void)dealloc
{
  [self dispose];
}

- (BOOL)configureWithAssetPaths:(SherpaOnnxAssetPaths *)assetPaths
                    sensitivity:(double)sensitivity
                          error:(NSError * _Nullable * _Nullable)error
{
  [self flushPendingWork];
  [self releaseSherpaObjects];

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

  _spotter = SherpaOnnxCreateKeywordSpotter(&config);
  if (_spotter == nullptr) {
    if (error != nil) {
      *error = SherpaError(@"Failed to create the bundled Sherpa-ONNX keyword spotter.");
    }
    return NO;
  }

  _stream = SherpaOnnxCreateKeywordStream(_spotter);
  if (_stream == nullptr) {
    [self releaseSherpaObjects];
    if (error != nil) {
      *error = SherpaError(@"Failed to create the Sherpa-ONNX keyword stream.");
    }
    return NO;
  }

  return YES;
}

- (BOOL)start:(NSError * _Nullable * _Nullable)error
{
  if (_spotter == nullptr || _stream == nullptr) {
    if (error != nil) {
      *error = SherpaError(@"Sherpa-ONNX detector must be configured before start().");
    }
    return NO;
  }

  if (_isRunning) {
    return YES;
  }

  AVAudioInputNode *inputNode = _audioEngine.inputNode;
  AVAudioFormat *inputFormat = [inputNode inputFormatForBus:0];
  __weak __typeof(self) weakSelf = self;
  [inputNode removeTapOnBus:0];
  [inputNode installTapOnBus:0
                  bufferSize:1024
                      format:inputFormat
                       block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
                         (void)when;
                         [weakSelf processBuffer:buffer];
                       }];

  [_audioEngine prepare];
  if (![_audioEngine startAndReturnError:error]) {
    [inputNode removeTapOnBus:0];
    return NO;
  }

  _isRunning = YES;
  return YES;
}

- (BOOL)stop:(NSError * _Nullable * _Nullable)error
{
  (void)error;
  if (!_isRunning) {
    _audioSuspendedForSecondaryCapture = NO;
    return YES;
  }

  [_audioEngine.inputNode removeTapOnBus:0];
  [_audioEngine stop];
  _isRunning = NO;
  _audioSuspendedForSecondaryCapture = NO;
  return YES;
}

- (void)pauseAudioInputForSecondaryCapture
{
  if (!_isRunning || _audioSuspendedForSecondaryCapture) {
    return;
  }
  [_audioEngine.inputNode removeTapOnBus:0];
  [_audioEngine stop];
  _isRunning = NO;
  _audioSuspendedForSecondaryCapture = YES;
}

- (BOOL)resumeAudioInputAfterSecondaryCapture:(NSError * _Nullable * _Nullable)error
{
  if (!_audioSuspendedForSecondaryCapture) {
    return YES;
  }

  AVAudioInputNode *inputNode = _audioEngine.inputNode;
  AVAudioFormat *inputFormat = [inputNode inputFormatForBus:0];
  __weak __typeof(self) weakSelf = self;
  [inputNode removeTapOnBus:0];
  [inputNode installTapOnBus:0
                  bufferSize:1024
                      format:inputFormat
                       block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
                         (void)when;
                         [weakSelf processBuffer:buffer];
                       }];

  [_audioEngine prepare];
  if (![_audioEngine startAndReturnError:error]) {
    [inputNode removeTapOnBus:0];
    return NO;
  }

  _isRunning = YES;
  _audioSuspendedForSecondaryCapture = NO;
  return YES;
}

- (void)dispose
{
  [self stop:nil];
  [self flushPendingWork];
  [self releaseSherpaObjects];
}

- (void)flushPendingWork
{
  if (dispatch_get_specific(kSherpaProcessingQueueKey) == kSherpaProcessingQueueKey) {
    return;
  }

  dispatch_sync(_processingQueue, ^{
  });
}

- (void)processBuffer:(AVAudioPCMBuffer *)buffer
{
  // _spotter and _stream are deliberately NOT read here.
  //
  // This runs on the AVAudioEngine tap thread, while configureWithAssetPaths:
  // reassigns both on the caller's thread. Reading them here was a data race on
  // non-atomic pointers, and a reconfigure landing between the check and the
  // dispatch_async below would hand freed pointers to the block. Every access is
  // now confined to _processingQueue, which configureWithAssetPaths: drains via
  // flushPendingWork before releasing anything.
  AVAudioFrameCount frameLength = buffer.frameLength;
  if (frameLength == 0) {
    return;
  }

  float *mono = (float *)calloc(frameLength, sizeof(float));
  if (mono == nullptr) {
    return;
  }

  if (buffer.floatChannelData != nullptr) {
    float *channel = buffer.floatChannelData[0];
    memcpy(mono, channel, sizeof(float) * frameLength);
  } else if (buffer.int16ChannelData != nullptr) {
    int16_t *channel = buffer.int16ChannelData[0];
    for (AVAudioFrameCount i = 0; i < frameLength; ++i) {
      mono[i] = (float)channel[i] / 32768.0f;
    }
  } else {
    free(mono);
    return;
  }

  const int32_t sampleRate = (int32_t)buffer.format.sampleRate;
  dispatch_async(_processingQueue, ^{
    // Checked on the queue that owns these pointers, so a reconfigure cannot
    // land between the check and the use.
    if (self->_spotter == nullptr || self->_stream == nullptr) {
      free(mono);
      return;
    }

    SherpaOnnxOnlineStreamAcceptWaveform(self->_stream, sampleRate, mono, (int32_t)frameLength);
    free(mono);

    while (SherpaOnnxIsKeywordStreamReady(self->_spotter, self->_stream)) {
      SherpaOnnxDecodeKeywordStream(self->_spotter, self->_stream);
    }

    const SherpaOnnxKeywordResult *result =
        SherpaOnnxGetKeywordResult(self->_spotter, self->_stream);
    if (result == nullptr || result->keyword == nullptr || strlen(result->keyword) == 0) {
      if (result != nullptr) {
        SherpaOnnxDestroyKeywordResult(result);
      }
      return;
    }

    NSString *keyword = [NSString stringWithUTF8String:result->keyword];
    SherpaOnnxDestroyKeywordResult(result);
    SherpaOnnxResetKeywordStream(self->_spotter, self->_stream);

    if (keyword.length == 0) {
      return;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
      if (self.detectionHandler != nil) {
        self.detectionHandler(keyword);
      }
    });
  });
}

- (void)releaseSherpaObjects
{
  void (^releaseBlock)(void) = ^{
    if (self->_stream != nullptr) {
      SherpaOnnxDestroyOnlineStream(self->_stream);
      self->_stream = nullptr;
    }

    if (self->_spotter != nullptr) {
      SherpaOnnxDestroyKeywordSpotter(self->_spotter);
      self->_spotter = nullptr;
    }
  };

  if (dispatch_get_specific(kSherpaProcessingQueueKey) == kSherpaProcessingQueueKey) {
    releaseBlock();
    return;
  }

  dispatch_sync(_processingQueue, releaseBlock);
}

@end
