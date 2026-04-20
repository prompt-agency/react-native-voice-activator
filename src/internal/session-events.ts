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
    listener(payload);
  }
}
