import type { UseVoiceSessionResult } from '../public/types';

describe('useVoiceSession hook contract', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('initial snapshot has null sessionState and zero turnCount', async () => {
    const sessionListeners = new Map<string, (payload: unknown) => void>();
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

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (name: string, listener: (payload: unknown) => void) => {
          sessionListeners.set(name, listener);
          return { remove: jest.fn() };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => null),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    const result = useVoiceSession();

    expect(result.sessionState).toBeNull();
    expect(result.turnCount).toBe(0);
    expect(result.lastTranscript).toBeNull();
    expect(result.lastSpeechText).toBeNull();
    expect(result.lastError).toBeNull();
  });

  it('sessionStarted and sessionListening events update sessionState', async () => {
    const sessionListeners = new Map<string, (payload: unknown) => void>();
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

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (name: string, listener: (payload: unknown) => void) => {
          sessionListeners.set(name, listener);
          return { remove: jest.fn() };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => null),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    useVoiceSession();

    sessionListeners.get('sessionStarted')?.({});
    expect((latestSnapshot as UseVoiceSessionResult).sessionState).toBe('idle');

    sessionListeners.get('sessionListening')?.({});
    expect((latestSnapshot as UseVoiceSessionResult).sessionState).toBe(
      'listening'
    );
  });

  it('sessionTranscribed updates lastTranscript', async () => {
    const sessionListeners = new Map<string, (payload: unknown) => void>();
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

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (name: string, listener: (payload: unknown) => void) => {
          sessionListeners.set(name, listener);
          return { remove: jest.fn() };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => null),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    useVoiceSession();

    sessionListeners.get('sessionTranscribed')?.({ text: 'user spoke this' });

    expect((latestSnapshot as UseVoiceSessionResult).lastTranscript).toBe(
      'user spoke this'
    );
    expect((latestSnapshot as UseVoiceSessionResult).sessionState).toBe(
      'transcribing'
    );
  });

  it('sessionSpeaking updates lastSpeechText', async () => {
    const sessionListeners = new Map<string, (payload: unknown) => void>();
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

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (name: string, listener: (payload: unknown) => void) => {
          sessionListeners.set(name, listener);
          return { remove: jest.fn() };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => null),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    useVoiceSession();

    sessionListeners.get('sessionSpeaking')?.({ text: 'AI said this' });

    expect((latestSnapshot as UseVoiceSessionResult).lastSpeechText).toBe(
      'AI said this'
    );
    expect((latestSnapshot as UseVoiceSessionResult).sessionState).toBe(
      'speaking'
    );
  });

  it('sessionTurnComplete increments turnCount', async () => {
    const sessionListeners = new Map<string, (payload: unknown) => void>();
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

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (name: string, listener: (payload: unknown) => void) => {
          sessionListeners.set(name, listener);
          return { remove: jest.fn() };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => null),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    useVoiceSession();

    sessionListeners.get('sessionTurnComplete')?.({ turn: 1 });
    expect((latestSnapshot as UseVoiceSessionResult).turnCount).toBe(1);

    sessionListeners.get('sessionTurnComplete')?.({ turn: 2 });
    expect((latestSnapshot as UseVoiceSessionResult).turnCount).toBe(2);
  });

  it('sessionEnded resets sessionState to null', async () => {
    const sessionListeners = new Map<string, (payload: unknown) => void>();
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

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (name: string, listener: (payload: unknown) => void) => {
          sessionListeners.set(name, listener);
          return { remove: jest.fn() };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => null),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    useVoiceSession();

    // First put session in active state
    sessionListeners.get('sessionListening')?.({});
    expect((latestSnapshot as UseVoiceSessionResult).sessionState).toBe(
      'listening'
    );

    // Then end it
    sessionListeners.get('sessionEnded')?.({ reason: 'explicit' });
    expect((latestSnapshot as UseVoiceSessionResult).sessionState).toBeNull();
  });

  it('sessionError updates lastError', async () => {
    const sessionListeners = new Map<string, (payload: unknown) => void>();
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

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (name: string, listener: (payload: unknown) => void) => {
          sessionListeners.set(name, listener);
          return { remove: jest.fn() };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => null),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    useVoiceSession();

    const errorPayload = {
      code: 'stt_failed',
      category: 'internal' as const,
      message: 'mic error',
      recoverable: true,
    };
    sessionListeners.get('sessionError')?.(errorPayload);

    expect((latestSnapshot as UseVoiceSessionResult).lastError).toEqual(
      errorPayload
    );
    expect((latestSnapshot as UseVoiceSessionResult).sessionState).toBe('idle');
  });

  it('listen() delegates to getSession().listen() when session active', async () => {
    const sessionListeners = new Map<string, (payload: unknown) => void>();
    const mockListen = jest.fn(async () => undefined);
    const mockSession = {
      listen: mockListen,
      close: jest.fn(async () => undefined),
    };

    jest.doMock('react', () => {
      const actual = jest.requireActual('react');
      return {
        ...actual,
        useSyncExternalStore(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) {
          subscribe(() => {});
          return getSnapshot();
        },
      };
    });

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (name: string, listener: (payload: unknown) => void) => {
          sessionListeners.set(name, listener);
          return { remove: jest.fn() };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => mockSession),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    const result = useVoiceSession();

    await result.listen();
    expect(mockListen).toHaveBeenCalledTimes(1);
  });

  it('close() delegates to getSession().close() when session active', async () => {
    const sessionListeners = new Map<string, (payload: unknown) => void>();
    const mockClose = jest.fn(async () => undefined);
    const mockSession = {
      listen: jest.fn(async () => undefined),
      close: mockClose,
    };

    jest.doMock('react', () => {
      const actual = jest.requireActual('react');
      return {
        ...actual,
        useSyncExternalStore(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) {
          subscribe(() => {});
          return getSnapshot();
        },
      };
    });

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (name: string, listener: (payload: unknown) => void) => {
          sessionListeners.set(name, listener);
          return { remove: jest.fn() };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => mockSession),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    const result = useVoiceSession();

    await result.close();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('listen() returns resolved promise when no active session', async () => {
    jest.doMock('react', () => {
      const actual = jest.requireActual('react');
      return {
        ...actual,
        useSyncExternalStore(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) {
          subscribe(() => {});
          return getSnapshot();
        },
      };
    });

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(() => ({ remove: jest.fn() })),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => null),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    const result = useVoiceSession();

    // Should not throw — resolves to undefined
    await expect(result.listen()).resolves.toBeUndefined();
    await expect(result.close()).resolves.toBeUndefined();
  });

  it('unsubscribing last listener cleans up session subscriptions', async () => {
    const removeMocks: jest.Mock[] = [];
    let unsubscribe: (() => void) | undefined;

    jest.doMock('react', () => {
      const actual = jest.requireActual('react');
      return {
        ...actual,
        useSyncExternalStore(
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) {
          unsubscribe = subscribe(() => {});
          return getSnapshot();
        },
      };
    });

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(
        (_name: string, _listener: (payload: unknown) => void) => {
          const remove = jest.fn();
          removeMocks.push(remove);
          return { remove };
        }
      ),
    }));

    jest.doMock('../public/voice-activator', () => ({
      getSession: jest.fn(() => null),
    }));

    const { useVoiceSession } = await import('../public/useVoiceSession');
    useVoiceSession();

    // Should have subscribed to 7 session events
    expect(removeMocks).toHaveLength(7);

    // Unsubscribing the last listener triggers cleanup
    unsubscribe?.();
    for (const remove of removeMocks) {
      expect(remove).toHaveBeenCalledTimes(1);
    }
  });
});
