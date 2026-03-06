import type {
  WakeWordError,
  WakeWordState,
  WakeWordStatus,
} from '../public/types';
import { emitRuntimeEvent } from './runtime-events';

function cloneStatus(status: WakeWordStatus): WakeWordStatus {
  return {
    ...status,
    lastError: status.lastError ? { ...status.lastError } : status.lastError,
  };
}

export function createRuntimeStore(initialStatus: WakeWordStatus) {
  let currentStatus = cloneStatus(initialStatus);

  function setStatus(nextStatus: WakeWordStatus) {
    const previousState = currentStatus.state;
    currentStatus = cloneStatus(nextStatus);

    if (previousState !== nextStatus.state) {
      emitRuntimeEvent('stateChanged', {
        previousState,
        state: nextStatus.state,
      });
    }
  }

  return {
    getStatus() {
      return cloneStatus(currentStatus);
    },
    setStatus,
    transitionToState(
      state: WakeWordState,
      overrides: Partial<WakeWordStatus> = {}
    ) {
      setStatus({
        ...currentStatus,
        ...overrides,
        state,
      });
    },
    recordError(error: WakeWordError, nextState?: WakeWordState) {
      const previousState = currentStatus.state;
      currentStatus = cloneStatus({
        ...currentStatus,
        ...(nextState ? { state: nextState } : {}),
        lastError: error,
      });

      if (previousState !== currentStatus.state) {
        emitRuntimeEvent('stateChanged', {
          previousState,
          state: currentStatus.state,
        });
      }

      emitRuntimeEvent('error', { ...error });
    },
  };
}
