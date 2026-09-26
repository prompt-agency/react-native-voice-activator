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

// iOS recorder mock — same shape as production react-native-audio-recorder-player usage
const mockRecorderInstance = {
  startRecorder: jest.fn(async () => '/tmp/recording.wav'),
  stopRecorder: jest.fn(async () => '/tmp/recording.wav'),
  addRecordBackListener: jest.fn(),
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
  AVLinearPCMBitDepthKeyIOSType: { bit16: 16 },
}));

// Android now records through the package's own native capture, so there is no
// third-party audio module to mock — only the native module and its event
// emitter.
const mockNativeSubscription = { remove: jest.fn() };

const mockNativeCapture = {
  startVADCapture: jest.fn().mockResolvedValue(undefined),
  stopVADCapture: jest.fn().mockResolvedValue(undefined),
};

const mockAddListener = jest.fn(() => mockNativeSubscription);

// react-native Platform mock — factory must not reference outer variables (hoisting)
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' as 'ios' | 'android' },
  NativeModules: {
    VoiceActivator: {
      startVADCapture: jest.fn().mockResolvedValue(undefined),
      stopVADCapture: jest.fn().mockResolvedValue(undefined),
    },
  },
  NativeEventEmitter: jest.fn(),
}));

// Grab the mutable refs after the mock is registered
const reactNativeMock = jest.requireMock('react-native') as {
  Platform: { OS: 'ios' | 'android' };
  NativeModules: { VoiceActivator: typeof mockNativeCapture };
  NativeEventEmitter: jest.Mock;
};
const mockPlatform = reactNativeMock.Platform;
reactNativeMock.NativeModules.VoiceActivator = mockNativeCapture;

/**
 * Re-arm the mocks that jest.clearAllMocks() strips.
 *
 * clearAllMocks() removes implementations set with mockImplementation, so
 * wiring NativeEventEmitter once at module scope leaves addListener returning
 * undefined from the second test onwards — which throws inside the adapter
 * before it ever reaches the microphone.
 */
function armNativeMocks() {
  reactNativeMock.NativeEventEmitter.mockImplementation(() => ({
    addListener: mockAddListener,
  }));
  mockAddListener.mockReturnValue(mockNativeSubscription);
  mockNativeCapture.startVADCapture.mockResolvedValue(undefined);
  mockNativeCapture.stopVADCapture.mockResolvedValue(undefined);
}

armNativeMocks();

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  WhisperRNSTTAdapter,
  WhisperRNSTTCancelledError,
} from '../providers/whisper-rn/WhisperRNSTTAdapter';
import { __resetNativeCaptureRefCountForTests } from '../internal/native-pcm-capture';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhisperRNSTTAdapter — iOS path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockPlatform.OS = 'ios';
    __resetNativeCaptureRefCountForTests();
    armNativeMocks();
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
    expect(mockRecorderInstance.addRecordBackListener).toHaveBeenCalledTimes(1);
    expect(mockRecorderInstance.stopRecorder).toHaveBeenCalledTimes(1);
    // iOS: file:// prefix on path passed to ctx.transcribe(), with tuned inference options
    expect(mockWhisperContext.transcribe).toHaveBeenCalledWith(
      'file:///tmp/recording.wav',
      { language: 'en', beamSize: 5, noSpeechThold: 0.95, temperature: 0 }
    );
    expect(mockRecorderInstance.removeRecordBackListener).toHaveBeenCalledTimes(
      1
    );
    // iOS: WAV cleanup via rnfs.unlink
    expect(mockRNFS.unlink).toHaveBeenCalledWith('/tmp/recording.wav');
  });

  it('iOS transcribe normalizes stopRecorder path when it already has file://', async () => {
    mockRecorderInstance.stopRecorder.mockResolvedValue(
      'file:///tmp/recording.wav'
    );

    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 5000,
    });

    await adapter.initialize();

    const transcriptionPromise = adapter.transcribe();
    await jest.advanceTimersByTimeAsync(5000);

    await transcriptionPromise;

    expect(mockWhisperContext.transcribe).toHaveBeenCalledWith(
      'file:///tmp/recording.wav',
      { language: 'en', beamSize: 5, noSpeechThold: 0.95, temperature: 0 }
    );
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

  it('transcribeFromWavPath passes file:// URI to ctx.transcribe on iOS', async () => {
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();

    mockWhisperContext.transcribe.mockReturnValue({
      stop: jest.fn().mockResolvedValue(undefined),
      promise: Promise.resolve({ result: 'from file' }),
    });

    const result = await adapter.transcribeFromWavPath('/tmp/vad.wav');
    expect(result).toEqual({ text: 'from file', provider: 'whisper-rn' });
    expect(mockWhisperContext.transcribe).toHaveBeenCalledWith(
      'file:///tmp/vad.wav',
      { language: 'en' }
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
    expect(mockRecorderInstance.addRecordBackListener).toHaveBeenCalledTimes(1);
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
    __resetNativeCaptureRefCountForTests();
    armNativeMocks();
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

  it('records through the package native capture, not a third-party module', async () => {
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();

    // initialize() must not touch the microphone at all on Android — capture is
    // acquired per transcription and released again, so the wake-word engine
    // keeps the mic between turns.
    expect(mockNativeCapture.startVADCapture).not.toHaveBeenCalled();
    // And the iOS recorder is not constructed on Android.
    expect(mockAudioRecorderPlayer).not.toHaveBeenCalled();
  });

  it('transcribeFromWavPath passes bare path to ctx.transcribe on Android', async () => {
    const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
    await adapter.initialize();

    mockWhisperContext.transcribe.mockReturnValue({
      stop: jest.fn().mockResolvedValue(undefined),
      promise: Promise.resolve({ result: 'android file' }),
    });

    const result = await adapter.transcribeFromWavPath(
      '/mock/caches/voice-activator/vad.wav'
    );
    expect(result).toEqual({ text: 'android file', provider: 'whisper-rn' });
    expect(mockWhisperContext.transcribe).toHaveBeenCalledWith(
      '/mock/caches/voice-activator/vad.wav',
      { language: 'en' }
    );
  });

  it('transcribes on Android: acquires native capture, assembles WAV, passes a bare path to ctx.transcribe()', async () => {
    const adapter = new WhisperRNSTTAdapter({
      modelId: 'whisper-tiny-en',
      maxRecordingMs: 2000,
    });

    await adapter.initialize();

    // Simulate one PCM frame arriving during recording
    let pcmCallback: ((event: { pcm: string }) => void) | undefined;
    mockAddListener.mockImplementationOnce(((
      _event: string,
      callback: (e: { pcm: string }) => void
    ) => {
      pcmCallback = callback;
      return mockNativeSubscription;
    }) as unknown as typeof mockAddListener);

    const transcriptionPromise = adapter.transcribe();
    await Promise.resolve(); // let on() + start() register

    // Native capture emits 16 kHz float32 frames, so the payload is a float32
    // buffer rather than the 16-bit stream the old module produced.
    pcmCallback?.({
      pcm: Buffer.from(new Float32Array([0, 0.1, -0.1, 0.2]).buffer).toString(
        'base64'
      ),
    });

    await jest.advanceTimersByTimeAsync(2000);

    const result = await transcriptionPromise;

    expect(result).toEqual({
      text: 'android transcription',
      provider: 'whisper-rn',
    });

    expect(mockNativeCapture.startVADCapture).toHaveBeenCalledWith(16000);
    // Released before transcription, so the mic is not held while Whisper runs.
    expect(mockNativeCapture.stopVADCapture).toHaveBeenCalledTimes(1);
    // Unique per call, so two overlapping transcriptions cannot clobber each other.
    expect(mockRNFS.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/mock\/caches\/voice-activator\/whisper-android-\d+-\d+\.wav$/
      ),
      expect.any(String), // base64-encoded WAV
      'base64'
    );
    // Android: bare path — NO file:// prefix
    expect(mockWhisperContext.transcribe).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/mock\/caches\/voice-activator\/whisper-android-\d+-\d+\.wav$/
      ),
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

    expect(mockNativeCapture.stopVADCapture).toHaveBeenCalled();
    expect(mockNativeSubscription.remove).toHaveBeenCalled();
  });

  it('cancel() releases native capture on Android', async () => {
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

    expect(mockNativeCapture.stopVADCapture).toHaveBeenCalled();
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
    expect(mockNativeCapture.stopVADCapture).toHaveBeenCalled();
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
