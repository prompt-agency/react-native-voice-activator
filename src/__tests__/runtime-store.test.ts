// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../internal/runtime-events', () => ({
  emitRuntimeEvent: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { createRuntimeStore } from '../internal/runtime-store';
import { emitRuntimeEvent } from '../internal/runtime-events';

const mockEmit = emitRuntimeEvent as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInitialStatus() {
  return {
    state: 'idle' as const,
    isAvailable: true,
    isListening: false,
    canStart: true,
    lastError: null,
  };
}

const testError = {
  category: 'internal' as const,
  code: 'test_error',
  message: 'Test error',
  recoverable: true,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createRuntimeStore', () => {
  // ─── getStatus ──────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns the initial status', () => {
      const store = createRuntimeStore(makeInitialStatus());
      expect(store.getStatus()).toEqual(makeInitialStatus());
    });

    it('returns a copy — mutations do not affect internal state', () => {
      const store = createRuntimeStore(makeInitialStatus());
      const snapshot = store.getStatus();
      (snapshot as unknown as Record<string, unknown>).state = 'error';
      expect(store.getStatus().state).toBe('idle');
    });
  });

  // ─── setStatus ──────────────────────────────────────────────────────────────

  describe('setStatus', () => {
    it('updates the stored status', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.setStatus({
        ...makeInitialStatus(),
        state: 'running',
        isListening: true,
      });
      expect(store.getStatus().state).toBe('running');
      expect(store.getStatus().isListening).toBe(true);
    });

    it('emits stateChanged when state changes', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.setStatus({ ...makeInitialStatus(), state: 'running' });
      expect(mockEmit).toHaveBeenCalledWith('stateChanged', {
        previousState: 'idle',
        state: 'running',
      });
    });

    it('emits stateChanged when isListening changes', () => {
      const store = createRuntimeStore(makeInitialStatus());
      mockEmit.mockClear();
      store.setStatus({ ...makeInitialStatus(), isListening: true });
      expect(mockEmit).toHaveBeenCalledWith(
        'stateChanged',
        expect.objectContaining({ state: 'idle' })
      );
    });

    it('emits stateChanged when isAvailable changes', () => {
      const store = createRuntimeStore(makeInitialStatus());
      mockEmit.mockClear();
      store.setStatus({ ...makeInitialStatus(), isAvailable: false });
      expect(mockEmit).toHaveBeenCalledWith('stateChanged', expect.any(Object));
    });

    it('does not emit stateChanged when no observable fields change', () => {
      const store = createRuntimeStore(makeInitialStatus());
      mockEmit.mockClear();
      // Updating only lastError does not trigger stateChanged
      store.setStatus({ ...makeInitialStatus(), lastError: testError });
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  // ─── transitionToState ──────────────────────────────────────────────────────

  describe('transitionToState', () => {
    it('changes state to the provided value', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.transitionToState('ready');
      expect(store.getStatus().state).toBe('ready');
    });

    it('applies extra override fields', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.transitionToState('initializing', {
        canStart: false,
        isListening: false,
        lastError: null,
      });
      const status = store.getStatus();
      expect(status.state).toBe('initializing');
      expect(status.canStart).toBe(false);
    });

    it('emits stateChanged with previous and next state', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.transitionToState('ready');
      expect(mockEmit).toHaveBeenCalledWith('stateChanged', {
        previousState: 'idle',
        state: 'ready',
      });
    });
  });

  // ─── recordError ────────────────────────────────────────────────────────────

  describe('recordError', () => {
    it('stores the error in lastError', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.recordError(testError);
      expect(store.getStatus().lastError).toEqual(testError);
    });

    it('emits error event', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.recordError(testError);
      expect(mockEmit).toHaveBeenCalledWith('error', testError);
    });

    it('transitions to nextState when provided', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.recordError(testError, 'error');
      expect(store.getStatus().state).toBe('error');
    });

    it('emits stateChanged when nextState differs from current state', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.recordError(testError, 'error');
      expect(mockEmit).toHaveBeenCalledWith('stateChanged', {
        previousState: 'idle',
        state: 'error',
      });
    });

    it('does not change state when nextState is not provided', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.recordError(testError);
      expect(store.getStatus().state).toBe('idle');
    });

    it('does not emit stateChanged when nextState equals current state', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.recordError(testError, 'idle'); // same as initial
      const stateChangedCalls = mockEmit.mock.calls.filter(
        ([name]) => name === 'stateChanged'
      );
      expect(stateChangedCalls).toHaveLength(0);
    });
  });

  // ─── mergeLastError ─────────────────────────────────────────────────────────

  describe('mergeLastError', () => {
    const engineError = {
      category: 'engine' as const,
      code: 'engine_error',
      message: 'Engine failed',
      recoverable: false,
    };

    it('stores the error in lastError', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.mergeLastError(engineError);
      expect(store.getStatus().lastError).toEqual(engineError);
    });

    it('does not change state', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.mergeLastError(engineError);
      expect(store.getStatus().state).toBe('idle');
    });

    it('emits error event', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.mergeLastError(engineError);
      expect(mockEmit).toHaveBeenCalledWith('error', engineError);
    });

    it('does not emit stateChanged', () => {
      const store = createRuntimeStore(makeInitialStatus());
      store.mergeLastError(engineError);
      const stateChangedCalls = mockEmit.mock.calls.filter(
        ([name]) => name === 'stateChanged'
      );
      expect(stateChangedCalls).toHaveLength(0);
    });
  });
});
