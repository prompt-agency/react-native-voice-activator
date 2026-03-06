import { nativeVoiceActivatorModule } from '../internal/native-module';
import type {
  VoiceActivatorApi,
  WakeWordEventListener,
  WakeWordEventMap,
  WakeWordEventName,
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

const listeners: {
  [TEventName in WakeWordEventName]: Set<WakeWordEventListener<TEventName>>;
} = {
  stateChanged: new Set(),
  wakeWordDetected: new Set(),
  error: new Set(),
  interruption: new Set(),
  audioRouteChanged: new Set(),
};

function createUnsupportedRuntimeError(methodName: string) {
  return new Error(
    `VoiceActivator.${methodName} is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.`
  );
}

function rejectUnsupportedRuntime(methodName: string): Promise<void> {
  return Promise.reject(createUnsupportedRuntimeError(methodName));
}

const addListener: VoiceActivatorApi['addListener'] = (eventName, listener) => {
  const eventListeners = listeners[eventName] as Set<typeof listener>;
  eventListeners.add(listener);

  return {
    remove() {
      eventListeners.delete(listener);
    },
  };
};

export const voiceActivator: VoiceActivatorApi = {
  async initialize(options: WakeWordInitializationOptions = {}) {
    if (!nativeVoiceActivatorModule?.initialize) {
      return rejectUnsupportedRuntime('initialize');
    }

    await nativeVoiceActivatorModule.initialize(options);
  },

  async startDetection() {
    if (!nativeVoiceActivatorModule?.startDetection) {
      return rejectUnsupportedRuntime('startDetection');
    }

    await nativeVoiceActivatorModule.startDetection();
  },

  async stopDetection() {
    if (!nativeVoiceActivatorModule?.stopDetection) {
      return rejectUnsupportedRuntime('stopDetection');
    }

    await nativeVoiceActivatorModule.stopDetection();
  },

  getStatus() {
    return nativeVoiceActivatorModule?.getStatus?.() ?? unsupportedStatus;
  },

  async dispose() {
    if (!nativeVoiceActivatorModule?.dispose) {
      return rejectUnsupportedRuntime('dispose');
    }

    await nativeVoiceActivatorModule.dispose();
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
