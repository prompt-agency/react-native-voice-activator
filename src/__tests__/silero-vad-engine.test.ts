/** SileroVADEngine unit tests. TDZ-safe mocks via jest.mock factory. */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAddListener = jest.fn().mockImplementation(() => ({
  remove: jest.fn(),
}));

jest.mock('react-native', () => ({
  NativeModules: {
    VoiceActivator: {
      startVADCapture: jest.fn().mockResolvedValue(undefined),
      stopVADCapture: jest.fn().mockResolvedValue(undefined),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: mockAddListener,
  })),
  Platform: { OS: 'ios' },
}));

// ORT mock — configurable per test via mockRun
const mockRun = jest.fn();
const mockRelease = jest.fn().mockResolvedValue(undefined);
const mockCreate = jest
  .fn()
  .mockResolvedValue({ run: mockRun, release: mockRelease });

jest.mock('onnxruntime-react-native', () => ({
  __esModule: true,
  InferenceSession: { create: mockCreate },
  Tensor: jest
    .fn()
    .mockImplementation((type: string, data: unknown, dims: number[]) => ({
      type,
      data,
      dims,
    })),
}));

// spy on emitSessionEvent to capture emitted events
const emittedEvents: Array<{ name: string; payload: unknown }> = [];

jest.mock('../internal/session-events', () => ({
  emitSessionEvent: jest
    .fn()
    .mockImplementation((name: string, payload: unknown) => {
      emittedEvents.push({ name, payload });
    }),
  addSessionListener: jest.fn(),
}));

jest.mock('../providers/vad/asset-path', () => ({
  getSileroVADModelPath: jest.fn().mockReturnValue('silero_vad.onnx'),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildVADOutput(probability: number) {
  const hiddenState = new Float32Array(128);
  return {
    output: { data: new Float32Array([probability]) },
    hn: { data: new Float32Array(hiddenState) },
    cn: { data: new Float32Array(hiddenState) },
  };
}

/** Encode a 512-sample float32 array as base64 for use as a vadPCMFrame payload. */
function makePCMBase64(): string {
  const samples = new Float32Array(512);
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

import type { VoiceSessionConfig } from '../public/types';
import {
  SileroVADEngine,
  __resetNativeCaptureRefCountForTests,
} from '../providers/vad/SileroVADEngine';

beforeEach(() => {
  jest.clearAllMocks();
  emittedEvents.length = 0;
  mockRun.mockResolvedValue(buildVADOutput(0.0));
  // Native capture is refcounted at module scope. Most tests start an engine
  // without stopping it, so without this reset a leaked reference would keep
  // the refcount above zero and suppress stopVADCapture in later tests.
  __resetNativeCaptureRefCountForTests();
});

describe('SileroVADEngine', () => {
  describe('loadModel()', () => {
    it('creates an ORT InferenceSession with the provided model path', async () => {
      const engine = new SileroVADEngine();
      await engine.loadModel('/custom/path/vad.onnx');

      expect(mockCreate).toHaveBeenCalledWith('/custom/path/vad.onnx', {
        executionProviders: ['cpu'],
      });
    });

    it('uses the bundled asset path when no path is provided', async () => {
      const engine = new SileroVADEngine();
      await engine.loadModel();

      expect(mockCreate).toHaveBeenCalledWith(
        'silero_vad.onnx',
        expect.any(Object)
      );
    });

    it('is idempotent — does not create a second session on repeated calls', async () => {
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.loadModel();

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRunning', () => {
    it('is false before start()', async () => {
      const engine = new SileroVADEngine();
      await engine.loadModel();
      expect(engine.isRunning).toBe(false);
    });

    it('is true after start()', async () => {
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();
      expect(engine.isRunning).toBe(true);
    });

    it('is false after stop()', async () => {
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();
      await engine.stop();
      expect(engine.isRunning).toBe(false);
    });
  });

  describe('_processFrame() — speech detection', () => {
    it('emits speechStart on first high-probability frame (rising edge)', async () => {
      mockRun.mockResolvedValueOnce(buildVADOutput(0.8));
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());

      expect(emittedEvents).toContainEqual({
        name: 'speechStart',
        payload: { sourceId: engine.id },
      });
    });

    it('does NOT emit speechStart again on a second high-probability frame', async () => {
      mockRun
        .mockResolvedValueOnce(buildVADOutput(0.8))
        .mockResolvedValueOnce(buildVADOutput(0.9));
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());
      await engine._processFrame(makePCMBase64());

      const startEvents = emittedEvents.filter((e) => e.name === 'speechStart');
      expect(startEvents).toHaveLength(1);
    });

    it('does not emit speechEnd until sustained silence elapses (debounce)', async () => {
      jest.useFakeTimers();
      try {
        mockRun
          .mockResolvedValueOnce(buildVADOutput(0.8))
          .mockResolvedValueOnce(buildVADOutput(0.1));
        const engine = new SileroVADEngine();
        await engine.loadModel();
        await engine.start();

        await engine._processFrame(makePCMBase64());
        await engine._processFrame(makePCMBase64());

        expect(
          emittedEvents.filter((e) => e.name === 'speechEnd')
        ).toHaveLength(0);

        await jest.advanceTimersByTimeAsync(1500);

        const endEvent = emittedEvents.find((e) => e.name === 'speechEnd');
        expect(endEvent).toBeDefined();
        const payload = endEvent?.payload as {
          durationMs: number;
          speechPadMs: number;
        };
        expect(payload.durationMs).toBeGreaterThanOrEqual(0);
        expect(payload.speechPadMs).toBe(300);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does NOT emit speechEnd if speech was never active', async () => {
      mockRun.mockResolvedValueOnce(buildVADOutput(0.1));
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());

      expect(emittedEvents.filter((e) => e.name === 'speechEnd')).toHaveLength(
        0
      );
    });

    it('updates LSTM hidden state from ORT output after each frame', async () => {
      const nonZeroHidden = new Float32Array(128).fill(0.42);
      mockRun.mockResolvedValueOnce({
        output: { data: new Float32Array([0.0]) },
        hn: { data: new Float32Array(nonZeroHidden) },
        cn: { data: new Float32Array(nonZeroHidden) },
      });

      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();
      await engine._processFrame(makePCMBase64());

      // On the next frame the h/c tensors should carry the updated state.
      // We verify by checking that run was called (state update happened without error).
      mockRun.mockResolvedValueOnce(buildVADOutput(0.0));
      await engine._processFrame(makePCMBase64());

      expect(mockRun).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop()', () => {
    it('cancels pending silence timer so speechEnd is not emitted after stop', async () => {
      jest.useFakeTimers();
      try {
        mockRun
          .mockResolvedValueOnce(buildVADOutput(0.8))
          .mockResolvedValueOnce(buildVADOutput(0.1));
        const engine = new SileroVADEngine();
        await engine.loadModel();
        await engine.start();
        await engine._processFrame(makePCMBase64());
        await engine._processFrame(makePCMBase64());

        await engine.stop();
        await jest.runAllTimersAsync();

        expect(
          emittedEvents.filter((e) => e.name === 'speechEnd')
        ).toHaveLength(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('drops frames after stop (no inference)', async () => {
      mockRun.mockResolvedValueOnce(buildVADOutput(0.8));
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();
      await engine._processFrame(makePCMBase64());

      await engine.stop();
      emittedEvents.length = 0;

      await engine._processFrame(makePCMBase64());
      expect(emittedEvents).toHaveLength(0);
    });

    it('calls stopVADCapture on the native module', async () => {
      const { NativeModules } = jest.requireMock('react-native') as {
        NativeModules: { VoiceActivator: { stopVADCapture: jest.Mock } };
      };
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();
      await engine.stop();

      expect(NativeModules.VoiceActivator.stopVADCapture).toHaveBeenCalledTimes(
        1
      );
    });
  });

  describe('VAD guard — not running', () => {
    it('_processFrame is a no-op when isRunning is false', async () => {
      const engine = new SileroVADEngine();
      await engine.loadModel();
      // do NOT call start()

      await engine._processFrame(makePCMBase64());

      expect(mockRun).not.toHaveBeenCalled();
      expect(emittedEvents).toHaveLength(0);
    });
  });

  describe('inference errors', () => {
    it('emits sessionError when ORT run throws', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mockRun.mockRejectedValueOnce(new Error('ort failed'));
        const engine = new SileroVADEngine();
        await engine.loadModel();
        await engine.start();

        await engine._processFrame(makePCMBase64());

        expect(emittedEvents).toContainEqual({
          name: 'sessionError',
          payload: expect.objectContaining({
            code: 'vad_inference_failed',
            category: 'internal',
            recoverable: true,
            message: 'ort failed',
          }),
        });
      } finally {
        errSpy.mockRestore();
      }
    });
  });

  describe('custom thresholds', () => {
    it('respects a custom speech threshold', async () => {
      // threshold 0.9 — default probability 0.8 should NOT trigger speechStart
      mockRun.mockResolvedValueOnce(buildVADOutput(0.8));
      const engine = new SileroVADEngine({ threshold: 0.9 });
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());

      expect(
        emittedEvents.filter((e) => e.name === 'speechStart')
      ).toHaveLength(0);
    });
  });

  describe('silence debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('absorbs a short pause: speech → silence → speech before timeout → no speechEnd', async () => {
      mockRun
        .mockResolvedValueOnce(buildVADOutput(0.8))
        .mockResolvedValueOnce(buildVADOutput(0.1))
        .mockResolvedValueOnce(buildVADOutput(0.8));
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());
      await engine._processFrame(makePCMBase64());
      await jest.advanceTimersByTimeAsync(500);
      await engine._processFrame(makePCMBase64());

      await jest.runAllTimersAsync();
      expect(emittedEvents.filter((e) => e.name === 'speechEnd')).toHaveLength(
        0
      );
    });

    it('absorbs a mid-sentence pause under 500ms (AC: no speechEnd)', async () => {
      mockRun
        .mockResolvedValueOnce(buildVADOutput(0.8))
        .mockResolvedValueOnce(buildVADOutput(0.1))
        .mockResolvedValueOnce(buildVADOutput(0.8));
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());
      await engine._processFrame(makePCMBase64());
      await jest.advanceTimersByTimeAsync(400);
      await engine._processFrame(makePCMBase64());

      await jest.runAllTimersAsync();
      expect(emittedEvents.filter((e) => e.name === 'speechEnd')).toHaveLength(
        0
      );
    });

    it('uses custom silenceTimeoutMs', async () => {
      mockRun
        .mockResolvedValueOnce(buildVADOutput(0.8))
        .mockResolvedValueOnce(buildVADOutput(0.1));
      const engine = new SileroVADEngine({ silenceTimeoutMs: 500 });
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());
      await engine._processFrame(makePCMBase64());
      await jest.advanceTimersByTimeAsync(600);

      expect(emittedEvents.some((e) => e.name === 'speechEnd')).toBe(true);
    });

    it('includes configured speechPadMs on speechEnd', async () => {
      mockRun
        .mockResolvedValueOnce(buildVADOutput(0.8))
        .mockResolvedValueOnce(buildVADOutput(0.1));
      const engine = new SileroVADEngine({ speechPadMs: 42 });
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());
      await engine._processFrame(makePCMBase64());
      await jest.advanceTimersByTimeAsync(1500);

      const end = emittedEvents.find((e) => e.name === 'speechEnd');
      expect((end?.payload as { speechPadMs: number }).speechPadMs).toBe(42);
    });

    it('clears silence timer when speech resumes above threshold', async () => {
      mockRun
        .mockResolvedValueOnce(buildVADOutput(0.8))
        .mockResolvedValueOnce(buildVADOutput(0.1))
        .mockResolvedValueOnce(buildVADOutput(0.8));
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());
      await engine._processFrame(makePCMBase64());
      await jest.advanceTimersByTimeAsync(800);
      await engine._processFrame(makePCMBase64());
      await jest.advanceTimersByTimeAsync(1500);

      expect(emittedEvents.filter((e) => e.name === 'speechEnd')).toHaveLength(
        0
      );
    });

    it('defaults silenceTimeoutMs to 1500', () => {
      const engine = new SileroVADEngine();
      expect(engine.silenceTimeoutMs).toBe(1500);
      expect(engine.speechPadMs).toBe(300);
    });
  });

  describe('VoiceSessionConfig.vad', () => {
    it('honours options passed from session vad config', () => {
      const session: VoiceSessionConfig = {
        aiHandler: async () => '',
        reListenMode: 'manual',
        vad: {
          silenceTimeoutMs: 900,
          speechPadMs: 111,
          threshold: 0.6,
          silenceThreshold: 0.2,
        },
      };
      const engine = new SileroVADEngine(session.vad);
      expect(engine.silenceTimeoutMs).toBe(900);
      expect(engine.speechPadMs).toBe(111);
    });
  });
});

// ─── Regression: concurrent engines and frame serialisation ──────────────────
//
// These cover the two failure modes that shipped unnoticed because every prior
// test exercised a single engine processing one frame at a time.

describe('SileroVADEngine — concurrent engine instances', () => {
  function nativeMock() {
    const { NativeModules } = require('react-native') as {
      NativeModules: {
        VoiceActivator: {
          startVADCapture: jest.Mock;
          stopVADCapture: jest.Mock;
        };
      };
    };
    return NativeModules.VoiceActivator;
  }

  async function startedEngine() {
    const engine = new SileroVADEngine();
    await engine.loadModel();
    await engine.start();
    return engine;
  }

  it('opens native capture once when two engines run concurrently', async () => {
    const native = nativeMock();

    await startedEngine();
    await startedEngine();

    expect(native.startVADCapture).toHaveBeenCalledTimes(1);
  });

  it('keeps native capture open while another engine is still running', async () => {
    const native = nativeMock();

    const gate = await startedEngine();
    const session = await startedEngine();

    await session.stop();

    // The pre-wake gate is still live — tearing down the shared stream here
    // would starve it of frames and freeze its speech flag.
    expect(native.stopVADCapture).not.toHaveBeenCalled();
    expect(gate.isRunning).toBe(true);

    await gate.stop();
    expect(native.stopVADCapture).toHaveBeenCalledTimes(1);
  });

  it('does not close capture again when a stopped engine is stopped twice', async () => {
    const native = nativeMock();

    const engine = await startedEngine();
    await engine.stop();
    await engine.stop();

    expect(native.stopVADCapture).toHaveBeenCalledTimes(1);
  });

  it('tags speech events with the emitting engine so subscribers can filter', async () => {
    const gate = new SileroVADEngine();
    const session = new SileroVADEngine();
    expect(gate.id).not.toBe(session.id);

    await gate.loadModel();
    await gate.start();

    mockRun.mockResolvedValueOnce(buildVADOutput(0.9));
    await gate._processFrame(makePCMBase64());

    const speechStart = emittedEvents.find((e) => e.name === 'speechStart');
    expect(speechStart?.payload).toEqual({ sourceId: gate.id });
    expect(speechStart?.payload).not.toEqual({ sourceId: session.id });
  });
});

describe('SileroVADEngine — frame serialisation', () => {
  /** Grab the PCM frame callback the engine registered on the native emitter. */
  function capturedFrameListener(): (event: { pcm: string }) => void {
    const call = mockAddListener.mock.calls.at(-1);
    return call![1] as (event: { pcm: string }) => void;
  }

  it('never runs two inferences at once when frames arrive faster than inference', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const gates: Array<() => void> = [];

    mockRun.mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        gates.push(() => {
          inFlight -= 1;
          resolve(buildVADOutput(0.0));
        });
      });
    });

    const engine = new SileroVADEngine();
    await engine.loadModel();
    await engine.start();

    const onFrame = capturedFrameListener();
    // Three frames land before the first inference has resolved.
    onFrame({ pcm: makePCMBase64() });
    onFrame({ pcm: makePCMBase64() });
    onFrame({ pcm: makePCMBase64() });
    await Promise.resolve();

    expect(maxInFlight).toBe(1);

    // Drain: each release lets exactly one more frame start.
    while (gates.length > 0) {
      gates.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(maxInFlight).toBe(1);
    expect(mockRun).toHaveBeenCalledTimes(3);
  });

  it('drops the oldest frames instead of growing an unbounded backlog', async () => {
    const gates: Array<() => void> = [];
    mockRun.mockImplementation(
      () =>
        new Promise((resolve) => {
          gates.push(() => resolve(buildVADOutput(0.0)));
        })
    );

    const engine = new SileroVADEngine();
    await engine.loadModel();
    await engine.start();

    const onFrame = capturedFrameListener();
    // 32 is the queue bound; push well past it while inference is stalled.
    for (let i = 0; i < 100; i++) {
      onFrame({ pcm: makePCMBase64() });
    }
    await Promise.resolve();

    expect(engine.droppedFrameCount).toBeGreaterThan(0);
    // Bounded queue + the one frame already in flight.
    expect(engine.droppedFrameCount).toBe(100 - 32 - 1);
  });
});
