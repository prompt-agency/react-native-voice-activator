import type {
  VoiceActivatorEventMap,
  WakeWordEventListener,
  WakeWordEventName,
  WakeWordSubscription,
} from '../public/types';

type ListenerRegistry = {
  [TEventName in WakeWordEventName]: Set<WakeWordEventListener<TEventName>>;
};

const listeners: ListenerRegistry = {
  stateChanged: new Set(),
  wakeWordDetected: new Set(),
  error: new Set(),
  interruption: new Set(),
  audioRouteChanged: new Set(),
  transcriptionStarted: new Set(),
  transcriptionResult: new Set(),
  transcriptionError: new Set(),
  speechStarted: new Set(),
  speechCompleted: new Set(),
  speechError: new Set(),
};

export function addRuntimeListener<TEventName extends WakeWordEventName>(
  eventName: TEventName,
  listener: WakeWordEventListener<TEventName>
): WakeWordSubscription {
  const eventListeners = listeners[eventName] as Set<typeof listener>;
  eventListeners.add(listener);

  return {
    remove() {
      eventListeners.delete(listener);
    },
  };
}

export function emitRuntimeEvent<TEventName extends WakeWordEventName>(
  eventName: TEventName,
  payload: VoiceActivatorEventMap[TEventName]
) {
  const eventListeners = [...listeners[eventName]] as Array<
    WakeWordEventListener<TEventName>
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
          `[VoiceActivator] runtime "${eventName}" listener threw:`,
          cause
        );
      }
    }
  }
}
