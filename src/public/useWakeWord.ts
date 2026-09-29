import { useSyncExternalStore } from 'react';

import {
  addWakeWordListener,
  dispose,
  getStatus,
  initialize,
  startDetection,
  stopDetection,
} from './voice-activator';
import type {
  UseWakeWordResult,
  UseWakeWordSnapshot,
  WakeWordAudioRouteChangedEvent,
  WakeWordDetectedEvent,
  WakeWordError,
  WakeWordInterruptionEvent,
  WakeWordSubscription,
} from './types';

const STORE_EVENT_NAMES = [
  'stateChanged',
  'wakeWordDetected',
  'error',
  'interruption',
  'audioRouteChanged',
  'transcriptionStarted',
  'transcriptionResult',
  'transcriptionError',
  'speechStarted',
  'speechCompleted',
  'speechError',
] as const;

function createInitialSnapshot(): UseWakeWordSnapshot {
  const status = getStatus();

  return {
    status,
    latestWakeWordEvent: null,
    latestRuntimeError: status.lastError ?? null,
    latestInterruption: null,
    latestAudioRouteChange: null,
    transcription: {
      state: 'idle',
      started: null,
      result: null,
      error: null,
    },
    speech: {
      state: 'idle',
      started: null,
      completed: null,
      error: null,
    },
  };
}

let snapshot = createInitialSnapshot();
const storeListeners = new Set<() => void>();
let runtimeSubscriptions: WakeWordSubscription[] = [];

function notifyStoreListeners() {
  const listeners = [...storeListeners];
  for (const listener of listeners) {
    listener();
  }
}

function updateSnapshot(
  update:
    | Partial<UseWakeWordSnapshot>
    | ((current: UseWakeWordSnapshot) => UseWakeWordSnapshot)
) {
  snapshot =
    typeof update === 'function'
      ? update(snapshot)
      : {
          ...snapshot,
          ...update,
        };

  notifyStoreListeners();
}

function syncStatus() {
  const status = getStatus();

  updateSnapshot((current) => ({
    ...current,
    status,
    latestRuntimeError: status.lastError ?? current.latestRuntimeError,
  }));
}

function handleWakeWordDetected(payload: WakeWordDetectedEvent) {
  updateSnapshot((current) => ({
    ...current,
    latestWakeWordEvent: payload,
    status: getStatus(),
    transcription: {
      state: 'idle',
      started: null,
      result: null,
      error: null,
    },
    speech: {
      state: 'idle',
      started: null,
      completed: null,
      error: null,
    },
  }));
}

function handleRuntimeError(payload: WakeWordError) {
  updateSnapshot((current) => ({
    ...current,
    latestRuntimeError: payload,
    status: getStatus(),
  }));
}

function handleInterruption(payload: WakeWordInterruptionEvent) {
  updateSnapshot((current) => ({
    ...current,
    latestInterruption: payload,
    status: getStatus(),
  }));
}

function handleAudioRouteChange(payload: WakeWordAudioRouteChangedEvent) {
  updateSnapshot((current) => ({
    ...current,
    latestAudioRouteChange: payload,
    status: getStatus(),
  }));
}

function ensureRuntimeSubscriptions() {
  if (runtimeSubscriptions.length > 0) {
    return;
  }

  runtimeSubscriptions = [
    addWakeWordListener('stateChanged', () => {
      syncStatus();
    }),
    addWakeWordListener('wakeWordDetected', handleWakeWordDetected),
    addWakeWordListener('error', handleRuntimeError),
    addWakeWordListener('interruption', handleInterruption),
    addWakeWordListener('audioRouteChanged', handleAudioRouteChange),
    addWakeWordListener('transcriptionStarted', (payload) => {
      updateSnapshot((current) => ({
        ...current,
        status: getStatus(),
        transcription: {
          state: 'transcribing',
          started: payload,
          result: null,
          error: null,
        },
        speech: {
          state: 'idle',
          started: null,
          completed: null,
          error: null,
        },
      }));
    }),
    addWakeWordListener('transcriptionResult', (payload) => {
      updateSnapshot((current) => ({
        ...current,
        status: getStatus(),
        transcription: {
          state: 'completed',
          started: current.transcription.started,
          result: payload,
          error: null,
        },
      }));
    }),
    addWakeWordListener('transcriptionError', (payload) => {
      updateSnapshot((current) => ({
        ...current,
        status: getStatus(),
        latestRuntimeError: payload,
        transcription: {
          state: 'error',
          started: current.transcription.started,
          result: null,
          error: payload,
        },
        speech: {
          state: 'idle',
          started: null,
          completed: null,
          error: null,
        },
      }));
    }),
    addWakeWordListener('speechStarted', (payload) => {
      updateSnapshot((current) => ({
        ...current,
        status: getStatus(),
        speech: {
          state: 'speaking',
          started: payload,
          completed: null,
          error: null,
        },
      }));
    }),
    addWakeWordListener('speechCompleted', (payload) => {
      updateSnapshot((current) => ({
        ...current,
        status: getStatus(),
        speech: {
          state: 'completed',
          started: current.speech.started,
          completed: payload,
          error: null,
        },
      }));
    }),
    addWakeWordListener('speechError', (payload) => {
      updateSnapshot((current) => ({
        ...current,
        status: getStatus(),
        latestRuntimeError: payload,
        speech: {
          state: 'error',
          started: current.speech.started,
          completed: null,
          error: payload,
        },
      }));
    }),
  ];
}

function cleanupRuntimeSubscriptions() {
  const subscriptions = runtimeSubscriptions;
  runtimeSubscriptions = [];

  for (const subscription of subscriptions) {
    subscription.remove();
  }
}

function subscribe(listener: () => void) {
  storeListeners.add(listener);

  // Runtime listeners are established once and kept for the module's lifetime.
  //
  // They used to be torn down whenever the subscriber count reached zero, and
  // the snapshot reset with them. Both were wrong: the runtime is a module-level
  // singleton that keeps detecting regardless of what is mounted, so tearing the
  // listeners down dropped every event that arrived before the next mount, and
  // resetting the snapshot reported `idle` for a transcription that was still
  // running. React 19 StrictMode mounts, unmounts and remounts every effect, so
  // that was a normal occurrence rather than an edge case.
  ensureRuntimeSubscriptions();

  // Status is re-read rather than kept, because it can have moved on while
  // nothing was mounted and it is cheap to fetch.
  syncStatus();

  listener();

  return () => {
    storeListeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function useWakeWord(): UseWakeWordResult {
  const currentSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );

  return {
    ...currentSnapshot,
    initialize,
    startDetection,
    stopDetection,
    getStatus,
    dispose,
    addWakeWordListener,
  };
}

export function __resetUseWakeWordStoreForTests() {
  cleanupRuntimeSubscriptions();
  storeListeners.clear();
  snapshot = createInitialSnapshot();
}

export { STORE_EVENT_NAMES };
