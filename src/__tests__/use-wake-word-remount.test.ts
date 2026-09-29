/**
 * use-wake-word-remount.test.ts
 *
 * The hook's snapshot mirrors the runtime, and the runtime is a module-level
 * singleton that outlives any component. Resetting the snapshot when the
 * subscriber count crosses zero therefore threw away state the runtime still
 * held, and tearing down the runtime listeners lost every event that arrived
 * before the next mount.
 *
 * React 19 StrictMode makes that a normal occurrence rather than an edge case:
 * it mounts, unmounts and remounts every effect.
 */

describe('useWakeWord across unmount and remount', () => {
  /**
   * useSyncExternalStore is driven directly rather than through React, so the
   * subscribe/unsubscribe lifecycle can be exercised without a renderer.
   */
  async function loadStore() {
    jest.resetModules();

    const listeners = new Map<string, Array<(payload: unknown) => void>>();
    const runtimeStatus: import('../public/types').WakeWordStatus = {
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    };

    let capturedSubscribe: ((listener: () => void) => () => void) | undefined;
    let capturedGetSnapshot:
      | (() => import('../public/types').UseWakeWordSnapshot)
      | undefined;

    jest.doMock('react', () => {
      const actual = jest.requireActual('react');
      return {
        ...actual,
        useSyncExternalStore: (
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => import('../public/types').UseWakeWordSnapshot
        ) => {
          capturedSubscribe = subscribe;
          capturedGetSnapshot = getSnapshot;
          return getSnapshot();
        },
      };
    });

    jest.doMock('../public/voice-activator', () => ({
      getStatus: () => ({ ...runtimeStatus }),
      initialize: jest.fn(),
      startDetection: jest.fn(),
      stopDetection: jest.fn(),
      dispose: jest.fn(),
      addWakeWordListener: (
        event: string,
        listener: (payload: unknown) => void
      ) => {
        const set = listeners.get(event) ?? [];
        set.push(listener);
        listeners.set(event, set);
        return {
          remove: () => {
            listeners.set(
              event,
              (listeners.get(event) ?? []).filter((l) => l !== listener)
            );
          },
        };
      },
    }));

    const mod = await import('../public/useWakeWord');
    mod.__resetUseWakeWordStoreForTests();
    mod.useWakeWord();

    return {
      subscribe: capturedSubscribe!,
      getSnapshot: capturedGetSnapshot!,
      emit: (event: string, payload: unknown) => {
        for (const listener of [...(listeners.get(event) ?? [])]) {
          listener(payload);
        }
      },
      listenerCount: () =>
        [...listeners.values()].reduce((sum, l) => sum + l.length, 0),
      runtimeStatus,
    };
  }

  it('keeps an in-flight transcription visible across a remount', async () => {
    const store = await loadStore();

    const unsubscribe = store.subscribe(() => undefined);
    store.emit('transcriptionStarted', { provider: 'mock-stt' });
    expect(store.getSnapshot().transcription.state).toBe('transcribing');

    // StrictMode: unmount then remount.
    unsubscribe();
    const unsubscribe2 = store.subscribe(() => undefined);

    // The transcription is still running in the runtime, so the hook must not
    // report idle.
    expect(store.getSnapshot().transcription.state).toBe('transcribing');

    unsubscribe2();
  });

  it('does not lose events that arrive while nothing is mounted', async () => {
    const store = await loadStore();

    const unsubscribe = store.subscribe(() => undefined);
    unsubscribe();

    // Between unmount and remount the runtime keeps working.
    store.emit('wakeWordDetected', {
      detectedPhrase: 'hey acme',
      detectedAt: '2026-01-01T00:00:00.000Z',
    });

    const unsubscribe2 = store.subscribe(() => undefined);

    expect(store.getSnapshot().latestWakeWordEvent).toEqual({
      detectedPhrase: 'hey acme',
      detectedAt: '2026-01-01T00:00:00.000Z',
    });

    unsubscribe2();
  });

  it('keeps the last wake word event across a remount', async () => {
    const store = await loadStore();

    const unsubscribe = store.subscribe(() => undefined);
    store.emit('wakeWordDetected', {
      detectedPhrase: 'hey acme',
      detectedAt: '2026-01-01T00:00:00.000Z',
    });
    unsubscribe();

    const unsubscribe2 = store.subscribe(() => undefined);
    expect(store.getSnapshot().latestWakeWordEvent).not.toBeNull();

    unsubscribe2();
  });

  it('refreshes status on resubscribe so a remount never shows stale state', async () => {
    const store = await loadStore();

    const unsubscribe = store.subscribe(() => undefined);
    expect(store.getSnapshot().status.state).toBe('running');
    unsubscribe();

    // The runtime stopped while nothing was mounted.
    store.runtimeStatus.state = 'stopped';
    store.runtimeStatus.isListening = false;

    const unsubscribe2 = store.subscribe(() => undefined);
    expect(store.getSnapshot().status.state).toBe('stopped');
    expect(store.getSnapshot().status.isListening).toBe(false);

    unsubscribe2();
  });

  it('registers runtime listeners once, not per mount', async () => {
    const store = await loadStore();

    const first = store.subscribe(() => undefined);
    const afterFirst = store.listenerCount();
    first();

    const second = store.subscribe(() => undefined);
    expect(store.listenerCount()).toBe(afterFirst);

    second();
  });

  it('still notifies a second concurrent subscriber', async () => {
    const store = await loadStore();

    const seenA: number[] = [];
    const seenB: number[] = [];
    const a = store.subscribe(() => seenA.push(1));
    const b = store.subscribe(() => seenB.push(1));

    store.emit('wakeWordDetected', {
      detectedPhrase: 'hey acme',
      detectedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(seenA.length).toBeGreaterThan(0);
    expect(seenB.length).toBeGreaterThan(0);

    a();
    b();
  });
});
