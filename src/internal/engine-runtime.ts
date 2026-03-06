import type { WakeWordDetectedEvent, WakeWordError } from '../public/types';
import type { WakeWordRuntimeConfiguration } from '../domain/detection-config';

export interface EngineRuntimeHandlers {
  onDetected(event: WakeWordDetectedEvent): void;
  onError(error: WakeWordError): void;
}

export interface VoiceActivatorEngineRuntime {
  initialize(
    configuration: WakeWordRuntimeConfiguration,
    handlers: EngineRuntimeHandlers
  ): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
