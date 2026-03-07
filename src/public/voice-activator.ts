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

function syncEngineRuntimeWithNativeStatus(status: WakeWordStatus) {
  if (
    status.state === 'unsupported' &&
    !status.isListening &&
    activeEngineRuntime
  ) {
    disposeEngineRuntime().catch((cause) => {
      const runtimeError = createRuntimeFailure(
        'disposeEngineRuntimeForUnsupportedState',
        cause
      );
      runtimeStore.mergeLastError(runtimeError);
    });
  }
}

if (typeof setRuntimeStatusHandler === 'function') {
  setRuntimeStatusHandler((status) => {
    syncEngineRuntimeWithNativeStatus(status);
    runtimeStore.setStatus(status);
  });
}
if (typeof setRuntimeErrorHandler === 'function') {
  setRuntimeErrorHandler((error) => {
    const latestStatus = resolveStatus(getCurrentStatus());
    const nextStatus = latestStatus.lastError
      ? latestStatus
      : {
          ...latestStatus,
          lastError: error,
        };

    runtimeStore.setStatus(nextStatus);
    runtimeStore.mergeLastError(nextStatus.lastError ?? error);
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

function resolveLatestKnownRuntimeError(
  methodName: string,
  cause: unknown
): WakeWordError {
  if (isWakeWordError(cause)) {
    return cause;
  }

  const currentStatus = getCurrentStatus();
  if (currentStatus.lastError) {
    return currentStatus.lastError;
  }

  const latestStatus = resolveStatus(currentStatus);
  if (latestStatus.lastError) {
    return latestStatus.lastError;
  }

  return createRuntimeFailure(methodName, cause);
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

function syncKnownRuntimeFailure(
  methodName: string,
  cause: unknown,
  nextState: 'error' | undefined = 'error'
) {
  const currentStatus = getCurrentStatus();
  if (currentStatus.lastError) {
    runtimeStore.setStatus(currentStatus);
    return;
  }

  const latestStatus = resolveStatus(currentStatus);
  if (latestStatus.lastError) {
    runtimeStore.setStatus(latestStatus);
    return;
  }

  const runtimeError = resolveLatestKnownRuntimeError(methodName, cause);
  runtimeStore.recordError(
    runtimeError.category === 'configuration'
      ? createConfigurationFailure(runtimeError)
      : runtimeError,
    nextState
  );
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
      syncKnownRuntimeFailure('initialize', cause);
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
      syncKnownRuntimeFailure('startDetection', cause);
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
      syncKnownRuntimeFailure('stopDetection', cause);
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
      syncKnownRuntimeFailure('dispose', cause);
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
