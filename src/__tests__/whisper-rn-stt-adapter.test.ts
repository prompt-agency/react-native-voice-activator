// ─── Mocks — must be declared before imports ─────────────────────────────────

const mockWhisperContext = {
  transcribe: jest.fn(),
  release: jest.fn().mockResolvedValue(undefined),
};

const mockInitWhisper = jest.fn().mockResolvedValue(mockWhisperContext);

jest.mock('whisper.rn', () => ({
  __esModule: true,
  initWhisper: mockInitWhisper,
  releaseAllWhisper: jest.fn().mockResolvedValue(undefined),
}));

const mockRNFS = {
  DocumentDirectoryPath: '/mock/documents',
  CachesDirectoryPath: '/mock/caches',
  exists: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  downloadFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
};

// react-native-fs uses named exports (no default) — spread the mock object directly
jest.mock('react-native-fs', () => ({
  __esModule: true,
  ...mockRNFS,
}));

// iOS recorder mock — mirrors runanywhere-stt-adapter.test.ts
const mockRecorderInstance = {
  startRecorder: jest.fn(async () => '/tmp/recording.wav'),
  stopRecorder: jest.fn(async () => '/tmp/recording.wav'),
  removeRecordBackListener: jest.fn(),
};

const mockAudioRecorderPlayer = jest.fn(() => mockRecorderInstance);

jest.mock('react-native-audio-recorder-player', () => ({
  __esModule: true,
  default: mockAudioRecorderPlayer,
  AudioSourceAndroidType: { VOICE_RECOGNITION: 6 },
  OutputFormatAndroidType: { MPEG_4: 2 },
  AudioEncoderAndroidType: { AAC: 3 },
  AVEncodingOption: { wav: 'wav' },
  AVEncoderAudioQualityIOSType: { high: 96 },
  AVModeIOSOption: { measurement: 'measurement' },
}));

// Android PCM stream mock
const mockPcmStreamSubscription = { remove: jest.fn() };

const mockPcmStream = {
  init: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  addListener: jest.fn(() => mockPcmStreamSubscription),
};

jest.mock('@fugood/react-native-audio-pcm-stream', () => ({
  __esModule: true,
  default: mockPcmStream,
}));

// react-native Platform mock — factory must not reference outer variables (hoisting)
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' as 'ios' | 'android' },
}));

// Grab the mutable Platform ref after mock is registered
const mockPlatform = jest.requireMock('react-native').Platform as {
  OS: 'ios' | 'android';
};

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  WhisperRNSTTAdapter,
  WhisperRNSTTCancelledError,
} from '../providers/whisper-rn/WhisperRNSTTAdapter';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhisperRNSTTAdapter — iOS path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockPlatform.OS = 'ios';
    mockRNFS.exists.mockResolvedValue(false);
    mockRNFS.downloadFile.mockReturnValue({ promise: Promise.resolve() });
    mockRecorderInstance.startRecorder.mockResolvedValue('/tmp/recording.wav');
    mockRecorderInstance.stopRecorder.mockResolvedValue('/tmp/recording.wav');
    // CRITICAL: transcribe() returns { stop, promise } SYNCHRONOUSLY
    mockWhisperContext.transcribe.mockReturnValue({
      stop: jest.fn().mockResolvedValue(undefined),
      promise: Promise.resolve({ result: 'hello world' }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes model download, loads context, and transcribes on iOS', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await jest.advanceTimersByTimeAsync(5000);

    const result = await transcriptionPromise;
    expect(result).toEqual({ text: 'hello world', provider: 'whisper-rn' });

    expect(mockInitWhisper).toHaveBeenCalledWith({
      filePath: '/mock/documents/whisper-rn/ggml-tiny.en.bin',
    });
    expect(mockRNFS.downloadFile).toHaveBeenCalledTimes(1);
    expect(mockRecorderInstance.startRecorder).toHaveBeenCalledTimes(1);
    expect(mockRecorderInstance.stopRecorder).toHaveBeenCalledTimes(1);
    // iOS: file:// prefix on path passed to ctx.transcribe()
    expect(mockWhisperContext.transcribe).toHaveBeenCalledWith(
      'file:///tmp/recording.wav',
      { language: 'en' }
    );
    expect(mockRecorderInstance.removeRecordBackListener).toHaveBeenCalledTimes(
      1
    );
    // iOS: WAV cleanup via rnfs.unlink
    expect(mockRNFS.unlink).toHaveBeenCalledWith('/tmp/recording.wav');
  });

  it('skips download when model already cached', async () => {
    mockRNFS.exists.mockResolvedValue(true);

    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();

    expect(mockRNFS.downloadFile).not.toHaveBeenCalled();
    expect(mockInitWhisper).toHaveBeenCalledTimes(1);
  });

  it('second initialize() call is a no-op (idempotent)', async () => {
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();
    await adapter.initialize();

    expect(mockInitWhisper).toHaveBeenCalledTimes(1);
    expect(mockRNFS.downloadFile).toHaveBeenCalledTimes(1);
  });

  it('forwards download progress via onProgress callback', async () => {
    let capturedCallback:
      | ((res: { bytesWritten: number; contentLength: number }) => void)
      | undefined;
    mockRNFS.downloadFile.mockImplementation(
      (opts: {
        progress?: (res: {
          bytesWritten: number;
          contentLength: number;
        }) => void;
      }) => {
        capturedCallback = opts.progress;
        return { promise: Promise.resolve() };
      }
    );

    const onProgress = jest.fn();
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize(onProgress);

    capturedCallback?.({ bytesWritten: 50, contentLength: 100 });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ progress: 50 })
    );
  });

  it('throws if transcribe() is called before initialize()', async () => {
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });

    await expect(adapter.transcribe()).rejects.toThrow(
      'WhisperRNSTTAdapter: call initialize() first'
    );
  });

  it('cancel() stops recording and throws WhisperRNSTTCancelledError on iOS', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve(); // let startRecorder complete
    await adapter.cancel();

    await expect(transcriptionPromise).rejects.toBeInstanceOf(
      WhisperRNSTTCancelledError
    );

    expect(mockRecorderInstance.stopRecorder).toHaveBeenCalledTimes(1);
    expect(mockWhisperContext.transcribe).not.toHaveBeenCalled();
    expect(mockRecorderInstance.removeRecordBackListener).toHaveBeenCalledTimes(
      1
    );
  });

  it('throws if transcribe() is called while another is already in progress on iOS', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const firstTranscription = adapter.transcribe();
    await Promise.resolve();

    await expect(adapter.transcribe()).rejects.toThrow(
      'WhisperRNSTTAdapter: transcription already in progress'
    );

    await adapter.cancel();
    await expect(firstTranscription).rejects.toBeInstanceOf(
      WhisperRNSTTCancelledError
    );
  });

  it('dispose() calls ctx.release() and nulls all refs', async () => {
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();
    await adapter.dispose();

    expect(mockWhisperContext.release).toHaveBeenCalledTimes(1);
  });

  it('dispose() cancels active transcription before releasing context', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve();
    const disposePromise = adapter.dispose();

    await expect(transcriptionPromise).rejects.toBeInstanceOf(
      WhisperRNSTTCancelledError
    );
    await expect(disposePromise).resolves.toBeUndefined();

    expect(mockWhisperContext.release).toHaveBeenCalledTimes(1);
    expect(mockWhisperContext.transcribe).not.toHaveBeenCalled();
  });
});

describe('WhisperRNSTTAdapter — Android path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockPlatform.OS = 'android';
    mockRNFS.exists.mockResolvedValue(false);
    mockRNFS.downloadFile.mockReturnValue({ promise: Promise.resolve() });
    mockWhisperContext.transcribe.mockReturnValue({
      stop: jest.fn().mockResolvedValue(undefined),
      promise: Promise.resolve({ result: 'android transcription' }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes PCM stream on Android — no audio-recorder-player loaded', async () => {
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();

    expect(mockPcmStream.init).toHaveBeenCalledWith({
      sampleRate: 16_000,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6, // AudioSource.VOICE_RECOGNITION
      bufferSize: 4096,
    });
    expect(mockAudioRecorderPlayer).not.toHaveBeenCalled();
  });

  it('transcribes on Android: starts PCM stream, assembles WAV, passes bare path to ctx.transcribe()', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 2000,
    });

    await adapter.initialize();

    // Simulate one PCM chunk arriving during recording
    let pcmCallback: ((data: string) => void) | undefined;
    (mockPcmStream.addListener as jest.Mock).mockImplementationOnce(
      (_event: string, callback: (data: string) => void) => {
        pcmCallback = callback;
        return mockPcmStreamSubscription;
      }
    );

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve(); // let addListener + start() register

    // Emit a PCM chunk (valid base64 of some bytes)
    pcmCallback?.(btoa('\x00\x01\x02\x03'));

    await jest.advanceTimersByTimeAsync(2000);

    const result = await transcriptionPromise;

    expect(result).toEqual({
      text: 'android transcription',
      provider: 'whisper-rn',
    });

    expect(mockPcmStream.start).toHaveBeenCalledTimes(1);
    expect(mockPcmStream.stop).toHaveBeenCalledTimes(1);
    expect(mockRNFS.writeFile).toHaveBeenCalledWith(
      '/mock/caches/voice-activator/recording.wav',
      expect.any(String), // base64-encoded WAV
      'base64'
    );
    // Android: bare path — NO file:// prefix
    expect(mockWhisperContext.transcribe).toHaveBeenCalledWith(
      '/mock/caches/voice-activator/recording.wav',
      { language: 'en' }
    );
  });

  it('cleans up temp WAV file on Android even when cancelled', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve();
    await adapter.cancel();

    await expect(transcriptionPromise).rejects.toBeInstanceOf(
      WhisperRNSTTCancelledError
    );

    expect(mockPcmStream.stop).toHaveBeenCalled();
    expect(mockPcmStreamSubscription.remove).toHaveBeenCalled();
  });

  it('cancel() stops PCM stream on Android', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve();
    await adapter.cancel();

    await expect(transcriptionPromise).rejects.toBeInstanceOf(
      WhisperRNSTTCancelledError
    );

    expect(mockPcmStream.stop).toHaveBeenCalled();
    expect(mockWhisperContext.transcribe).not.toHaveBeenCalled();
  });

  it('dispose() calls ctx.release() on Android', async () => {
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();
    await adapter.dispose();

    expect(mockWhisperContext.release).toHaveBeenCalledTimes(1);
  });

  it('dispose() without active transcription on Android does not throw', async () => {
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();

    await expect(adapter.dispose()).resolves.toBeUndefined();
    expect(mockWhisperContext.release).toHaveBeenCalledTimes(1);
  });

  it('dispose() with active transcription on Android cancels then releases', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve();
    const disposePromise = adapter.dispose();

    await expect(transcriptionPromise).rejects.toBeInstanceOf(
      WhisperRNSTTCancelledError
    );
    await expect(disposePromise).resolves.toBeUndefined();

    expect(mockWhisperContext.release).toHaveBeenCalledTimes(1);
    expect(mockPcmStream.stop).toHaveBeenCalled();
  });

  it('throws if transcribe() is called while another is already in progress on Android', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const firstTranscription = adapter.transcribe();
    await Promise.resolve();

    await expect(adapter.transcribe()).rejects.toThrow(
      'WhisperRNSTTAdapter: transcription already in progress'
    );

    await adapter.cancel();
    await expect(firstTranscription).rejects.toBeInstanceOf(
      WhisperRNSTTCancelledError
    );
  });
});
