import {
  getVoiceActivatorRuntimeBridge,
  setRuntimeErrorHandler,
  setRuntimeInterruptionHandler,
  setRuntimeStatusHandler,
  setWakeWordDetectedHandler,
} from '../internal/native-module';
import { createRuntimeConfiguration } from '../domain/detection-config';
import {
  addRuntimeListener,
  emitRuntimeEvent,
} from '../internal/runtime-events';
import { createRuntimeStore } from '../internal/runtime-store';
import type { VoiceActivatorEngineRuntime } from '../internal/engine-runtime';
import { createPorcupineEngineRuntime } from '../engines';
import type {
  VoiceActivatorApi,
  WakeWordError,
  WakeWordEventMap,
  WakeWordInitializationOptions,
  WakeWordStatus,
} from './types';

let activeEngineRuntime: VoiceActivatorEngineRuntime | null = null;

const runtimeStore = createRuntimeStore(
  getVoiceActivatorRuntimeBridge().getStatus() ?? {
    state: 'unsupported',
    isAvailable: false,
    isListening: false,
    canStart: false,
    reason: 'No runtime is available.',
    lastError: null,
  }
);
setWakeWordDetectedHandler((payload) => {
  emitRuntimeEvent('wakeWordDetected', payload);
});
if (typeof setRuntimeStatusHandler === 'function') {
  setRuntimeStatusHandler((status) => {
    runtimeStore.setStatus(status);
  });
}
if (typeof setRuntimeErrorHandler === 'function') {
  setRuntimeErrorHandler((error) => {
    runtimeStore.setStatus({
      ...getCurrentStatus(),
      lastError: error,
    });
    emitRuntimeEvent('error', error);
  });
}
if (typeof setRuntimeInterruptionHandler === 'function') {
  setRuntimeInterruptionHandler((payload) => {
    emitRuntimeEvent('interruption', payload);
  });
}

function createUnsupportedRuntimeError(methodName: string) {
  return new Error(
    `VoiceActivator.${methodName} is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.`
  );
}

function rejectUnsupportedRuntime(methodName: string): Promise<void> {
  const error = createRuntimeUnavailableError(methodName);
  runtimeStore.recordError(error);
  return Promise.reject(new Error(error.message));
}

function createRuntimeUnavailableError(methodName: string): WakeWordError {
  return {
    category: 'internal',
    code: 'runtime_unavailable',
    message: createUnsupportedRuntimeError(methodName).message,
    recoverable: true,
  };
}

function getCurrentStatus(): WakeWordStatus {
  return runtimeStore.getStatus();
}

function resolveStatus(fallback: WakeWordStatus): WakeWordStatus {
  return getVoiceActivatorRuntimeBridge().getStatus?.() ?? fallback;
}

function createRuntimeFailure(
  methodName: string,
  cause: unknown
): WakeWordError {
  const message =
    cause instanceof Error
      ? cause.message
      : `VoiceActivator.${methodName} failed unexpectedly.`;

  return {
    category: 'internal',
    code: `${methodName}_failed`,
    message,
    recoverable: true,
  };
}

function isWakeWordError(value: unknown): value is WakeWordError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'category' in value &&
    'code' in value &&
    'message' in value &&
    'recoverable' in value
  );
}

function createConfigurationFailure(error: WakeWordError): WakeWordError {
  return {
    ...error,
    recoverable: true,
  };
}

function applyRuntimeError(error: WakeWordError) {
  runtimeStore.setStatus({
    ...getCurrentStatus(),
    state: 'error',
    isListening: false,
    canStart: false,
    lastError: error,
  });
  emitRuntimeEvent('error', error);
}

function resolveEngineRuntime(): VoiceActivatorEngineRuntime {
  return createPorcupineEngineRuntime();
}

async function disposeEngineRuntime() {
  if (!activeEngineRuntime) {
    return;
  }

  await activeEngineRuntime.dispose();
  activeEngineRuntime = null;
}

const addListener: VoiceActivatorApi['addListener'] = addRuntimeListener;

export const voiceActivator: VoiceActivatorApi = {
  async initialize(options: WakeWordInitializationOptions = {}) {
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.initialize) {
      return rejectUnsupportedRuntime('initialize');
    }
    const runtimeConfiguration = createRuntimeConfiguration(options);
    const nextEngineRuntime = resolveEngineRuntime();

    runtimeStore.transitionToState('initializing', {
      canStart: false,
      isListening: false,
      lastError: null,
    });

    try {
      await disposeEngineRuntime();
      await activeRuntime.initialize(runtimeConfiguration);
      await nextEngineRuntime.initialize(runtimeConfiguration, {
        onDetected(payload) {
          emitRuntimeEvent('wakeWordDetected', payload);
        },
        onError(error) {
          applyRuntimeError(error);
        },
      });
      activeEngineRuntime = nextEngineRuntime;
      runtimeStore.setStatus(
        resolveStatus({
          ...getCurrentStatus(),
          state: 'ready',
          isAvailable: true,
          isListening: false,
          canStart: true,
          lastError: null,
        })
      );
    } catch (cause) {
      if (isWakeWordError(cause) && cause.category === 'configuration') {
        runtimeStore.recordError(createConfigurationFailure(cause), 'error');
      } else if (isWakeWordError(cause)) {
        runtimeStore.recordError(cause, 'error');
      } else {
        runtimeStore.recordError(
          createRuntimeFailure('initialize', cause),
          'error'
        );
      }
      try {
        await activeRuntime.dispose?.();
      } catch {
        // Best-effort rollback when engine initialization fails.
      }
      throw cause;
    }
  },

  async startDetection() {
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.startDetection) {
      return rejectUnsupportedRuntime('startDetection');
    }

    runtimeStore.transitionToState('starting', {
      canStart: false,
      lastError: null,
    });

    try {
      await activeRuntime.startDetection();
      await activeEngineRuntime?.start();
      runtimeStore.setStatus(
        resolveStatus({
          ...getCurrentStatus(),
          state: 'running',
          isAvailable: true,
          isListening: true,
          canStart: false,
          lastError: null,
        })
      );
    } catch (cause) {
      try {
        await activeRuntime.stopDetection?.();
      } catch {
        // Best-effort rollback when the engine-backed start path fails.
      }
      runtimeStore.recordError(
        isWakeWordError(cause)
          ? cause
          : createRuntimeFailure('startDetection', cause),
        'error'
      );
      throw cause;
    }
  },

  async stopDetection() {
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.stopDetection) {
      return rejectUnsupportedRuntime('stopDetection');
    }

    runtimeStore.transitionToState('stopping', {
      canStart: false,
      lastError: null,
    });

    try {
      await activeEngineRuntime?.stop();
      await activeRuntime.stopDetection();
      runtimeStore.setStatus(
        resolveStatus({
          ...getCurrentStatus(),
          state: 'stopped',
          isAvailable: true,
          isListening: false,
          canStart: true,
          lastError: null,
        })
      );
    } catch (cause) {
      runtimeStore.recordError(
        isWakeWordError(cause)
          ? cause
          : createRuntimeFailure('stopDetection', cause),
        'error'
      );
      throw cause;
    }
  },

  getStatus() {
    return getCurrentStatus();
  },

  async dispose() {
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.dispose) {
      return rejectUnsupportedRuntime('dispose');
    }

    try {
      await disposeEngineRuntime();
      await activeRuntime.dispose();
      runtimeStore.setStatus(
        resolveStatus({
          ...getCurrentStatus(),
          state: 'idle',
          isAvailable: true,
          isListening: false,
          canStart: true,
          lastError: null,
        })
      );
    } catch (cause) {
      runtimeStore.recordError(
        isWakeWordError(cause) ? cause : createRuntimeFailure('dispose', cause),
        'error'
      );
      throw cause;
    }
  },

  addListener,
};

export const initialize = voiceActivator.initialize;
export const startDetection = voiceActivator.startDetection;
export const stopDetection = voiceActivator.stopDetection;
export const getStatus = voiceActivator.getStatus;
export const dispose = voiceActivator.dispose;
export const addWakeWordListener = addListener;

export type VoiceActivatorEventMap = WakeWordEventMap;
