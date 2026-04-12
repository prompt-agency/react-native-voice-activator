import { TTSInferenceEngine } from '../providers/tts/TTSInferenceEngine';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock variables declared before jest.mock() to avoid TDZ hoisting errors.
// Access via jest.requireMock() inside tests.
const mockAudioOutput = new Float32Array(22050);

const mockSession = {
  run: jest.fn().mockResolvedValue({
    output: { data: mockAudioOutput },
  }),
  release: jest.fn().mockResolvedValue(undefined),
  inputNames: ['input', 'input_lengths', 'scales'],
  outputNames: ['output'],
};

const mockInferenceSession = {
  create: jest.fn().mockResolvedValue(mockSession),
};

jest.mock('onnxruntime-react-native', () => ({
  __esModule: true,
  InferenceSession: mockInferenceSession,
  Tensor: jest.fn((type: string, data: unknown, dims: number[]) => ({
    type,
    data,
    dims,
  })),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TTSInferenceEngine', () => {
  let engine: TTSInferenceEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.run.mockResolvedValue({ output: { data: mockAudioOutput } });
    mockSession.release.mockResolvedValue(undefined);
    mockInferenceSession.create.mockResolvedValue(mockSession);
    engine = new TTSInferenceEngine();
  });

  describe('loadModel()', () => {
    it('creates an ORT InferenceSession from the given model path', async () => {
      await engine.loadModel('/models/voice.onnx');

      expect(mockInferenceSession.create).toHaveBeenCalledTimes(1);
      expect(mockInferenceSession.create).toHaveBeenCalledWith(
        '/models/voice.onnx',
        { executionProviders: ['cpu'] }
      );
    });

    it('passes custom executionProviders when specified', async () => {
      await engine.loadModel('/models/voice.onnx', {
        executionProviders: ['coreml'],
      });

      expect(mockInferenceSession.create).toHaveBeenCalledWith(
        '/models/voice.onnx',
        { executionProviders: ['coreml'] }
      );
    });

    it('is idempotent — second loadModel() with same path does not recreate session', async () => {
      await engine.loadModel('/models/voice.onnx');
      await engine.loadModel('/models/voice.onnx');

      expect(mockInferenceSession.create).toHaveBeenCalledTimes(1);
    });

    it('reloads session when called with a different model path', async () => {
      await engine.loadModel('/models/voice-a.onnx');
      await engine.loadModel('/models/voice-b.onnx');

      expect(mockInferenceSession.create).toHaveBeenCalledTimes(2);
      expect(mockSession.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('synthesize()', () => {
    it('throws if called before loadModel()', async () => {
      await expect(
        engine.synthesize(new BigInt64Array([1n, 2n, 3n]))
      ).rejects.toThrow('TTSInferenceEngine: call loadModel() first');
    });

    it('returns Float32Array of PCM samples after loadModel()', async () => {
      await engine.loadModel('/models/voice.onnx');

      const result = await engine.synthesize(new BigInt64Array([1n, 2n, 3n]));

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(22050);
    });

    it('passes phoneme IDs, lengths, and scales tensors to session.run()', async () => {
      await engine.loadModel('/models/voice.onnx');
      const phonemeIds = new BigInt64Array([10n, 20n, 30n]);

      await engine.synthesize(phonemeIds);

      expect(mockSession.run).toHaveBeenCalledTimes(1);
      const feeds = (
        mockSession.run.mock.calls[0] as [
          Record<string, { type: string; data: unknown; dims: number[] }>,
        ]
      )[0];
      expect(feeds.input?.data).toBe(phonemeIds);
      expect(feeds.input_lengths?.data).toEqual(
        BigInt64Array.from([BigInt(phonemeIds.length)])
      );
      expect(feeds.scales).toBeDefined();
      expect(feeds.sid).toBeUndefined(); // no speaker ID passed
    });

    it('passes speaker ID tensor when speakerId is provided', async () => {
      await engine.loadModel('/models/voice.onnx');

      await engine.synthesize(new BigInt64Array([1n, 2n]), 42);

      expect(mockSession.run).toHaveBeenCalledTimes(1);
      const feeds = (
        mockSession.run.mock.calls[0] as [
          Record<string, { type: string; data: unknown; dims: number[] }>,
        ]
      )[0];
      expect(feeds.sid).toBeDefined();
      expect(feeds.sid?.data).toEqual(BigInt64Array.from([42n]));
    });

    it('throws when inference produces no output tensor', async () => {
      await engine.loadModel('/models/voice.onnx');
      mockSession.run.mockResolvedValueOnce({ output: undefined });

      await expect(engine.synthesize(new BigInt64Array([1n]))).rejects.toThrow(
        'TTSInferenceEngine: inference produced no audio output'
      );
    });
  });

  describe('dispose()', () => {
    it('releases the ORT session', async () => {
      await engine.loadModel('/models/voice.onnx');
      await engine.dispose();

      expect(mockSession.release).toHaveBeenCalledTimes(1);
    });

    it('does not throw when called before loadModel()', async () => {
      await expect(engine.dispose()).resolves.toBeUndefined();
    });

    it('makes synthesize() throw after dispose()', async () => {
      await engine.loadModel('/models/voice.onnx');
      await engine.dispose();

      await expect(engine.synthesize(new BigInt64Array([1n]))).rejects.toThrow(
        'TTSInferenceEngine: call loadModel() first'
      );
    });
  });
});
