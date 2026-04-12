import type {
  WakeWordEngineConfiguration,
  WakeWordEngineId,
  WakeWordEngineMetadata,
  WakeWordEngineSelection,
} from '../public/types';

export interface WakeWordEngineContract<
  TConfig extends WakeWordEngineConfiguration = WakeWordEngineConfiguration,
> {
  id: WakeWordEngineId;
  metadata: WakeWordEngineMetadata;
  createDefaultConfig(): TConfig;
  normalizeConfig(config?: TConfig): TConfig;
}

export interface ResolvedWakeWordEngineConfiguration<
  TConfig extends WakeWordEngineConfiguration = WakeWordEngineConfiguration,
> {
  selection: WakeWordEngineSelection;
  config: TConfig;
  metadata: WakeWordEngineMetadata;
}
