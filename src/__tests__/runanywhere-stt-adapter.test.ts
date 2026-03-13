const mockRecorderInstance = {
  startRecorder: jest.fn(async () => '/tmp/recording.wav'),
  stopRecorder: jest.fn(async () => '/tmp/recording.wav'),
  removeRecordBackListener: jest.fn(),
};

const mockAudioRecorderPlayer = jest.fn(() => mockRecorderInstance);

jest.mock('@runanywhere/core', () => ({
  SDKEnvironment: { Development: 'development' },
  ModelCategory: { SpeechRecognition: 'speech_recognition' },
  RunAnywhere: {
    isSDKInitialized: false,
    initialize: jest.fn(async () => undefined),
    isModelDownloaded: jest.fn(async () => false),
    downloadModel: jest.fn(
      async (_id: string, _onProgress: unknown) => undefined
    ),
    getModelInfo: jest.fn(async () => ({
      localPath: '/resolved/whisper',
    })),
    loadSTTModel: jest.fn(async () => true),
    unloadSTTModel: jest.fn(async () => true),
    transcribeFile: jest.fn(async () => ({
      text: 'hello world',
      confidence: 0.91,
      duration: 1.25,
      segments: [],
      alternatives: [],
    })),
  },
}));

jest.mock('@runanywhere/onnx', () => ({
  ONNXProvider: {
    register: jest.fn(async () => true),
  },
  ONNX: {
    addModel: jest.fn(async () => undefined),
  },
  ModelArtifactType: { TarGzArchive: 'tar_gz_archive' },
}));

jest.mock('react-native-audio-recorder-player', () => ({
  __esModule: true,
  AudioSourceAndroidType: {
    VOICE_RECOGNITION: 6,
  },
  OutputFormatAndroidType: {
    MPEG_4: 2,
  },
  AudioEncoderAndroidType: {
    AAC: 3,
  },
  AVEncodingOption: {
    wav: 'wav',
  },
  AVEncoderAudioQualityIOSType: {
    high: 96,
  },
  AVModeIOSOption: {
    measurement: 'measurement',
  },
  default: mockAudioRecorderPlayer,
}));

import { RunAnywhere } from '@runanywhere/core';
import { ONNXProvider, ONNX } from '@runanywhere/onnx';
import {
  RunAnywhereSTTAdapter,
  RunAnywhereSTTCancelledError,
} from '../providers/runanywhere/RunAnywhereSTTAdapter';

describe('RunAnywhereSTTAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (RunAnywhere as unknown as Record<string, unknown>).isSDKInitialized =
      false;
    mockRecorderInstance.startRecorder.mockResolvedValue('/tmp/recording.wav');
    mockRecorderInstance.stopRecorder.mockResolvedValue('/tmp/recording.wav');
    (RunAnywhere.transcribeFile as jest.Mock).mockResolvedValue({
      text: 'hello world',
      confidence: 0.91,
      duration: 1.25,
      segments: [],
      alternatives: [],
    });
    (RunAnywhere.isModelDownloaded as jest.Mock).mockResolvedValue(false);
    (RunAnywhere.getModelInfo as jest.Mock).mockResolvedValue({
      localPath: '/resolved/whisper',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes SDK, registers catalog model, downloads, and transcribes', async () => {
    const adapter = new RunAnywhereSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();
    await adapter.initialize(); // second call should be no-op

    const transcriptionPromise = adapter.transcribe();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(transcriptionPromise).resolves.toEqual({
      text: 'hello world',
      confidence: 0.91,
      provider: 'runanywhere-onnx',
      durationMs: 1250,
    });

    expect(RunAnywhere.initialize).toHaveBeenCalledTimes(1);
    expect(ONNXProvider.register).toHaveBeenCalledTimes(1);
    expect(ONNX.addModel).toHaveBeenCalledTimes(1);
    expect(ONNX.addModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sherpa-onnx-whisper-tiny.en',
        url: expect.stringContaining('sherpa-onnx-whisper-tiny.en'),
      })
    );
    expect(RunAnywhere.isModelDownloaded).toHaveBeenCalledWith(
      'sherpa-onnx-whisper-tiny.en'
    );
    expect(RunAnywhere.downloadModel).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.getModelInfo).toHaveBeenCalledWith(
      'sherpa-onnx-whisper-tiny.en'
    );
    expect(RunAnywhere.loadSTTModel).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.loadSTTModel).toHaveBeenCalledWith(
      '/resolved/whisper',
      'whisper'
    );
    expect(mockRecorderInstance.startRecorder).toHaveBeenCalledTimes(1);
    expect(mockRecorderInstance.startRecorder).toHaveBeenCalledWith(
      undefined,
      {
        AudioSourceAndroid: 6,
        OutputFormatAndroid: 2,
        AudioEncoderAndroid: 3,
        AudioSamplingRateAndroid: 16000,
        AudioChannelsAndroid: 1,
        AudioEncodingBitRateAndroid: 64000,
        AVFormatIDKeyIOS: 'wav',
        AVSampleRateKeyIOS: 16000,
        AVNumberOfChannelsKeyIOS: 1,
        AVEncoderAudioQualityKeyIOS: 96,
        AVModeIOS: 'measurement',
      },
      false
    );
    expect(mockRecorderInstance.stopRecorder).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.transcribeFile).toHaveBeenCalledWith(
      '/tmp/recording.wav'
    );
    expect(mockRecorderInstance.removeRecordBackListener).toHaveBeenCalledTimes(
      1
    );
  });

  it('skips download when model is already local', async () => {
    (RunAnywhere.isModelDownloaded as jest.Mock).mockResolvedValue(true);

    const adapter = new RunAnywhereSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();

    expect(RunAnywhere.downloadModel).not.toHaveBeenCalled();
    expect(RunAnywhere.loadSTTModel).toHaveBeenCalledTimes(1);
  });

  it('skips SDK init when RunAnywhere is already initialized', async () => {
    (RunAnywhere as unknown as Record<string, unknown>).isSDKInitialized = true;

    const adapter = new RunAnywhereSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();

    expect(RunAnywhere.initialize).not.toHaveBeenCalled();
    expect(ONNXProvider.register).toHaveBeenCalledTimes(1);
  });

  it('forwards download progress via onProgress callback', async () => {
    let capturedCallback: ((p: { progress: number }) => void) | undefined;
    (RunAnywhere.downloadModel as jest.Mock).mockImplementation(
      async (_id: string, onProgress: (p: { progress: number }) => void) => {
        capturedCallback = onProgress;
      }
    );

    const onProgress = jest.fn();
    const adapter = new RunAnywhereSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize(onProgress);

    capturedCallback?.({ progress: 0.5 });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ progress: 50 })
    );
  });

  it('throws if getModelInfo returns no localPath', async () => {
    (RunAnywhere.getModelInfo as jest.Mock).mockResolvedValue({
      localPath: null,
    });

    const adapter = new RunAnywhereSTTAdapter({ modelId: 'whisper-tiny-en' });
    await expect(adapter.initialize()).rejects.toThrow(
      'path could not be resolved'
    );
  });

  it('cancels recording before transcription runs', async () => {
    const adapter = new RunAnywhereSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve();
    await adapter.cancel();

    await expect(transcriptionPromise).rejects.toBeInstanceOf(
      RunAnywhereSTTCancelledError
    );

    expect(mockRecorderInstance.stopRecorder).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.transcribeFile).not.toHaveBeenCalled();
    expect(mockRecorderInstance.removeRecordBackListener).toHaveBeenCalledTimes(
      1
    );
  });

  it('cancels even if the request happens while recorder startup is in flight', async () => {
    let resolveStartRecorder: (() => void) | undefined;
    mockRecorderInstance.startRecorder.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveStartRecorder = () => {
            resolve('/tmp/recording.wav');
          };
        })
    );

    const adapter = new RunAnywhereSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve();
    await adapter.cancel();
    if (typeof resolveStartRecorder === 'function') {
      resolveStartRecorder();
    }

    await expect(transcriptionPromise).rejects.toBeInstanceOf(
      RunAnywhereSTTCancelledError
    );

    expect(mockRecorderInstance.stopRecorder).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.transcribeFile).not.toHaveBeenCalled();
  });

  it('throws if transcribe is called before initialize', async () => {
    const adapter = new RunAnywhereSTTAdapter({
      modelId: 'whisper-tiny-en',
    });

    await expect(adapter.transcribe()).rejects.toThrow(
      'RunAnywhereSTTAdapter: call initialize() first'
    );
  });

  it('unloads the model on dispose and can be initialized again for a later session', async () => {
    const adapter = new RunAnywhereSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 1000,
    });

    await adapter.initialize();
    await adapter.dispose();

    expect(RunAnywhere.unloadSTTModel).toHaveBeenCalledTimes(1);

    // resolvedModelPath is determined internally; no setResolvedPath needed
    // before reinitializing — adapter resolves from catalog on each initialize().
    await adapter.initialize();

    expect(ONNXProvider.register).toHaveBeenCalledTimes(2);
    expect(RunAnywhere.loadSTTModel).toHaveBeenCalledTimes(2);
    expect(RunAnywhere.loadSTTModel).toHaveBeenNthCalledWith(
      2,
      '/resolved/whisper',
      'whisper'
    );
  });

  it('cancels any active transcription while disposing and still unloads the model', async () => {
    const adapter = new RunAnywhereSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve();
    const disposePromise = adapter.dispose();

    await expect(transcriptionPromise).rejects.toBeInstanceOf(
      RunAnywhereSTTCancelledError
    );
    await expect(disposePromise).resolves.toBeUndefined();

    expect(mockRecorderInstance.stopRecorder).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.unloadSTTModel).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.transcribeFile).not.toHaveBeenCalled();
  });
});
