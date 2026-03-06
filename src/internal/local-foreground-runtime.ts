import type { WakeWordStatus } from '../public/types';
import type { WakeWordRuntimeConfiguration } from '../domain/detection-config';
import type { VoiceActivatorRuntimeBridge } from './runtime-bridge';

function cloneStatus(status: WakeWordStatus): WakeWordStatus {
  return {
    ...status,
    lastError: status.lastError ? { ...status.lastError } : status.lastError,
  };
}

export interface LocalForegroundRuntime extends VoiceActivatorRuntimeBridge {
  setWakeWordDetectedHandler(
    handler:
      | ((payload: import('../public/types').WakeWordDetectedEvent) => void)
      | null
  ): void;
}

export function createLocalForegroundRuntime(): LocalForegroundRuntime {
  let status: WakeWordStatus = {
    state: 'idle',
    isAvailable: true,
    isListening: false,
    canStart: false,
    lastError: null,
  };

  return {
    async initialize(_options: WakeWordRuntimeConfiguration) {
      status = {
        state: 'ready',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      };
    },

    async startDetection() {
      if (!status.canStart) {
        throw new Error(
          'VoiceActivator.startDetection requires initialize() to complete before detection can begin.'
        );
      }

      status = {
        state: 'running',
        isAvailable: true,
        isListening: true,
        canStart: false,
        lastError: null,
      };
    },

    async stopDetection() {
      if (
        status.state !== 'running' &&
        status.state !== 'starting' &&
        status.state !== 'ready' &&
        status.state !== 'stopped'
      ) {
        status = {
          ...cloneStatus(status),
          isListening: false,
          canStart: false,
        };
        return;
      }

      status = {
        state: 'stopped',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      };
    },

    getStatus() {
      return cloneStatus(status);
    },

    async dispose() {
      status = {
        state: 'idle',
        isAvailable: true,
        isListening: false,
        canStart: false,
        lastError: null,
      };
    },

    setWakeWordDetectedHandler(_handler) {
      // Local fallback runtime no longer simulates detection events.
    },
  };
}
