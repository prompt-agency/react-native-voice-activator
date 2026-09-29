describe('useWakeWord hook contract', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('projects runtime status and provider lifecycle events through a hook snapshot', async () => {
    const runtimeStatus: import('../public/types').WakeWordStatus = {
      state: 'idle' as const,
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };
    const listeners = new Map<string, (payload: unknown) => void>();
    const removeMocks: jest.Mock[] = [];
    const initialize = jest.fn(async () => {
      runtimeStatus.state = 'ready';
      runtimeStatus.canStart = true;
    });
    const startDetection = jest.fn(async () => {
      runtimeStatus.state = 'running';
      runtimeStatus.isListening = true;
      runtimeStatus.canStart = false;
    });
    const stopDetection = jest.fn(async () => {
      runtimeStatus.state = 'stopped';
      runtimeStatus.isListening = false;
      runtimeStatus.canStart = true;
    });
    const dispose = jest.fn(async () => {
      runtimeStatus.state = 'idle';
      runtimeStatus.isListening = false;
      runtimeStatus.canStart = true;
    });

    let latestSnapshot: unknown;
    let unsubscribe: (() => void) | undefined;

    jest.doMock('react', () => {
      const actual = jest.requireActual('react');

      return {
        ...actual,
        useSyncExternalStore(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) {
          latestSnapshot = getSnapshot();
          unsubscribe = subscribe(() => {
            latestSnapshot = getSnapshot();
          });
          return latestSnapshot;
        },
      };
    });

    jest.doMock('../public/voice-activator', () => ({
      addWakeWordListener: jest.fn(
        (eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener);
          const remove = jest.fn(() => {
            listeners.delete(eventName);
          });
          removeMocks.push(remove);
          return { remove };
        }
      ),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      initialize,
      startDetection,
      stopDetection,
      dispose,
    }));

    const { useWakeWord } = await import('../public/useWakeWord');
    const hook = useWakeWord();

    expect(hook.status).toEqual({
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    });
    expect(hook.transcription.state).toBe('idle');
    expect(hook.speech.state).toBe('idle');

    await hook.startDetection();
    listeners.get('stateChanged')?.({
      previousState: 'ready',
      state: 'running',
    });

    expect((latestSnapshot as typeof hook).status).toEqual({
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    });

    listeners.get('wakeWordDetected')?.({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T12:00:00.000Z',
    });
    listeners.get('transcriptionStarted')?.({
      provider: 'test-stt',
    });
    listeners.get('transcriptionResult')?.({
      text: 'hello world',
      provider: 'test-stt',
      confidence: 0.92,
    });
    listeners.get('speechStarted')?.({
      text: 'hello world',
      provider: 'test-tts',
    });
    listeners.get('speechCompleted')?.({
      provider: 'test-tts',
    });

    expect((latestSnapshot as typeof hook).latestWakeWordEvent).toEqual({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T12:00:00.000Z',
    });
    expect((latestSnapshot as typeof hook).transcription).toEqual({
      state: 'completed',
      started: { provider: 'test-stt' },
      result: {
        text: 'hello world',
        provider: 'test-stt',
        confidence: 0.92,
      },
      error: null,
    });
    expect((latestSnapshot as typeof hook).speech).toEqual({
      state: 'completed',
      started: {
        text: 'hello world',
        provider: 'test-tts',
      },
      completed: { provider: 'test-tts' },
      error: null,
    });
    expect(hook.startDetection).toBe(startDetection);
    expect(hook.stopDetection).toBe(stopDetection);
    expect(hook.initialize).toBe(initialize);
    expect(hook.dispose).toBe(dispose);

    unsubscribe?.();

    // All eleven runtime listeners are registered, and deliberately NOT removed
    // on unsubscribe: the runtime keeps emitting whether or not a component is
    // mounted, and tearing them down dropped events between an unmount and the
    // next mount. __resetUseWakeWordStoreForTests() is what releases them.
    expect(removeMocks).toHaveLength(11);
    for (const remove of removeMocks) {
      expect(remove).not.toHaveBeenCalled();
    }
  });

  it('remains truthful in unsupported and no-provider paths', async () => {
    const runtimeStatus: import('../public/types').WakeWordStatus = {
      state: 'unsupported' as const,
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'VoiceActivator requires the native runtime module. Detection is unavailable until the package is installed and built in a supported native environment.',
      lastError: null,
    };
    const listeners = new Map<string, (payload: unknown) => void>();
    let latestSnapshot: unknown;

    jest.doMock('react', () => {
      const actual = jest.requireActual('react');

      return {
        ...actual,
        useSyncExternalStore(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) {
          latestSnapshot = getSnapshot();
          subscribe(() => {
            latestSnapshot = getSnapshot();
          });
          return latestSnapshot;
        },
      };
    });

    jest.doMock('../public/voice-activator', () => ({
      addWakeWordListener: jest.fn(
        (eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener);
          return {
            remove: jest.fn(() => {
              listeners.delete(eventName);
            }),
          };
        }
      ),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      initialize: jest.fn(async () => {
        throw new Error('unsupported');
      }),
      startDetection: jest.fn(async () => {
        throw new Error('unsupported');
      }),
      stopDetection: jest.fn(async () => {
        throw new Error('unsupported');
      }),
      dispose: jest.fn(async () => {
        throw new Error('unsupported');
      }),
    }));

    const { useWakeWord } = await import('../public/useWakeWord');
    const hook = useWakeWord();

    expect(hook.status).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'VoiceActivator requires the native runtime module. Detection is unavailable until the package is installed and built in a supported native environment.',
      lastError: null,
    });
    expect(hook.latestWakeWordEvent).toBeNull();
    expect(hook.latestRuntimeError).toBeNull();
    expect(hook.transcription).toEqual({
      state: 'idle',
      started: null,
      result: null,
      error: null,
    });
    expect(hook.speech).toEqual({
      state: 'idle',
      started: null,
      completed: null,
      error: null,
    });

    listeners.get('wakeWordDetected')?.({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T12:00:00.000Z',
    });

    expect((latestSnapshot as typeof hook).latestWakeWordEvent).toEqual({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T12:00:00.000Z',
    });
    expect((latestSnapshot as typeof hook).transcription.state).toBe('idle');
    expect((latestSnapshot as typeof hook).speech.state).toBe('idle');
  });

  it('re-reads status on resubscribe while preserving event history across a remount', async () => {
    const runtimeStatus: import('../public/types').WakeWordStatus = {
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: {
        category: 'engine',
        code: 'engine_runtime_failed',
        message: 'The built-in wake word engine failed while running.',
        recoverable: true,
      },
    };
    const listeners = new Map<string, (payload: unknown) => void>();
    let latestSnapshot: unknown;
    let unsubscribe: (() => void) | undefined;

    jest.doMock('react', () => {
      const actual = jest.requireActual('react');

      return {
        ...actual,
        useSyncExternalStore(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) {
          latestSnapshot = getSnapshot();
          unsubscribe = subscribe(() => {
            latestSnapshot = getSnapshot();
          });
          return latestSnapshot;
        },
      };
    });

    jest.doMock('../public/voice-activator', () => ({
      addWakeWordListener: jest.fn(
        (eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener);
          return {
            remove: jest.fn(() => {
              listeners.delete(eventName);
            }),
          };
        }
      ),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      dispose: jest.fn(async () => undefined),
    }));

    const { __resetUseWakeWordStoreForTests, useWakeWord } =
      await import('../public/useWakeWord');

    __resetUseWakeWordStoreForTests();
    const hook = useWakeWord();

    expect(hook.status).toEqual({
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: {
        category: 'engine',
        code: 'engine_runtime_failed',
        message: 'The built-in wake word engine failed while running.',
        recoverable: true,
      },
    });
    expect(hook.latestRuntimeError).toEqual({
      category: 'engine',
      code: 'engine_runtime_failed',
      message: 'The built-in wake word engine failed while running.',
      recoverable: true,
    });

    listeners.get('wakeWordDetected')?.({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T13:00:00.000Z',
    });

    expect((latestSnapshot as typeof hook).latestWakeWordEvent).toEqual({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T13:00:00.000Z',
    });

    unsubscribe?.();

    runtimeStatus.state = 'ready';
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = true;
    runtimeStatus.lastError = null;

    const remountedHook = useWakeWord();

    // Status is re-read on resubscribe, so a remount never shows a stale runtime
    // state.
    expect(remountedHook.status).toEqual({
      state: 'ready',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    });

    // Event history is NOT reset. The runtime is a module-level singleton that
    // outlives any component, so clearing the snapshot on unmount reported
    // `idle` for work the runtime was still doing, and dropped events that
    // arrived before the next mount. React 19 StrictMode makes that the common
    // case rather than an edge case.
    expect(remountedHook.latestRuntimeError).not.toBeNull();
  });

  it('preserves the shared snapshot across concurrent subscribers', async () => {
    const runtimeStatus: import('../public/types').WakeWordStatus = {
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    };
    const listeners = new Map<string, (payload: unknown) => void>();
    const snapshots: unknown[] = [];
    const unsubscribers: Array<(() => void) | undefined> = [];

    jest.doMock('react', () => {
      const actual = jest.requireActual('react');

      return {
        ...actual,
        useSyncExternalStore(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) {
          const index = snapshots.length;
          snapshots[index] = getSnapshot();
          unsubscribers[index] = subscribe(() => {
            snapshots[index] = getSnapshot();
          });
          return snapshots[index];
        },
      };
    });

    jest.doMock('../public/voice-activator', () => ({
      addWakeWordListener: jest.fn(
        (eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener);
          return {
            remove: jest.fn(() => {
              listeners.delete(eventName);
            }),
          };
        }
      ),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      dispose: jest.fn(async () => undefined),
    }));

    const { __resetUseWakeWordStoreForTests, useWakeWord } =
      await import('../public/useWakeWord');

    __resetUseWakeWordStoreForTests();

    useWakeWord();
    listeners.get('wakeWordDetected')?.({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T14:00:00.000Z',
    });

    expect(
      (snapshots[0] as import('../public/types').UseWakeWordResult)
        .latestWakeWordEvent
    ).toEqual({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T14:00:00.000Z',
    });

    const secondHook = useWakeWord();

    expect(secondHook.latestWakeWordEvent).toEqual({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T14:00:00.000Z',
    });
    expect(
      (snapshots[0] as import('../public/types').UseWakeWordResult)
        .latestWakeWordEvent
    ).toEqual({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T14:00:00.000Z',
    });

    unsubscribers[0]?.();
    unsubscribers[1]?.();
  });

  it('surfaces provider errors through latestRuntimeError', async () => {
    const runtimeStatus: import('../public/types').WakeWordStatus = {
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    };
    const listeners = new Map<string, (payload: unknown) => void>();
    let latestSnapshot: unknown;

    jest.doMock('react', () => {
      const actual = jest.requireActual('react');

      return {
        ...actual,
        useSyncExternalStore(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) {
          latestSnapshot = getSnapshot();
          subscribe(() => {
            latestSnapshot = getSnapshot();
          });
          return latestSnapshot;
        },
      };
    });

    jest.doMock('../public/voice-activator', () => ({
      addWakeWordListener: jest.fn(
        (eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener);
          return {
            remove: jest.fn(() => {
              listeners.delete(eventName);
            }),
          };
        }
      ),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      dispose: jest.fn(async () => undefined),
    }));

    const { useWakeWord } = await import('../public/useWakeWord');
    useWakeWord();

    listeners.get('transcriptionError')?.({
      provider: 'test-stt',
      category: 'engine',
      code: 'stt_failed',
      message: 'STT failed',
      recoverable: true,
    });

    expect(
      (latestSnapshot as ReturnType<typeof useWakeWord>).latestRuntimeError
    ).toEqual({
      provider: 'test-stt',
      category: 'engine',
      code: 'stt_failed',
      message: 'STT failed',
      recoverable: true,
    });
    expect(
      (latestSnapshot as ReturnType<typeof useWakeWord>).transcription.error
    ).toEqual({
      provider: 'test-stt',
      category: 'engine',
      code: 'stt_failed',
      message: 'STT failed',
      recoverable: true,
    });
  });
});
