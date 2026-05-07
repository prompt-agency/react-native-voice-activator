import type {
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
  autoSpeak: boolean;
  speakerModelPath?: string;
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
    ...(options.speakerModelPath ? { speakerModelPath: options.speakerModelPath } : {}),
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
  'sttProvider' | 'ttsProvider' | 'autoSpeak'
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
    ...(configuration.speakerModelPath ? { speakerModelPath: configuration.speakerModelPath } : {}),
  };
}
