import { nativeVoiceActivatorModule } from '../internal/native-module';
import { addRuntimeListener } from '../internal/runtime-events';
import { createRuntimeStore } from '../internal/runtime-store';
import type {
  VoiceActivatorApi,
  WakeWordError,
  WakeWordEventMap,
  WakeWordInitializationOptions,
  WakeWordStatus,
} from './types';

const unsupportedReason =
  'The native wake word runtime is not implemented yet. Story 1.2 defines the public TypeScript contract only.';

const unsupportedStatus: WakeWordStatus = {
  state: 'unsupported',
  isAvailable: false,
  isListening: false,
  canStart: false,
  reason: unsupportedReason,
  lastError: null,
};

const runtimeStore = createRuntimeStore(
  nativeVoiceActivatorModule?.getStatus?.() ?? unsupportedStatus
);

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
  return nativeVoiceActivatorModule?.getStatus?.() ?? fallback;
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
    if (!nativeVoiceActivatorModule?.initialize) {
      return rejectUnsupportedRuntime('initialize');
    }

    runtimeStore.transitionToState('initializing', {
      canStart: false,
      isListening: false,
      lastError: null,
    });

    try {
      await nativeVoiceActivatorModule.initialize(options);
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
    if (!nativeVoiceActivatorModule?.startDetection) {
      return rejectUnsupportedRuntime('startDetection');
    }

    runtimeStore.transitionToState('starting', {
      canStart: false,
      lastError: null,
    });

    try {
      await nativeVoiceActivatorModule.startDetection();
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
    if (!nativeVoiceActivatorModule?.stopDetection) {
      return rejectUnsupportedRuntime('stopDetection');
    }

    runtimeStore.transitionToState('stopping', {
      canStart: false,
      lastError: null,
    });

    try {
      await nativeVoiceActivatorModule.stopDetection();
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
    if (!nativeVoiceActivatorModule?.dispose) {
      return rejectUnsupportedRuntime('dispose');
    }

    try {
      await nativeVoiceActivatorModule.dispose();
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
