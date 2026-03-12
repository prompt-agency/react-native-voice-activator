import type {
  RunAnywhereSTTConfig,
  RunAnywhereTTSConfig,
  SpeechToTextProvider,
  TextToSpeechProvider,
  TTSOptions,
  TranscriptionResult,
  WakeWordDetectedEvent,
} from 'react-native-voice-activator';

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
  stt: RunAnywhereSTTConfig | null;
  tts: RunAnywhereTTSConfig | null;
} = {
  stt: {
    modelPath: '',
    modelType: 'whisper',
    maxRecordingMs: 10_000,
  },
  tts: {
    modelPath: '',
    modelType: 'piper',
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
    stt: Boolean(RUNANYWHERE_CONFIG.stt?.modelPath),
    tts: Boolean(RUNANYWHERE_CONFIG.tts?.modelPath),
  };
}

export function createRunAnywhereBuiltInOptions(): {
  builtInSTT?: RunAnywhereSTTConfig;
  builtInTTS?: RunAnywhereTTSConfig;
} | null {
  const availability = getRunAnywhereAvailability();

  if (!availability.stt && !availability.tts) {
    return null;
  }

  return {
    ...(availability.stt
      ? {
          builtInSTT: RUNANYWHERE_CONFIG.stt ?? undefined,
        }
      : {}),
    ...(availability.tts
      ? {
          builtInTTS: RUNANYWHERE_CONFIG.tts ?? undefined,
        }
      : {}),
  };
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
