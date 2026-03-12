jest.mock('@runanywhere/core', () => ({
  RunAnywhere: {
    loadTTSModel: jest.fn(async () => true),
    speak: jest.fn(async () => ({
      duration: 1,
      voice: 'default',
      processingTime: 0.1,
      characterCount: 5,
    })),
    stopSpeaking: jest.fn(async () => undefined),
  },
}));

jest.mock('@runanywhere/onnx', () => ({
  ONNX: {
    register: jest.fn(),
  },
}));

import { RunAnywhere } from '@runanywhere/core';
import { ONNX } from '@runanywhere/onnx';
import { RunAnywhereTTSAdapter } from '../providers/runanywhere/RunAnywhereTTSAdapter';

describe('RunAnywhereTTSAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads the TTS model once and caches initialization', async () => {
    const adapter = new RunAnywhereTTSAdapter({
      modelPath: '/models/piper.onnx',
    });

    await adapter.initialize();
    await adapter.initialize();

    expect(ONNX.register).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.loadTTSModel).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.loadTTSModel).toHaveBeenCalledWith(
      '/models/piper.onnx',
      'piper'
    );
  });

  it('maps speak options and stops playback', async () => {
    const adapter = new RunAnywhereTTSAdapter({
      modelPath: '/models/piper.onnx',
      voice: 'voice-1',
      rate: 1.1,
      pitch: 0.9,
    });

    await adapter.initialize();
    await adapter.speak('hello', {
      rate: 1.4,
      pitch: 1.2,
    });
    await adapter.stop();

    expect(RunAnywhere.speak).toHaveBeenCalledWith('hello', {
      voice: 'voice-1',
      rate: 1.4,
      pitch: 1.2,
      language: undefined,
    });
    expect(RunAnywhere.stopSpeaking).toHaveBeenCalledTimes(1);
  });

  it('throws if speak is called before initialize', async () => {
    const adapter = new RunAnywhereTTSAdapter({
      modelPath: '/models/piper.onnx',
    });

    await expect(adapter.speak('hello')).rejects.toThrow(
      'RunAnywhereTTSAdapter: call initialize() first'
    );
  });
});
