import type {
  RunAnywhereSTTConfig,
  RunAnywhereTTSConfig,
  SpeechToTextProvider,
  TextToSpeechProvider,
  TTSOptions,
  TranscriptionResult,
  WakeWordDetectedEvent,
} from 'react-native-voice-activator';
import {
  ModelCategory,
  RunAnywhere,
  SDKEnvironment,
  type RunAnywhereDownloadProgress,
} from '@runanywhere/core';
import { ModelArtifactType, ONNX } from '@runanywhere/onnx';

type DetectionGetter = () => WakeWordDetectedEvent | null;

type ReferenceTranscribeContext = {
  detection: WakeWordDetectedEvent | null;
};

type ReferenceSpeakContext = {
  text: string;
  options?: TTSOptions;
};

export type ReferenceSttBridge = {
  transcribe(context: ReferenceTranscribeContext): Promise<TranscriptionResult>;
  cancel(): Promise<void>;
};

export type ReferenceTtsBridge = {
  speak(context: ReferenceSpeakContext): Promise<void>;
  stop(): Promise<void>;
};

export type ReferenceProviderEntry = {
  id: string;
  label: string;
  packageName: string;
  docsPath: string;
  summary: string;
};

type RunAnywhereModelDefinition = {
  id: string;
  name: string;
  url: string;
  memoryRequirement: number;
  modelType: string;
};

type RunAnywherePreparedOptions = {
  builtInSTT?: RunAnywhereSTTConfig;
  builtInTTS?: RunAnywhereTTSConfig;
};

type PrepareRunAnywhereOptions = {
  includeSTT?: boolean;
  includeTTS?: boolean;
};

export type RunAnywherePreparationUpdate = {
  message: string;
  progress?: number;
};

export const referenceProviderCatalog: ReferenceProviderEntry[] = [
  {
    id: 'expo-speech-recognition',
    label: 'ExpoSpeechRecognitionReferenceSttProvider',
    packageName: 'expo-speech-recognition',
    docsPath: 'docs/examples/expo-speech-recognition-stt-provider.md',
    summary:
      'Expo-oriented STT adapter pattern that stays application-owned and plugs into initialize({ sttProvider }).',
  },
  {
    id: 'expo-speech',
    label: 'ExpoSpeechReferenceTtsProvider',
    packageName: 'expo-speech',
    docsPath: 'docs/examples/expo-speech-tts-provider.md',
    summary:
      'Expo-oriented TTS adapter pattern that stays application-owned and plugs into initialize({ ttsProvider, autoSpeak: true }).',
  },
  {
    id: 'runanywhere-onnx',
    label: 'RunAnywhereBuiltInProvider',
    packageName: '@runanywhere/onnx',
    docsPath: 'docs/examples/runanywhere-stt-tts-provider.md',
    summary:
      'Built-in on-device STT and TTS backed by RunAnywhere ONNX. Configure builtInSTT / builtInTTS during initialize() when real model paths are available.',
  },
];

export const RUNANYWHERE_CONFIG: {
  stt: (RunAnywhereSTTConfig & RunAnywhereModelDefinition) | null;
  tts: (RunAnywhereTTSConfig & RunAnywhereModelDefinition) | null;
} = {
  stt: {
    id: 'sherpa-onnx-whisper-tiny.en',
    name: 'Sherpa Whisper Tiny (English)',
    url: 'https://github.com/RunanywhereAI/sherpa-onnx/releases/download/runanywhere-models-v1/sherpa-onnx-whisper-tiny.en.tar.gz',
    modelPath: '',
    modelType: 'whisper',
    memoryRequirement: 75_000_000,
    maxRecordingMs: 10_000,
  },
  tts: {
    id: 'vits-piper-en_US-lessac-medium',
    name: 'Piper TTS (US English Lessac Medium)',
    url: 'https://github.com/RunanywhereAI/sherpa-onnx/releases/download/runanywhere-models-v1/vits-piper-en_US-lessac-medium.tar.gz',
    modelPath: '',
    modelType: 'piper',
    memoryRequirement: 65_000_000,
    voice: undefined,
    rate: undefined,
    pitch: undefined,
  },
};

export function getRunAnywhereAvailability(): {
  stt: boolean;
  tts: boolean;
} {
  return {
    stt: RUNANYWHERE_CONFIG.stt !== null,
    tts: RUNANYWHERE_CONFIG.tts !== null,
  };
}

async function ensureRunAnywhereInitialized(): Promise<void> {
  if (!RunAnywhere.isSDKInitialized) {
    await RunAnywhere.initialize({
      environment: SDKEnvironment.Development,
    });
  }

  ONNX.register();
}

async function ensureModelRegistered(
  model: RunAnywhereModelDefinition,
  modality: ModelCategory
): Promise<void> {
  await ONNX.addModel({
    id: model.id,
    name: model.name,
    url: model.url,
    modality,
    artifactType: ModelArtifactType.TarGzArchive,
    memoryRequirement: model.memoryRequirement,
  });
}

async function ensureModelLocalPath(
  model: RunAnywhereModelDefinition,
  modality: ModelCategory,
  onUpdate?: (update: RunAnywherePreparationUpdate) => void
): Promise<string> {
  await ensureModelRegistered(model, modality);

  const alreadyDownloaded = await RunAnywhere.isModelDownloaded(model.id);
  if (!alreadyDownloaded) {
    onUpdate?.({
      message: `Downloading ${model.name}...`,
      progress: 0,
    });

    await RunAnywhere.downloadModel(
      model.id,
      (progress: RunAnywhereDownloadProgress) => {
        onUpdate?.({
          message: `Downloading ${model.name}...`,
          progress: Math.round(progress.progress * 100),
        });
      }
    );
  }

  const modelInfo = await RunAnywhere.getModelInfo(model.id);
  if (!modelInfo?.localPath) {
    throw new Error(`RunAnywhere model did not resolve a local path: ${model.id}`);
  }

  return modelInfo.localPath;
}

async function findFirstMatchingFile(
  rootPath: string,
  patterns: RegExp[]
): Promise<string | null> {
  const RNFS = await import('react-native-fs');
  const pendingPaths = [rootPath];

  while (pendingPaths.length > 0) {
    const currentPath = pendingPaths.shift();
    if (!currentPath) {
      continue;
    }

    const entries = await RNFS.readDir(currentPath);
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.path);
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.path);

    for (const pattern of patterns) {
      const match = files.find((filePath) => pattern.test(filePath));
      if (match) {
        return match;
      }
    }

    pendingPaths.push(...directories);
  }

  return null;
}

async function resolveBuiltInModelPath(
  model: RunAnywhereModelDefinition,
  modality: ModelCategory,
  localPath: string
): Promise<string> {
  const RNFS = await import('react-native-fs');
  const stat = await RNFS.stat(localPath);

  if (!stat.isDirectory()) {
    return localPath;
  }

  if (
    modality === ModelCategory.SpeechRecognition &&
    model.modelType === 'whisper'
  ) {
    const whisperEncoderPath = await findFirstMatchingFile(localPath, [
      /-encoder\.onnx$/i,
      /-encoder\.int8\.onnx$/i,
    ]);

    if (whisperEncoderPath) {
      return whisperEncoderPath;
    }
  }

  if (
    modality === ModelCategory.SpeechSynthesis &&
    model.modelType === 'piper'
  ) {
    return localPath;
  }

  return localPath;
}

export async function prepareRunAnywhereBuiltInOptions(
  onUpdate?: (update: RunAnywherePreparationUpdate) => void,
  options: PrepareRunAnywhereOptions = {}
): Promise<RunAnywherePreparedOptions | null> {
  const availability = getRunAnywhereAvailability();
  const includeSTT = options.includeSTT ?? true;
  const includeTTS = options.includeTTS ?? true;
  const shouldPrepareSTT = availability.stt && includeSTT;
  const shouldPrepareTTS = availability.tts && includeTTS;

  if (!shouldPrepareSTT && !shouldPrepareTTS) {
    return null;
  }

  onUpdate?.({
    message: 'Initializing RunAnywhere model registry...',
  });
  await ensureRunAnywhereInitialized();

  const builtInOptions: RunAnywherePreparedOptions = {};

  if (shouldPrepareSTT && RUNANYWHERE_CONFIG.stt) {
    const localPath = await ensureModelLocalPath(
      RUNANYWHERE_CONFIG.stt,
      ModelCategory.SpeechRecognition,
      onUpdate
    );
    const modelPath = await resolveBuiltInModelPath(
      RUNANYWHERE_CONFIG.stt,
      ModelCategory.SpeechRecognition,
      localPath
    );

    builtInOptions.builtInSTT = {
      modelPath,
      modelType: RUNANYWHERE_CONFIG.stt.modelType,
      maxRecordingMs: RUNANYWHERE_CONFIG.stt.maxRecordingMs,
    };
  }

  if (shouldPrepareTTS && RUNANYWHERE_CONFIG.tts) {
    const localPath = await ensureModelLocalPath(
      RUNANYWHERE_CONFIG.tts,
      ModelCategory.SpeechSynthesis,
      onUpdate
    );
    const modelPath = await resolveBuiltInModelPath(
      RUNANYWHERE_CONFIG.tts,
      ModelCategory.SpeechSynthesis,
      localPath
    );

    builtInOptions.builtInTTS = {
      modelPath,
      modelType: RUNANYWHERE_CONFIG.tts.modelType,
      voice: RUNANYWHERE_CONFIG.tts.voice,
      rate: RUNANYWHERE_CONFIG.tts.rate,
      pitch: RUNANYWHERE_CONFIG.tts.pitch,
    };
  }

  onUpdate?.({
    message: 'RunAnywhere models are ready for initialize().',
    progress: 100,
  });

  return builtInOptions;
}

class ExpoSpeechRecognitionReferenceSttProvider
  implements SpeechToTextProvider
{
  readonly name = 'expo-speech-recognition';

  constructor(
    private readonly getLastDetection: DetectionGetter,
    private readonly bridge: ReferenceSttBridge
  ) {}

  async transcribe(): Promise<TranscriptionResult> {
    return this.bridge.transcribe({
      detection: this.getLastDetection(),
    });
  }

  async cancel(): Promise<void> {
    await this.bridge.cancel();
  }
}

class ExpoSpeechReferenceTtsProvider implements TextToSpeechProvider {
  readonly name = 'expo-speech';

  constructor(private readonly bridge: ReferenceTtsBridge) {}

  async speak(text: string, options?: TTSOptions): Promise<void> {
    await this.bridge.speak({ text, options });
  }

  async stop(): Promise<void> {
    await this.bridge.stop();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createDemoReferenceSttBridge(): ReferenceSttBridge {
  let cancelled = false;

  return {
    async transcribe({ detection }): Promise<TranscriptionResult> {
      cancelled = false;
      const baseText = detection
        ? `Simulated host-app STT result after wake phrase "${detection.detectedPhrase}".`
        : 'Simulated host-app STT result without a prior wake event.';
      await wait(350);

      if (cancelled) {
        throw new Error('Reference STT bridge was cancelled before completion.');
      }

      return {
        text: baseText,
        provider: 'expo-speech-recognition',
        confidence: detection ? 0.87 : 0.61,
        durationMs: 350,
      };
    },
    async cancel(): Promise<void> {
      cancelled = true;
    },
  };
}

export function createDemoReferenceTtsBridge(): ReferenceTtsBridge {
  let stopped = false;

  return {
    async speak({ text, options }): Promise<void> {
      stopped = false;
      void options;
      const estimatedDurationMs = Math.max(250, Math.min(text.length * 18, 1500));
      await wait(estimatedDurationMs);

      if (stopped) {
        return;
      }
    },
    async stop(): Promise<void> {
      stopped = true;
    },
  };
}

export function createReferenceProviders(
  getLastDetection: DetectionGetter,
  bridges: {
    sttBridge: ReferenceSttBridge;
    ttsBridge: ReferenceTtsBridge;
  }
): {
  sttProvider: SpeechToTextProvider;
  ttsProvider: TextToSpeechProvider;
} {
  return {
    sttProvider: new ExpoSpeechRecognitionReferenceSttProvider(
      getLastDetection,
      bridges.sttBridge
    ),
    ttsProvider: new ExpoSpeechReferenceTtsProvider(bridges.ttsBridge),
  };
}
