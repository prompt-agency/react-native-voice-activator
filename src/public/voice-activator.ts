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
import type {
  VoiceActivatorApi,
  WakeWordError,
  WakeWordEventMap,
  WakeWordInitializationOptions,
  WakeWordStatus,
} from './types';

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

const addListener: VoiceActivatorApi['addListener'] = addRuntimeListener;

export const voiceActivator: VoiceActivatorApi = {
  async initialize(options: WakeWordInitializationOptions = {}) {
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.initialize) {
      return rejectUnsupportedRuntime('initialize');
    }
    const runtimeConfiguration = createRuntimeConfiguration(options);

    runtimeStore.transitionToState('initializing', {
      canStart: false,
      isListening: false,
      lastError: null,
    });

    try {
      await activeRuntime.initialize(runtimeConfiguration);
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
      runtimeStore.recordError(
        createRuntimeFailure('initialize', cause),
        'error'
      );
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
      runtimeStore.recordError(
        createRuntimeFailure('startDetection', cause),
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
        createRuntimeFailure('stopDetection', cause),
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
      runtimeStore.recordError(createRuntimeFailure('dispose', cause), 'error');
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
