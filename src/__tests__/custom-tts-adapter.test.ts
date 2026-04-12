/** Story 11-4: TDZ-safe mocks via jest.mock factory; access with jest.requireMock(). */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../providers/tts/TTSInferenceEngine', () => ({
  __esModule: true,
  TTSInferenceEngine: jest.fn(),
  ttsInferenceEngine: {
    loadModel: jest.fn().mockResolvedValue(undefined),
    synthesize: jest.fn().mockResolvedValue(new Float32Array(22050)),
    dispose: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../providers/tts/AudioPlaybackManager', () => ({
  __esModule: true,
  AudioPlaybackManager: jest.fn(),
  audioPlaybackManager: {
    playChunk: jest.fn().mockResolvedValue(undefined),
    playWav: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  },
}));

function getEngineMock() {
  return jest.requireMock('../providers/tts/TTSInferenceEngine')
    .ttsInferenceEngine as Record<string, jest.Mock>;
}

function getPlaybackMock() {
  return jest.requireMock('../providers/tts/AudioPlaybackManager')
    .audioPlaybackManager as Record<string, jest.Mock>;
}

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import { CustomTTSAdapter } from '../providers/tts/CustomTTSAdapter';
import type { CustomTTSConfig } from '../public/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<CustomTTSConfig>): CustomTTSConfig {
  return {
    modelPath: '/models/voice.onnx',
    phonemize: jest.fn().mockResolvedValue(new BigInt64Array([1n, 2n, 3n])),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CustomTTSAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default mock return values after clearAllMocks
    getEngineMock().loadModel!.mockResolvedValue(undefined);
    getEngineMock().synthesize!.mockResolvedValue(new Float32Array(22050));
    getPlaybackMock().playChunk!.mockResolvedValue(undefined);
    getPlaybackMock().stop!.mockResolvedValue(undefined);
  });

  describe('speak()', () => {
    it('loads the model with the configured modelPath', async () => {
      const adapter = new CustomTTSAdapter(makeConfig());
      await adapter.speak('hello');

      expect(getEngineMock().loadModel).toHaveBeenCalledTimes(1);
      expect(getEngineMock().loadModel).toHaveBeenCalledWith(
        '/models/voice.onnx'
      );
    });

    it('calls phonemize with the input text and passes IDs to synthesize', async () => {
      const phonemize = jest
        .fn()
        .mockResolvedValue(new BigInt64Array([10n, 20n, 30n]));
      const adapter = new CustomTTSAdapter(makeConfig({ phonemize }));
      await adapter.speak('test utterance');

      expect(phonemize).toHaveBeenCalledTimes(1);
      expect(phonemize).toHaveBeenCalledWith('test utterance');
      expect(getEngineMock().synthesize).toHaveBeenCalledTimes(1);
      expect(getEngineMock().synthesize!).toHaveBeenCalledWith(
        new BigInt64Array([10n, 20n, 30n]),
        undefined
      );
    });

    it('streams PCM output to audioPlaybackManager with default sampleRate 22050', async () => {
      const pcmOutput = new Float32Array(44100);
      getEngineMock().synthesize!.mockResolvedValueOnce(pcmOutput);

      const adapter = new CustomTTSAdapter(makeConfig());
      await adapter.speak('hello');

      expect(getPlaybackMock().playChunk).toHaveBeenCalledTimes(1);
      expect(getPlaybackMock().playChunk).toHaveBeenCalledWith(
        pcmOutput,
        22050
      );
    });

    it('uses the configured sampleRate when specified', async () => {
      const adapter = new CustomTTSAdapter(makeConfig({ sampleRate: 16000 }));
      await adapter.speak('hello');

      expect(getPlaybackMock().playChunk).toHaveBeenCalledWith(
        expect.any(Float32Array),
        16000
      );
    });

    it('passes speakerId through to synthesize()', async () => {
      const adapter = new CustomTTSAdapter(makeConfig({ speakerId: 42 }));
      await adapter.speak('hello');

      expect(getEngineMock().synthesize).toHaveBeenCalledWith(
        expect.any(BigInt64Array),
        42
      );
    });

    it('calls loadModel for each modelPath when two adapters use different paths', async () => {
      const engine = getEngineMock();
      const adapterA = new CustomTTSAdapter(
        makeConfig({
          modelPath: '/models/en.onnx',
          phonemize: jest.fn().mockResolvedValue(new BigInt64Array([1n])),
        })
      );
      const adapterB = new CustomTTSAdapter(
        makeConfig({
          modelPath: '/models/de.onnx',
          phonemize: jest.fn().mockResolvedValue(new BigInt64Array([2n])),
        })
      );

      await adapterA.speak('one');
      await adapterB.speak('two');

      expect(engine.loadModel).toHaveBeenNthCalledWith(1, '/models/en.onnx');
      expect(engine.loadModel).toHaveBeenNthCalledWith(2, '/models/de.onnx');
      expect(engine.synthesize).toHaveBeenCalledTimes(2);
    });

    it('handles synchronous phonemize returning BigInt64Array', async () => {
      const phonemize = jest.fn(() => new BigInt64Array([99n, 100n]));
      const adapter = new CustomTTSAdapter(makeConfig({ phonemize }));
      await adapter.speak('sync');

      expect(phonemize).toHaveBeenCalledWith('sync');
      expect(getEngineMock().synthesize).toHaveBeenCalledWith(
        new BigInt64Array([99n, 100n]),
        undefined
      );
      expect(getPlaybackMock().playChunk).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    it('delegates to audioPlaybackManager.stop()', async () => {
      const adapter = new CustomTTSAdapter(makeConfig());
      await adapter.stop();

      expect(getPlaybackMock().stop).toHaveBeenCalledTimes(1);
    });

    it('does not throw when called without an active speak()', async () => {
      const adapter = new CustomTTSAdapter(makeConfig());
      await expect(adapter.stop()).resolves.toBeUndefined();
    });

    it('prevents synthesize() and playChunk() when stop() is called while loadModel is pending', async () => {
      const engine = getEngineMock();
      const playback = getPlaybackMock();

      let resolveLoad!: () => void;
      engine.loadModel!.mockImplementationOnce(
        () =>
          new Promise<void>((res) => {
            resolveLoad = res;
          })
      );

      const adapter = new CustomTTSAdapter(makeConfig());

      const speakPromise = adapter.speak('hello');
      const stopPromise = adapter.stop();
      resolveLoad();

      await Promise.all([speakPromise, stopPromise]);

      expect(engine.synthesize).not.toHaveBeenCalled();
      expect(playback.playChunk).not.toHaveBeenCalled();
      expect(playback.stop).toHaveBeenCalledTimes(1);
    });

    it('prevents synthesize() and playChunk() when stop() is called while phonemize is pending', async () => {
      const engine = getEngineMock();
      const playback = getPlaybackMock();

      let resolvePh!: (ids: BigInt64Array) => void;
      const phonemize = jest.fn(
        () =>
          new Promise<BigInt64Array>((res) => {
            resolvePh = res;
          })
      );

      const adapter = new CustomTTSAdapter(makeConfig({ phonemize }));
      const speakPromise = adapter.speak('hello');

      await Promise.resolve();
      await adapter.stop();
      resolvePh!(new BigInt64Array([1n]));

      await speakPromise;

      expect(engine.synthesize).not.toHaveBeenCalled();
      expect(playback.playChunk).not.toHaveBeenCalled();
      expect(playback.stop).toHaveBeenCalled();
    });

    it('prevents playChunk() when stop() is called while synthesize is pending', async () => {
      const engine = getEngineMock();
      const playback = getPlaybackMock();

      let resolveSynth!: (pcm: Float32Array) => void;
      engine.synthesize!.mockImplementationOnce(
        () =>
          new Promise<Float32Array>((res) => {
            resolveSynth = res;
          })
      );

      const adapter = new CustomTTSAdapter(
        makeConfig({
          phonemize: jest.fn().mockReturnValue(new BigInt64Array([1n])),
        })
      );
      const speakPromise = adapter.speak('hello');

      await new Promise<void>((r) => setImmediate(r));
      expect(engine.synthesize).toHaveBeenCalled();
      await adapter.stop();
      resolveSynth!(new Float32Array(4));

      await speakPromise;

      expect(engine.synthesize).toHaveBeenCalledTimes(1);
      expect(playback.playChunk).not.toHaveBeenCalled();
      expect(playback.stop).toHaveBeenCalled();
    });
  });
});
