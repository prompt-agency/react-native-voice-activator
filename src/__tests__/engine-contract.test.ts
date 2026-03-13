import {
  createNativeRuntimeConfiguration,
  createDefaultRuntimeConfiguration,
  createRuntimeConfiguration,
} from '../domain/detection-config';
import {
  DEFAULT_ENGINE_ID,
  defaultEngineContract,
  defaultEngineMetadata,
  resolveEngineRuntimeConfiguration,
  resolveEngineSelection,
} from '../engines';
import type {
  BuiltInProviderProgress,
  RunAnywhereSTTConfig,
  RunAnywhereSTTModelId,
  RunAnywhereTTSConfig,
  RunAnywhereTTSModelId,
  SpeechToTextProvider,
  TextToSpeechProvider,
  TranscriptionResult,
  TTSOptions,
  WakeWordEngineConfiguration,
  WakeWordInitializationOptions,
} from '../index';

describe('engine-agnostic runtime contract', () => {
  it('normalizes runtime configuration around an engine-neutral default engine', () => {
    const configuration = createRuntimeConfiguration({
      profile: 'accuracy',
      enableDebugLogging: true,
      engine: {
        id: DEFAULT_ENGINE_ID,
      },
      engineConfig: {
        sensitivity: 0.8,
        assetKeys: {
          keywordAssetKey: 'keyword/default',
        },
      },
    });

    expect(configuration).toEqual({
      profile: 'accuracy',
      enableDebugLogging: true,
      engine: {
        id: 'default',
      },
      engineConfig: {
        sensitivity: 0.8,
        assetKeys: {
          keywordAssetKey: 'keyword/default',
        },
      },
      autoSpeak: false,
      engineMetadata: {
        id: 'default',
        displayName: 'Default built-in wake word engine',
        assetRequirement: 'bundled',
        capabilities: {
          onDeviceDetection: true,
          backgroundDetection: false,
          customKeywordAssets: true,
          runtimeConfigurationUpdates: true,
        },
      },
    });
  });

  it('provides a stable default engine contract without vendor-specific ids', () => {
    expect(defaultEngineContract.id).toBe('default');
    expect(defaultEngineMetadata.id).toBe('default');
    expect(defaultEngineMetadata.displayName).toBe(
      'Default built-in wake word engine'
    );
    expect(defaultEngineMetadata.capabilities).toEqual({
      onDeviceDetection: true,
      backgroundDetection: false,
      customKeywordAssets: true,
      runtimeConfigurationUpdates: true,
    });
    expect(
      JSON.stringify({
        contract: defaultEngineContract.id,
        metadata: defaultEngineMetadata,
      }).toLowerCase()
    ).not.toContain('porcupine');
  });

  it('supports extension without changing the initialize API shape', () => {
    const options: WakeWordInitializationOptions = {
      engine: resolveEngineSelection({
        id: 'custom-engine',
        variant: 'experimental',
      }),
      engineConfig: {
        sensitivity: 0.35,
      },
    };

    const configuration = createRuntimeConfiguration(options);

    expect(configuration.engine).toEqual({
      id: 'custom-engine',
      variant: 'experimental',
    });
    expect(configuration.engineConfig).toEqual({
      sensitivity: 0.35,
    });
    expect(configuration.engineMetadata).toEqual(defaultEngineMetadata);
  });

  it('keeps the default runtime configuration deterministic', () => {
    expect(createDefaultRuntimeConfiguration()).toEqual({
      profile: 'balanced',
      enableDebugLogging: false,
      engine: {
        id: 'default',
      },
      engineConfig: {
        sensitivity: 0.5,
      },
      engineMetadata: {
        id: 'default',
        displayName: 'Default built-in wake word engine',
        assetRequirement: 'bundled',
        capabilities: {
          onDeviceDetection: true,
          backgroundDetection: false,
          customKeywordAssets: true,
          runtimeConfigurationUpdates: true,
        },
      },
      autoSpeak: false,
    });
  });

  it('resolves runtime engine details from the selected engine id', () => {
    const resolved = resolveEngineRuntimeConfiguration(
      {
        id: 'custom-engine',
        variant: 'preview',
      },
      {
        sensitivity: 0.4,
      }
    );

    expect(resolved).toEqual({
      selection: {
        id: 'custom-engine',
        variant: 'preview',
      },
      config: {
        sensitivity: 0.4,
      },
      metadata: defaultEngineMetadata,
    });
  });

  it('retains engine-neutral public exports', async () => {
    const VoiceActivator = await import('../index');
    const exportKeys = Object.keys(VoiceActivator).map((value) =>
      value.toLowerCase()
    );

    expect(exportKeys.some((key) => key.includes('porcupine'))).toBe(false);
  });

  it('accepts engine-neutral asset and sensitivity configuration types at compile time', () => {
    const engineConfig: WakeWordEngineConfiguration = {
      sensitivity: 0.55,
      assetKeys: {
        modelAssetKey: 'bundle/default-model',
        keywordAssetKey: 'bundle/default-keywords',
      },
    };

    expect(engineConfig).toEqual({
      sensitivity: 0.55,
      assetKeys: {
        modelAssetKey: 'bundle/default-model',
        keywordAssetKey: 'bundle/default-keywords',
      },
    });
  });

  it('exports typed optional provider interfaces through the public initialization contract', () => {
    const sttProvider: SpeechToTextProvider = {
      name: 'test-stt',
      transcribe: async (): Promise<TranscriptionResult> => ({
        text: 'hello',
        provider: 'test-stt',
      }),
      cancel: async () => undefined,
    };
    const ttsProvider: TextToSpeechProvider = {
      name: 'test-tts',
      speak: async (_text: string, _options?: TTSOptions) => undefined,
      stop: async () => undefined,
    };

    const options: WakeWordInitializationOptions = {
      engine: {
        id: 'default',
      },
      sttProvider,
      ttsProvider,
      autoSpeak: true,
    };

    expect(options.sttProvider).toBe(sttProvider);
    expect(options.ttsProvider).toBe(ttsProvider);
    expect(options.autoSpeak).toBe(true);
  });

  it('threads provider registration through the shared runtime configuration shape', () => {
    const sttProvider: SpeechToTextProvider = {
      name: 'test-stt',
      transcribe: async (): Promise<TranscriptionResult> => ({
        text: 'hello',
        provider: 'test-stt',
      }),
      cancel: async () => undefined,
    };
    const ttsProvider: TextToSpeechProvider = {
      name: 'test-tts',
      speak: async (_text: string, _options?: TTSOptions) => undefined,
      stop: async () => undefined,
    };

    const configuration = createRuntimeConfiguration({
      sttProvider,
      ttsProvider,
      autoSpeak: true,
      engineConfig: {
        sensitivity: 0.6,
      },
    });

    expect(configuration).toEqual({
      profile: 'balanced',
      enableDebugLogging: false,
      engine: {
        id: 'default',
      },
      engineConfig: {
        sensitivity: 0.6,
      },
      engineMetadata: defaultEngineMetadata,
      sttProvider,
      ttsProvider,
      autoSpeak: true,
    });
  });

  it('exports modelId-based RunAnywhereSTTConfig and RunAnywhereTTSConfig without modelPath', () => {
    const sttModelId: RunAnywhereSTTModelId = 'whisper-tiny-en';
    const ttsModelId: RunAnywhereTTSModelId = 'piper-en-lessac';

    const sttConfig: RunAnywhereSTTConfig = {
      modelId: sttModelId,
      maxRecordingMs: 10_000,
    };
    const ttsConfig: RunAnywhereTTSConfig = {
      modelId: ttsModelId,
      voice: 'voice-1',
      rate: 1.0,
      pitch: 1.0,
    };

    expect(sttConfig.modelId).toBe('whisper-tiny-en');
    expect(ttsConfig.modelId).toBe('piper-en-lessac');
    // @ts-expect-error modelPath must not exist on the new config shapes
    expect(sttConfig.modelPath).toBeUndefined();
    // @ts-expect-error modelPath must not exist on the new config shapes
    expect(ttsConfig.modelPath).toBeUndefined();
  });

  it('exports BuiltInProviderProgress with message and optional progress fields', () => {
    const minimal: BuiltInProviderProgress = {
      message: 'Downloading model...',
    };
    const withProgress: BuiltInProviderProgress = {
      message: 'Downloading model...',
      progress: 42,
    };

    expect(minimal.message).toBe('Downloading model...');
    expect(minimal.progress).toBeUndefined();
    expect(withProgress.progress).toBe(42);
  });

  it('accepts onBuiltInProgress callback in WakeWordInitializationOptions', () => {
    const progressUpdates: BuiltInProviderProgress[] = [];
    const options: WakeWordInitializationOptions = {
      builtInSTT: { modelId: 'whisper-tiny-en' },
      builtInTTS: { modelId: 'piper-en-lessac' },
      onBuiltInProgress: (update) => {
        progressUpdates.push(update);
      },
    };

    options.onBuiltInProgress?.({ message: 'test', progress: 50 });
    expect(progressUpdates).toHaveLength(1);
    expect(progressUpdates[0]).toEqual({ message: 'test', progress: 50 });
  });

  it('strips provider objects from the native runtime configuration shape', () => {
    const sttProvider: SpeechToTextProvider = {
      name: 'test-stt',
      transcribe: async (): Promise<TranscriptionResult> => ({
        text: 'hello',
        provider: 'test-stt',
      }),
      cancel: async () => undefined,
    };
    const ttsProvider: TextToSpeechProvider = {
      name: 'test-tts',
      speak: async (_text: string, _options?: TTSOptions) => undefined,
      stop: async () => undefined,
    };

    const nativeConfiguration = createNativeRuntimeConfiguration(
      createRuntimeConfiguration({
        sttProvider,
        ttsProvider,
        autoSpeak: true,
        engineConfig: {
          sensitivity: 0.6,
        },
      })
    );

    expect(nativeConfiguration).toEqual({
      profile: 'balanced',
      enableDebugLogging: false,
      engine: {
        id: 'default',
      },
      engineConfig: {
        sensitivity: 0.6,
      },
      engineMetadata: defaultEngineMetadata,
    });
  });
});
