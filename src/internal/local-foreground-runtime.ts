import type {
  WakeWordDetectedEvent,
  WakeWordInitializationOptions,
  WakeWordStatus,
} from '../public/types';
import { createLocalForegroundEngine } from './local-foreground-engine';
import type { VoiceActivatorRuntimeBridge } from './runtime-bridge';

type WakeWordDetectedHandler = (event: WakeWordDetectedEvent) => void;

function cloneStatus(status: WakeWordStatus): WakeWordStatus {
  return {
    ...status,
    lastError: status.lastError ? { ...status.lastError } : status.lastError,
  };
}

export interface LocalForegroundRuntime extends VoiceActivatorRuntimeBridge {
  setWakeWordDetectedHandler(handler: WakeWordDetectedHandler | null): void;
}

export function createLocalForegroundRuntime(): LocalForegroundRuntime {
  const engine = createLocalForegroundEngine();
  let status: WakeWordStatus = {
    state: 'idle',
    isAvailable: true,
    isListening: false,
    canStart: false,
    lastError: null,
  };
  let wakeWordDetectedHandler: WakeWordDetectedHandler | null = null;
  let detectionTimer: ReturnType<typeof setTimeout> | null = null;

  function clearDetectionTimer() {
    if (detectionTimer) {
      clearTimeout(detectionTimer);
      detectionTimer = null;
    }
  }

  function scheduleForegroundDetection() {
    clearDetectionTimer();
    detectionTimer = engine.scheduleDetection((payload) => {
      detectionTimer = null;

      if (status.state === 'running' && wakeWordDetectedHandler) {
        wakeWordDetectedHandler(payload);
      }
    });
  }

  return {
    async initialize(options: WakeWordInitializationOptions) {
      clearDetectionTimer();
      engine.configure(options);
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
      scheduleForegroundDetection();
    },

    async stopDetection() {
      clearDetectionTimer();

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
      clearDetectionTimer();
      status = {
        state: 'idle',
        isAvailable: true,
        isListening: false,
        canStart: false,
        lastError: null,
      };
    },

    setWakeWordDetectedHandler(handler: WakeWordDetectedHandler | null) {
      wakeWordDetectedHandler = handler;
    },
  };
}
