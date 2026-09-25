import type {
  VoiceSessionEventMap,
  VoiceSessionEventListener,
  VoiceSessionEventName,
  VoiceSessionSubscription,
} from '../public/types';

type SessionListenerRegistry = {
  [TEventName in VoiceSessionEventName]: Set<
    VoiceSessionEventListener<TEventName>
  >;
};

const listeners: SessionListenerRegistry = {
  sessionStarted: new Set(),
  sessionListening: new Set(),
  sessionTranscribed: new Set(),
  sessionSpeaking: new Set(),
  sessionTurnComplete: new Set(),
  sessionEnded: new Set(),
  sessionError: new Set(),
  speechStart: new Set(),
  speechEnd: new Set(),
  speakerVerificationPassed: new Set(),
  speakerVerificationFailed: new Set(),
};

export function addSessionListener<TEventName extends VoiceSessionEventName>(
  eventName: TEventName,
  listener: VoiceSessionEventListener<TEventName>
): VoiceSessionSubscription {
  const eventListeners = listeners[eventName] as Set<typeof listener>;
  eventListeners.add(listener);

  return {
    remove() {
      eventListeners.delete(listener);
    },
  };
}

export function emitSessionEvent<TEventName extends VoiceSessionEventName>(
  eventName: TEventName,
  payload: VoiceSessionEventMap[TEventName]
) {
  const eventListeners = [...listeners[eventName]] as Array<
    VoiceSessionEventListener<TEventName>
  >;

  for (const listener of eventListeners) {
    // A throwing consumer listener must not abort the dispatch loop, and must
    // not propagate back into the internal code that triggered the emit. An
    // 'error' listener that throws would otherwise abort the very rollback
    // path that emitted it. VoiceSessionOrchestrator._emitAll already guards
    // its per-instance listeners this way; these are the buses that
    // addWakeWordListener / addSessionListener actually use.
    try {
      listener(payload);
    } catch (cause) {
      if (__DEV__) {
        console.warn(
          `[VoiceActivator] session "${eventName}" listener threw:`,
          cause
        );
      }
    }
  }
}
