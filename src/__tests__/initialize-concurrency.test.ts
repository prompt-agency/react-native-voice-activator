/**
 * initialize-concurrency.test.ts
 *
 * initialize() operates on module-level globals with no per-call token. Two
 * overlapping calls each built an engine runtime, each awaited native
 * initialize(), and each then assigned activeEngineRuntime. Last writer won and
 * the loser's already-initialized native handle was never disposed, because
 * disposeEngineRuntime() only ever touches the current pointer.
 *
 * Reachable from React 19 StrictMode's double-invoke, a double-tap on a
 * "Start" button, or two screens each initializing on mount.
 */

import type { WakeWordDetectedEvent } from '../public/types';

async function flushAsync(passes = 5) {
  for (let i = 0; i < passes; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Resolves only when release() is called, so two calls can be interleaved. */
function deferred<T = void>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('concurrent initialize()', () => {
  const created: Array<{
    initialize: jest.Mock;
    start: jest.Mock;
    stop: jest.Mock;
    dispose: jest.Mock;
  }> = [];

  function setupMocks(engineInitGate?: () => Promise<void>) {
    created.length = 0;

    const runtimeBridge = {
      initialize: jest.fn().mockResolvedValue(undefined),
      startDetection: jest.fn().mockResolvedValue(undefined),
      stopDetection: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({
        state: 'ready',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      }),
    };

    jest.doMock('../internal/native-module', () => ({
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(
        (_h: (p: WakeWordDetectedEvent) => void) => undefined
      ),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => {
        const runtime = {
          initialize: jest.fn(async () => {
            if (engineInitGate) {
              await engineInitGate();
            }
          }),
          start: jest.fn().mockResolvedValue(undefined),
          stop: jest.fn().mockResolvedValue(undefined),
          dispose: jest.fn().mockResolvedValue(undefined),
        };
        created.push(runtime);
        return runtime;
      }),
    }));

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(() => ({ remove: jest.fn() })),
      emitSessionEvent: jest.fn(),
    }));
  }

  beforeEach(() => {
    jest.resetModules();
  });

  it('never leaves an initialized engine runtime undisposed', async () => {
    const gate = deferred();
    let callCount = 0;

    // Both calls block inside engine initialize() so they genuinely overlap.
    setupMocks(async () => {
      callCount += 1;
      await gate.promise;
    });

    const { initialize, dispose } = await import('../public/voice-activator');

    const first = initialize({ enableDebugLogging: false });
    const second = initialize({ enableDebugLogging: true });

    await flushAsync();
    expect(callCount).toBe(2);

    gate.release();
    await Promise.allSettled([first, second]);
    await flushAsync();

    expect(created).toHaveLength(2);

    // Exactly one runtime may remain live. Whichever lost the race must have
    // been disposed rather than orphaned.
    await dispose();
    await flushAsync();

    for (const runtime of created) {
      expect(runtime.dispose).toHaveBeenCalled();
    }
  });

  it('leaves the runtime usable after overlapping calls', async () => {
    const gate = deferred();
    setupMocks(async () => {
      await gate.promise;
    });

    const { initialize, startDetection, getStatus } =
      await import('../public/voice-activator');

    const first = initialize({});
    const second = initialize({});

    await flushAsync();
    gate.release();
    await Promise.allSettled([first, second]);
    await flushAsync();

    // A surviving, initialized runtime must still be startable.
    await expect(startDetection()).resolves.not.toThrow();
    expect(getStatus().state).not.toBe('error');
  });
});
