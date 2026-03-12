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

function cloneSnapshot(snapshot: UseWakeWordSnapshot): UseWakeWordSnapshot {
  return {
    ...snapshot,
    status: {
      ...snapshot.status,
      lastError: snapshot.status.lastError
        ? { ...snapshot.status.lastError }
        : snapshot.status.lastError,
    },
    latestWakeWordEvent: snapshot.latestWakeWordEvent
      ? { ...snapshot.latestWakeWordEvent }
      : null,
    latestRuntimeError: snapshot.latestRuntimeError
      ? { ...snapshot.latestRuntimeError }
      : null,
    latestInterruption: snapshot.latestInterruption
      ? { ...snapshot.latestInterruption }
      : null,
    latestAudioRouteChange: snapshot.latestAudioRouteChange
      ? { ...snapshot.latestAudioRouteChange }
      : null,
    transcription: {
      ...snapshot.transcription,
      started: snapshot.transcription.started
        ? { ...snapshot.transcription.started }
        : null,
      result: snapshot.transcription.result
        ? { ...snapshot.transcription.result }
        : null,
      error: snapshot.transcription.error
        ? { ...snapshot.transcription.error }
        : null,
    },
    speech: {
      ...snapshot.speech,
      started: snapshot.speech.started ? { ...snapshot.speech.started } : null,
      completed: snapshot.speech.completed
        ? { ...snapshot.speech.completed }
        : null,
      error: snapshot.speech.error ? { ...snapshot.speech.error } : null,
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
  const isFirstSubscriber = storeListeners.size === 0;
  storeListeners.add(listener);

  if (isFirstSubscriber) {
    snapshot = createInitialSnapshot();
  }

  ensureRuntimeSubscriptions();
  listener();

  return () => {
    storeListeners.delete(listener);

    if (storeListeners.size === 0) {
      cleanupRuntimeSubscriptions();
      snapshot = createInitialSnapshot();
    }
  };
}

function getSnapshot() {
  return cloneSnapshot(snapshot);
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
