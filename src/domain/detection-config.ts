import type {
  RunAnywhereSTTConfig,
  RunAnywhereTTSConfig,
  SpeechToTextProvider,
  TextToSpeechProvider,
  WakeWordEngineConfiguration,
  WakeWordEngineMetadata,
  WakeWordEngineSelection,
  WakeWordInitializationOptions,
} from '../public/types';
import {
  DEFAULT_ENGINE_ID,
  resolveEngineRuntimeConfiguration,
} from '../engines/shared/engine-selection';

export interface WakeWordRuntimeConfiguration {
  profile: NonNullable<WakeWordInitializationOptions['profile']>;
  enableDebugLogging: boolean;
  engine: WakeWordEngineSelection;
  engineConfig: WakeWordEngineConfiguration;
  engineMetadata: WakeWordEngineMetadata;
  sttProvider?: SpeechToTextProvider;
  ttsProvider?: TextToSpeechProvider;
  builtInSTT?: RunAnywhereSTTConfig;
  builtInTTS?: RunAnywhereTTSConfig;
  autoSpeak: boolean;
}

export function createRuntimeConfiguration(
  options: WakeWordInitializationOptions = {}
): WakeWordRuntimeConfiguration {
  const resolvedEngine = resolveEngineRuntimeConfiguration(
    options.engine,
    options.engineConfig
  );

  return {
    profile: options.profile ?? 'balanced',
    enableDebugLogging: options.enableDebugLogging ?? false,
    engine: resolvedEngine.selection,
    engineConfig: resolvedEngine.config,
    engineMetadata: resolvedEngine.metadata,
    autoSpeak: options.autoSpeak ?? false,
    ...(options.sttProvider ? { sttProvider: options.sttProvider } : {}),
    ...(options.ttsProvider ? { ttsProvider: options.ttsProvider } : {}),
    ...(options.builtInSTT ? { builtInSTT: options.builtInSTT } : {}),
    ...(options.builtInTTS ? { builtInTTS: options.builtInTTS } : {}),
  };
}

export function createDefaultRuntimeConfiguration(): WakeWordRuntimeConfiguration {
  const resolvedEngine = resolveEngineRuntimeConfiguration();

  return {
    profile: 'balanced',
    enableDebugLogging: false,
    engine: resolvedEngine.selection ?? {
      id: DEFAULT_ENGINE_ID,
    },
    engineConfig: resolvedEngine.config,
    engineMetadata: resolvedEngine.metadata,
    autoSpeak: false,
  };
}

export type NativeWakeWordRuntimeConfiguration = Omit<
  WakeWordRuntimeConfiguration,
  'sttProvider' | 'ttsProvider' | 'autoSpeak' | 'builtInSTT' | 'builtInTTS'
>;

export function createNativeRuntimeConfiguration(
  configuration: WakeWordRuntimeConfiguration
): NativeWakeWordRuntimeConfiguration {
  return {
    profile: configuration.profile,
    enableDebugLogging: configuration.enableDebugLogging,
    engine: configuration.engine,
    engineConfig: configuration.engineConfig,
    engineMetadata: configuration.engineMetadata,
  };
}
