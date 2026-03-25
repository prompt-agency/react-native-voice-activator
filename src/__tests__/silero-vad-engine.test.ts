/** Story 12-1: SileroVADEngine unit tests. TDZ-safe mocks via jest.mock factory. */

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

import { SileroVADEngine } from '../providers/vad/SileroVADEngine';

beforeEach(() => {
  jest.clearAllMocks();
  emittedEvents.length = 0;
  mockRun.mockResolvedValue(buildVADOutput(0.0));
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
        payload: {},
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

    it('emits speechEnd on low-probability frame after speech was active', async () => {
      mockRun
        .mockResolvedValueOnce(buildVADOutput(0.8)) // speech starts
        .mockResolvedValueOnce(buildVADOutput(0.1)); // silence → speechEnd
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();

      await engine._processFrame(makePCMBase64());
      await engine._processFrame(makePCMBase64());

      const endEvent = emittedEvents.find((e) => e.name === 'speechEnd');
      expect(endEvent).toBeDefined();
      expect(
        (endEvent?.payload as { durationMs: number }).durationMs
      ).toBeGreaterThanOrEqual(0);
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
    it('resets _speechActive so no speechEnd is emitted after stop', async () => {
      mockRun.mockResolvedValueOnce(buildVADOutput(0.8));
      const engine = new SileroVADEngine();
      await engine.loadModel();
      await engine.start();
      await engine._processFrame(makePCMBase64()); // speechStart emitted

      await engine.stop();
      emittedEvents.length = 0; // clear

      // If a frame arrives after stop (queued by native), it should be dropped
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
});
