const mockNativeONNX = {
  loadTTSModel: jest.fn(async () => true),
  unloadTTSModel: jest.fn(async () => true),
  synthesize: jest.fn(async () =>
    JSON.stringify({ audioBase64: 'dGVzdA==', sampleRate: 22050 })
  ),
};

jest.mock('@runanywhere/onnx', () => ({
  ONNXProvider: {
    register: jest.fn(async () => true),
  },
  requireNativeONNXModule: jest.fn(() => mockNativeONNX),
}));

jest.mock('@runanywhere/core', () => ({
  RunAnywhere: {
    Audio: {
      createWavFromPCMFloat32: jest.fn(async () => '/tmp/output.wav'),
      playAudio: jest.fn(async () => undefined),
      stopPlayback: jest.fn(async () => undefined),
    },
  },
}));

import { RunAnywhere } from '@runanywhere/core';
import { ONNXProvider } from '@runanywhere/onnx';
import { RunAnywhereTTSAdapter } from '../providers/runanywhere/RunAnywhereTTSAdapter';

describe('RunAnywhereTTSAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNativeONNX.loadTTSModel.mockResolvedValue(true);
    mockNativeONNX.synthesize.mockResolvedValue(
      JSON.stringify({ audioBase64: 'dGVzdA==', sampleRate: 22050 })
    );
    (RunAnywhere.Audio.createWavFromPCMFloat32 as jest.Mock).mockResolvedValue(
      '/tmp/output.wav'
    );
  });

  it('loads the TTS model once and caches initialization', async () => {
    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });
    adapter.setResolvedPath('/models/piper.onnx');

    await adapter.initialize();
    await adapter.initialize();

    expect(ONNXProvider.register).toHaveBeenCalledTimes(1);
    expect(mockNativeONNX.loadTTSModel).toHaveBeenCalledTimes(1);
    expect(mockNativeONNX.loadTTSModel).toHaveBeenCalledWith(
      '/models/piper.onnx',
      'piper'
    );
  });

  it('throws if initialize is called without a resolved model path', async () => {
    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });

    await expect(adapter.initialize()).rejects.toThrow(
      'RunAnywhereTTSAdapter: call setResolvedPath()'
    );
  });

  it('synthesizes speech and plays audio', async () => {
    const adapter = new RunAnywhereTTSAdapter({
      modelId: 'piper-en-lessac',
      voice: 'voice-1',
      rate: 1.1,
      pitch: 0.9,
    });
    adapter.setResolvedPath('/models/piper.onnx');

    await adapter.initialize();
    await adapter.speak('hello', { rate: 1.4, pitch: 1.2 });

    expect(mockNativeONNX.synthesize).toHaveBeenCalledWith(
      'hello',
      'voice-1',
      1.4,
      1.2
    );
    expect(RunAnywhere.Audio.createWavFromPCMFloat32).toHaveBeenCalledWith(
      'dGVzdA==',
      22050
    );
    expect(RunAnywhere.Audio.playAudio).toHaveBeenCalledWith('/tmp/output.wav');
  });

  it('uses config defaults for rate and pitch when speak options are not provided', async () => {
    const adapter = new RunAnywhereTTSAdapter({
      modelId: 'piper-en-lessac',
      voice: 'voice-1',
      rate: 1.1,
      pitch: 0.9,
    });
    adapter.setResolvedPath('/models/piper.onnx');

    await adapter.initialize();
    await adapter.speak('hello');

    expect(mockNativeONNX.synthesize).toHaveBeenCalledWith(
      'hello',
      'voice-1',
      1.1,
      0.9
    );
  });

  it('throws if speak is called before initialize', async () => {
    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });
    adapter.setResolvedPath('/models/piper.onnx');

    await expect(adapter.speak('hello')).rejects.toThrow(
      'RunAnywhereTTSAdapter: call initialize() first'
    );
  });

  it('stops playback', async () => {
    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });
    adapter.setResolvedPath('/models/piper.onnx');

    await adapter.initialize();
    await adapter.stop();

    expect(RunAnywhere.Audio.stopPlayback).toHaveBeenCalledTimes(1);
  });

  it('stops and unloads the model on dispose, then supports a fresh later session', async () => {
    const adapter = new RunAnywhereTTSAdapter({
      modelId: 'piper-en-lessac',
      voice: 'voice-1',
    });
    adapter.setResolvedPath('/models/piper.onnx');

    await adapter.initialize();
    await adapter.speak('first session');
    await adapter.dispose();

    expect(RunAnywhere.Audio.stopPlayback).toHaveBeenCalledTimes(1);
    expect(mockNativeONNX.unloadTTSModel).toHaveBeenCalledTimes(1);

    adapter.setResolvedPath('/models/piper.onnx');
    await adapter.initialize();
    await adapter.speak('second session');

    expect(ONNXProvider.register).toHaveBeenCalledTimes(2);
    expect(mockNativeONNX.loadTTSModel).toHaveBeenCalledTimes(2);
    expect(mockNativeONNX.synthesize).toHaveBeenNthCalledWith(
      2,
      'second session',
      'voice-1',
      1,
      1
    );
  });
});
