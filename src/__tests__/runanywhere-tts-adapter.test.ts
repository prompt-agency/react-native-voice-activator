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
  ONNX: {
    addModel: jest.fn(async () => undefined),
  },
  ModelArtifactType: { TarGzArchive: 'tar_gz_archive' },
  requireNativeONNXModule: jest.fn(() => mockNativeONNX),
}));

jest.mock('@runanywhere/core', () => ({
  SDKEnvironment: { Development: 'development' },
  ModelCategory: { SpeechSynthesis: 'speech_synthesis' },
  RunAnywhere: {
    isSDKInitialized: false,
    initialize: jest.fn(async () => undefined),
    isModelDownloaded: jest.fn(async () => false),
    downloadModel: jest.fn(
      async (_id: string, _onProgress: unknown) => undefined
    ),
    getModelInfo: jest.fn(async () => ({
      localPath: '/resolved/piper-dir',
    })),
    Audio: {
      createWavFromPCMFloat32: jest.fn(async () => '/tmp/output.wav'),
      playAudio: jest.fn(async () => undefined),
      stopPlayback: jest.fn(async () => undefined),
    },
  },
}));

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    readDir: jest.fn(async () => [
      {
        isFile: () => true,
        isDirectory: () => false,
        name: 'model.onnx',
        path: '/resolved/piper-dir/model.onnx',
      },
    ]),
  },
}));

import { RunAnywhere } from '@runanywhere/core';
import { ONNXProvider, ONNX } from '@runanywhere/onnx';
import RNFS from 'react-native-fs';
import { RunAnywhereTTSAdapter } from '../providers/runanywhere/RunAnywhereTTSAdapter';

const defaultRnfsDirEntry = [
  {
    isFile: () => true,
    isDirectory: () => false,
    name: 'model.onnx',
    path: '/resolved/piper-dir/model.onnx',
  },
];

describe('RunAnywhereTTSAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RunAnywhere as unknown as Record<string, unknown>).isSDKInitialized =
      false;
    mockNativeONNX.loadTTSModel.mockResolvedValue(true);
    mockNativeONNX.synthesize.mockResolvedValue(
      JSON.stringify({ audioBase64: 'dGVzdA==', sampleRate: 22050 })
    );
    (RunAnywhere.Audio.createWavFromPCMFloat32 as jest.Mock).mockResolvedValue(
      '/tmp/output.wav'
    );
    (RunAnywhere.isModelDownloaded as jest.Mock).mockResolvedValue(false);
    (RunAnywhere.getModelInfo as jest.Mock).mockResolvedValue({
      localPath: '/resolved/piper-dir',
    });
    (RNFS.readDir as jest.Mock).mockResolvedValue(defaultRnfsDirEntry);
  });

  it('initializes SDK, registers catalog model, downloads, walks directory, and loads TTS model', async () => {
    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });

    await adapter.initialize();
    await adapter.initialize(); // second call should be no-op

    expect(RunAnywhere.initialize).toHaveBeenCalledTimes(1);
    expect(ONNXProvider.register).toHaveBeenCalledTimes(1);
    expect(ONNX.addModel).toHaveBeenCalledTimes(1);
    expect(ONNX.addModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'vits-piper-en_US-lessac-medium',
        url: expect.stringContaining('vits-piper-en_US-lessac-medium'),
      })
    );
    expect(RunAnywhere.isModelDownloaded).toHaveBeenCalledWith(
      'vits-piper-en_US-lessac-medium'
    );
    expect(RunAnywhere.downloadModel).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.getModelInfo).toHaveBeenCalledWith(
      'vits-piper-en_US-lessac-medium'
    );
    expect(mockNativeONNX.loadTTSModel).toHaveBeenCalledTimes(1);
    expect(mockNativeONNX.loadTTSModel).toHaveBeenCalledWith(
      '/resolved/piper-dir/model.onnx',
      'piper'
    );
  });

  it('skips download when model is already local', async () => {
    (RunAnywhere.isModelDownloaded as jest.Mock).mockResolvedValue(true);

    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });
    await adapter.initialize();

    expect(RunAnywhere.downloadModel).not.toHaveBeenCalled();
    expect(mockNativeONNX.loadTTSModel).toHaveBeenCalledTimes(1);
  });

  it('skips SDK init when RunAnywhere is already initialized', async () => {
    (RunAnywhere as unknown as Record<string, unknown>).isSDKInitialized = true;

    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });
    await adapter.initialize();

    expect(RunAnywhere.initialize).not.toHaveBeenCalled();
    expect(ONNXProvider.register).toHaveBeenCalledTimes(1);
  });

  it('throws if getModelInfo returns no localPath', async () => {
    (RunAnywhere.getModelInfo as jest.Mock).mockResolvedValue({
      localPath: null,
    });

    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });
    await expect(adapter.initialize()).rejects.toThrow(
      'path could not be resolved'
    );
  });

  it('throws if no .onnx file is found in model directory', async () => {
    (RNFS.readDir as jest.Mock).mockResolvedValue([
      {
        isFile: () => true,
        isDirectory: () => false,
        name: 'config.json',
        path: '/resolved/piper-dir/config.json',
      },
    ]);

    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });
    await expect(adapter.initialize()).rejects.toThrow(
      'No .onnx file found in directory'
    );
  });

  it('synthesizes speech and plays audio', async () => {
    const adapter = new RunAnywhereTTSAdapter({
      modelId: 'piper-en-lessac',
      voice: 'voice-1',
      rate: 1.1,
      pitch: 0.9,
    });

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

    await expect(adapter.speak('hello')).rejects.toThrow(
      'RunAnywhereTTSAdapter: call initialize() first'
    );
  });

  it('stops playback', async () => {
    const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' });

    await adapter.initialize();
    await adapter.stop();

    expect(RunAnywhere.Audio.stopPlayback).toHaveBeenCalledTimes(1);
  });

  it('stops and unloads the model on dispose, then supports a fresh later session', async () => {
    const adapter = new RunAnywhereTTSAdapter({
      modelId: 'piper-en-lessac',
      voice: 'voice-1',
    });

    await adapter.initialize();
    await adapter.speak('first session');
    await adapter.dispose();

    expect(RunAnywhere.Audio.stopPlayback).toHaveBeenCalledTimes(1);
    expect(mockNativeONNX.unloadTTSModel).toHaveBeenCalledTimes(1);

    // No setResolvedPath needed - adapter resolves path internally from catalog
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
