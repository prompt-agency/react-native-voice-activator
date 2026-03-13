export const RUNANYWHERE_STT_MODELS = {
  'whisper-tiny-en': {
    registryId: 'sherpa-onnx-whisper-tiny.en',
    url: 'https://github.com/RunanywhereAI/sherpa-onnx/releases/download/runanywhere-models-v1/sherpa-onnx-whisper-tiny.en.tar.gz',
    modelType: 'whisper',
    memoryRequirement: 75_000_000,
  },
} as const;

export const RUNANYWHERE_TTS_MODELS = {
  'piper-en-lessac': {
    registryId: 'vits-piper-en_US-lessac-medium',
    url: 'https://github.com/RunanywhereAI/sherpa-onnx/releases/download/runanywhere-models-v1/vits-piper-en_US-lessac-medium.tar.gz',
    modelType: 'piper',
    memoryRequirement: 65_000_000,
  },
} as const;
