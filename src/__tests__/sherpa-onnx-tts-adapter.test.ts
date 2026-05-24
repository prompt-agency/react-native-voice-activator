// ─── Mocks ────────────────────────────────────────────────────────────────────
// Must precede imports so jest.mock hoisting places them before module eval.

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {
    VoiceActivator: {
      synthesizeTTS: jest.fn().mockResolvedValue(undefined),
      stopPlayback: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { SherpaOnnxTTSAdapter } from '../providers/tts/SherpaOnnxTTSAdapter';
import { Platform, NativeModules } from 'react-native';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSynthMock(): jest.Mock {
  return (NativeModules as Record<string, Record<string, jest.Mock>>)
    .VoiceActivator!.synthesizeTTS!;
}

function getStopMock(): jest.Mock {
  return (NativeModules as Record<string, Record<string, jest.Mock>>)
    .VoiceActivator!.stopPlayback!;
}

function makeConfig() {
  return {
    modelPath: '/data/en_US-ryan-low.onnx',
    tokensPath: '/data/tokens.txt',
    dataDir: '/data/espeak-ng-data',
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as Record<string, unknown>).OS = 'ios';
  getSynthMock().mockResolvedValue(undefined);
  getStopMock().mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SherpaOnnxTTSAdapter', () => {
  it('exposes name "sherpa-onnx-tts"', () => {
    const adapter = new SherpaOnnxTTSAdapter(makeConfig());
    expect(adapter.name).toBe('sherpa-onnx-tts');
  });

  // ─── iOS behaviour ──────────────────────────────────────────────────────────

  describe('on iOS', () => {
    it('calls synthesizeTTS with all required parameters', async () => {
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await adapter.speak('Hello world');
      expect(getSynthMock()).toHaveBeenCalledWith({
        modelPath: '/data/en_US-ryan-low.onnx',
        tokensPath: '/data/tokens.txt',
        dataDir: '/data/espeak-ng-data',
        text: 'Hello world',
        speakerId: 0,
        speed: 1.0,
        noiseScale: 0.667,
        noiseScaleW: 0.8,
        lengthScale: 1.0,
      });
    });

    it('forwards custom config values', async () => {
      const adapter = new SherpaOnnxTTSAdapter({
        ...makeConfig(),
        speakerId: 2,
        speed: 1.5,
        noiseScale: 0.5,
        noiseScaleW: 0.6,
        lengthScale: 0.9,
      });
      await adapter.speak('test');
      expect(getSynthMock()).toHaveBeenCalledWith(
        expect.objectContaining({
          speakerId: 2,
          speed: 1.5,
          noiseScale: 0.5,
          noiseScaleW: 0.6,
          lengthScale: 0.9,
        })
      );
    });

    it('resolves when synthesizeTTS resolves', async () => {
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await expect(adapter.speak('test')).resolves.toBeUndefined();
    });

    it('propagates synthesizeTTS rejection', async () => {
      getSynthMock().mockRejectedValueOnce(new Error('native crash'));
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await expect(adapter.speak('test')).rejects.toThrow('native crash');
    });

    it('stop() calls stopPlayback on the native module', async () => {
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await adapter.stop();
      expect(getStopMock()).toHaveBeenCalledTimes(1);
    });

    it('stop() resolves when stopPlayback resolves', async () => {
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await expect(adapter.stop()).resolves.toBeUndefined();
    });
  });

  // ─── Android behaviour ──────────────────────────────────────────────────────

  describe('on Android', () => {
    beforeEach(() => {
      (Platform as Record<string, unknown>).OS = 'android';
    });

    it('speak() calls synthesizeTTS on Android', async () => {
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await adapter.speak('Hello world');
      expect(getSynthMock()).toHaveBeenCalledTimes(1);
    });

    it('speak() forwards correct parameters on Android', async () => {
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await adapter.speak('Hello world');
      expect(getSynthMock()).toHaveBeenCalledWith({
        modelPath: '/data/en_US-ryan-low.onnx',
        tokensPath: '/data/tokens.txt',
        dataDir: '/data/espeak-ng-data',
        text: 'Hello world',
        speakerId: 0,
        speed: 1.0,
        noiseScale: 0.667,
        noiseScaleW: 0.8,
        lengthScale: 1.0,
      });
    });

    it('speak() resolves on Android when synthesizeTTS resolves', async () => {
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await expect(adapter.speak('test')).resolves.toBeUndefined();
    });

    it('speak() propagates synthesizeTTS rejection on Android', async () => {
      getSynthMock().mockRejectedValueOnce(new Error('jni error'));
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await expect(adapter.speak('test')).rejects.toThrow('jni error');
    });

    it('stop() calls stopPlayback on Android', async () => {
      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await adapter.stop();
      expect(getStopMock()).toHaveBeenCalledTimes(1);
    });

    it('constructor does not emit a platform warning on Android', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const _adapter = new SherpaOnnxTTSAdapter(makeConfig());
      expect(_adapter).toBeDefined();
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  // ─── Missing native module ────────────────────────────────────────────────

  describe('when synthesizeTTS is absent from the native module', () => {
    it('speak() throws about the missing native module', async () => {
      const original = (
        NativeModules as Record<string, Record<string, jest.Mock>>
      ).VoiceActivator;
      (
        NativeModules as Record<string, Record<string, unknown>>
      ).VoiceActivator = {};

      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await expect(adapter.speak('test')).rejects.toThrow('synthesizeTTS');

      (
        NativeModules as Record<string, Record<string, jest.Mock>>
      ).VoiceActivator = original!;
    });
  });

  // ─── stop() when native module is absent ─────────────────────────────────

  describe('when native module is absent', () => {
    it('stop() resolves without throwing', async () => {
      const originalModules = (NativeModules as Record<string, unknown>)
        .VoiceActivator;
      (NativeModules as Record<string, unknown>).VoiceActivator = undefined;

      const adapter = new SherpaOnnxTTSAdapter(makeConfig());
      await expect(adapter.stop()).resolves.toBeUndefined();

      (NativeModules as Record<string, unknown>).VoiceActivator =
        originalModules;
    });
  });
});
