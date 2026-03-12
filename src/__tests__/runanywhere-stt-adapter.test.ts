const mockRecorderInstance = {
  startRecorder: jest.fn(async () => '/tmp/recording.wav'),
  stopRecorder: jest.fn(async () => '/tmp/recording.wav'),
  removeRecordBackListener: jest.fn(),
};

const mockAudioRecorderPlayer = jest.fn(() => mockRecorderInstance);

jest.mock('@runanywhere/core', () => ({
  RunAnywhere: {
    loadSTTModel: jest.fn(async () => true),
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
  ONNX: {
    register: jest.fn(),
  },
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
import { ONNX } from '@runanywhere/onnx';
import { RunAnywhereSTTAdapter } from '../providers/runanywhere/RunAnywhereSTTAdapter';

describe('RunAnywhereSTTAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockRecorderInstance.startRecorder.mockResolvedValue('/tmp/recording.wav');
    mockRecorderInstance.stopRecorder.mockResolvedValue('/tmp/recording.wav');
    (RunAnywhere.transcribeFile as jest.Mock).mockResolvedValue({
      text: 'hello world',
      confidence: 0.91,
      duration: 1.25,
      segments: [],
      alternatives: [],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads the STT model once and maps transcription results', async () => {
    const adapter = new RunAnywhereSTTAdapter({
      modelPath: '/models/whisper.onnx',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();
    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(transcriptionPromise).resolves.toEqual({
      text: 'hello world',
      confidence: 0.91,
      provider: 'runanywhere-onnx',
      durationMs: 1250,
    });

    expect(ONNX.register).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.loadSTTModel).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.loadSTTModel).toHaveBeenCalledWith(
      '/models/whisper.onnx',
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
    expect(RunAnywhere.transcribeFile).toHaveBeenCalledWith('/tmp/recording.wav');
    expect(mockRecorderInstance.removeRecordBackListener).toHaveBeenCalledTimes(1);
  });

  it('cancels recording before transcription runs', async () => {
    const adapter = new RunAnywhereSTTAdapter({
      modelPath: '/models/whisper.onnx',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve();
    await adapter.cancel();

    await expect(transcriptionPromise).rejects.toThrow(
      'Transcription was cancelled.'
    );

    expect(mockRecorderInstance.stopRecorder).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.transcribeFile).not.toHaveBeenCalled();
    expect(mockRecorderInstance.removeRecordBackListener).toHaveBeenCalledTimes(1);
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
      modelPath: '/models/whisper.onnx',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve();
    await adapter.cancel();
    if (typeof resolveStartRecorder === 'function') {
      resolveStartRecorder();
    }

    await expect(transcriptionPromise).rejects.toThrow(
      'Transcription was cancelled.'
    );

    expect(mockRecorderInstance.stopRecorder).toHaveBeenCalledTimes(1);
    expect(RunAnywhere.transcribeFile).not.toHaveBeenCalled();
  });

  it('throws if transcribe is called before initialize', async () => {
    const adapter = new RunAnywhereSTTAdapter({
      modelPath: '/models/whisper.onnx',
    });

    await expect(adapter.transcribe()).rejects.toThrow(
      'RunAnywhereSTTAdapter: call initialize() first'
    );
  });
});
