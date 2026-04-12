import type { WakeWordRuntimeConfiguration } from '../domain/detection-config';
import type {
  EngineRuntimeHandlers,
  VoiceActivatorEngineRuntime,
} from '../internal/engine-runtime';

class NativeManagedEngineRuntime implements VoiceActivatorEngineRuntime {
  async initialize(
    _configuration: WakeWordRuntimeConfiguration,
    _handlers: EngineRuntimeHandlers
  ): Promise<void> {
    // The native runtime owns capture, inference, and detection events.
  }

  async start(): Promise<void> {
    // The native runtime owns start/stop for the built-in engine path.
  }

  async stop(): Promise<void> {
    // The native runtime owns start/stop for the built-in engine path.
  }

  async dispose(): Promise<void> {
    // The native runtime owns disposal for the built-in engine path.
  }
}

export function createNativeManagedEngineRuntime(): VoiceActivatorEngineRuntime {
  return new NativeManagedEngineRuntime();
}
