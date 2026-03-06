import type {
  WakeWordEngineConfiguration,
  WakeWordEngineMetadata,
  WakeWordEngineSelection,
} from '../../public/types';
import type {
  ResolvedWakeWordEngineConfiguration,
  WakeWordEngineContract,
} from '../../domain/engine-contract';

export const DEFAULT_ENGINE_ID = 'default' as const;

export const defaultEngineMetadata: WakeWordEngineMetadata = {
  id: DEFAULT_ENGINE_ID,
  displayName: 'Default built-in wake word engine',
  assetRequirement: 'bundled',
  capabilities: {
    onDeviceDetection: true,
    backgroundDetection: false,
    customKeywordAssets: true,
    runtimeConfigurationUpdates: true,
  },
};

export const defaultEngineContract: WakeWordEngineContract = {
  id: DEFAULT_ENGINE_ID,
  metadata: defaultEngineMetadata,
  createDefaultConfig() {
    return {
      sensitivity: 0.5,
      metadata: {},
    };
  },
  normalizeConfig(config = {}) {
    return {
      sensitivity: config.sensitivity ?? 0.5,
      assetKeys: config.assetKeys ? { ...config.assetKeys } : undefined,
      metadata: config.metadata ? { ...config.metadata } : {},
    };
  },
};

const engineContracts = new Map<string, WakeWordEngineContract>([
  [DEFAULT_ENGINE_ID, defaultEngineContract],
]);

export function resolveEngineSelection(
  selection?: WakeWordEngineSelection
): WakeWordEngineSelection {
  return {
    id: selection?.id ?? DEFAULT_ENGINE_ID,
    ...(selection?.variant ? { variant: selection.variant } : {}),
  };
}

export function resolveEngineContract(
  selection?: WakeWordEngineSelection
): WakeWordEngineContract {
  const resolvedSelection = resolveEngineSelection(selection);

  return (
    engineContracts.get(resolvedSelection.id) ??
    engineContracts.get(DEFAULT_ENGINE_ID)!
  );
}

export function resolveEngineConfiguration(
  selection?: WakeWordEngineSelection,
  configuration?: WakeWordEngineConfiguration
): WakeWordEngineConfiguration {
  return resolveEngineContract(selection).normalizeConfig(configuration);
}

export function resolveEngineRuntimeConfiguration(
  selection?: WakeWordEngineSelection,
  configuration?: WakeWordEngineConfiguration
): ResolvedWakeWordEngineConfiguration {
  const normalizedSelection = resolveEngineSelection(selection);
  const contract = resolveEngineContract(normalizedSelection);

  return {
    selection: normalizedSelection,
    config: contract.normalizeConfig(configuration),
    metadata: contract.metadata,
  };
}
