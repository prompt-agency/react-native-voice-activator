import type {
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
  };
}
