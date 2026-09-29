import { useSyncExternalStore } from 'react';

import { addSessionListener } from '../internal/session-events';
import { getSession } from './voice-activator';
import type {
  UseVoiceSessionResult,
  UseVoiceSessionSnapshot,
  VoiceSessionSubscription,
} from './types';

function createInitialSnapshot(): UseVoiceSessionSnapshot {
  return {
    sessionState: null,
    lastTranscript: null,
    lastSpeechText: null,
    lastError: null,
    turnCount: 0,
  };
}

let snapshot = createInitialSnapshot();
const storeListeners = new Set<() => void>();
let sessionSubscriptions: VoiceSessionSubscription[] = [];

function notifyStoreListeners() {
  const listeners = [...storeListeners];
  for (const listener of listeners) {
    listener();
  }
}

function updateSnapshot(
  update:
    | Partial<UseVoiceSessionSnapshot>
    | ((current: UseVoiceSessionSnapshot) => UseVoiceSessionSnapshot)
) {
  snapshot =
    typeof update === 'function'
      ? update(snapshot)
      : { ...snapshot, ...update };
  notifyStoreListeners();
}

function ensureSessionSubscriptions() {
  if (sessionSubscriptions.length > 0) return;

  sessionSubscriptions = [
    addSessionListener('sessionStarted', () => {
      updateSnapshot({ sessionState: 'idle', lastError: null, turnCount: 0 });
    }),
    addSessionListener('sessionListening', () => {
      updateSnapshot({ sessionState: 'listening' });
    }),
    addSessionListener('sessionTranscribed', (payload) => {
      updateSnapshot({
        sessionState: 'transcribing',
        lastTranscript: payload.text,
      });
    }),
    addSessionListener('sessionSpeaking', (payload) => {
      updateSnapshot({
        sessionState: 'speaking',
        lastSpeechText: payload.text,
      });
    }),
    addSessionListener('sessionTurnComplete', (payload) => {
      updateSnapshot({ sessionState: 'idle', turnCount: payload.turn });
    }),
    addSessionListener('sessionEnded', () => {
      updateSnapshot({ sessionState: null });
    }),
    addSessionListener('sessionError', (payload) => {
      updateSnapshot({
        sessionState: 'idle',
        lastError: payload,
      });
    }),
  ];
}

function cleanupSessionSubscriptions() {
  const subscriptions = sessionSubscriptions;
  sessionSubscriptions = [];
  for (const sub of subscriptions) {
    sub.remove();
  }
}

function subscribe(listener: () => void) {
  storeListeners.add(listener);

  // Session listeners are established once and kept for the module's lifetime,
  // for the same reason as useWakeWord: a session keeps running whether or not a
  // component is mounted. Tearing the listeners down on unmount dropped every
  // event that arrived before the next mount, and resetting the snapshot
  // reported no session while one was mid-turn. React 19 StrictMode mounts,
  // unmounts and remounts every effect, so that was the common case.
  //
  // Unlike useWakeWord there is no status to re-read: everything here is
  // event-derived, so the retained snapshot IS the current state.
  ensureSessionSubscriptions();
  listener();
  return () => {
    storeListeners.delete(listener);
  };
}

function getSnapshot(): UseVoiceSessionSnapshot {
  return snapshot;
}

export function useVoiceSession(): UseVoiceSessionResult {
  const currentSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );
  return {
    ...currentSnapshot,
    listen() {
      return getSession()?.listen() ?? Promise.resolve();
    },
    close() {
      return getSession()?.close() ?? Promise.resolve();
    },
  };
}

export function __resetUseVoiceSessionStoreForTests() {
  cleanupSessionSubscriptions();
  storeListeners.clear();
  snapshot = createInitialSnapshot();
}
