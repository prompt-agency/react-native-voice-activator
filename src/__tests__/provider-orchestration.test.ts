/**
 * E2E-style integration tests for the provider orchestration pipeline in
 * voice-activator.ts — the async flow that runs STT transcription and optional
 * TTS synthesis after a wake-word event.
 *
 * Each test resets the module registry so voice-activator.ts starts with fresh
 * singleton state. This mirrors the approach used in native-module.test.ts.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

import type {
  SpeechToTextProvider,
  TextToSpeechProvider,
  TranscriptionResult,
  WakeWordDetectedEvent,
} from '../public/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Drain the microtask queue and any scheduled macrotasks. */
async function flushAsync(passes = 5) {
  for (let i = 0; i < passes; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function makeStt(
  overrides?: Partial<SpeechToTextProvider>
): SpeechToTextProvider {
  return {
    name: 'mock-stt',
    transcribe: jest.fn().mockResolvedValue({
      text: 'hello world',
      provider: 'mock-stt',
    } as TranscriptionResult),
    cancel: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTts(
  overrides?: Partial<TextToSpeechProvider>
): TextToSpeechProvider {
  return {
    name: 'mock-tts',
    speak: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeWakeWordPayload(phrase = 'hey'): WakeWordDetectedEvent {
  return { detectedPhrase: phrase, detectedAt: '2026-01-01T00:00:00.000Z' };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('provider orchestration', () => {
  let capturedWakeWordHandler:
    | ((payload: WakeWordDetectedEvent) => void)
    | null = null;

  function buildRuntimeBridge() {
    return {
      initialize: jest.fn().mockResolvedValue(undefined),
      startDetection: jest.fn().mockResolvedValue(undefined),
      stopDetection: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({
        state: 'running',
        isAvailable: true,
        isListening: true,
        canStart: false,
        lastError: null,
      }),
    };
  }

  function setupMocks() {
    capturedWakeWordHandler = null;
    const runtimeBridge = buildRuntimeBridge();

    jest.doMock('../internal/native-module', () => ({
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(
        (h: (p: WakeWordDetectedEvent) => void) => {
          capturedWakeWordHandler = h;
        }
      ),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(() => ({ remove: jest.fn() })),
      emitSessionEvent: jest.fn(),
    }));

    return runtimeBridge;
  }

  beforeEach(() => {
    jest.resetModules();
    setupMocks();
  });

  // ─── STT transcription pipeline ───────────────────────────────────────────

  it('emits transcriptionStarted → transcriptionResult after wake word with STT provider', async () => {
    const stt = makeStt();
    const { initialize, startDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const events: string[] = [];
    const results: TranscriptionResult[] = [];

    addWakeWordListener('transcriptionStarted', () =>
      events.push('transcriptionStarted')
    );
    addWakeWordListener('transcriptionResult', (payload) => {
      events.push('transcriptionResult');
      results.push(payload);
    });

    await initialize({ sttProvider: stt });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync();

    expect(events).toEqual(['transcriptionStarted', 'transcriptionResult']);
    expect(results[0]).toEqual({ text: 'hello world', provider: 'mock-stt' });
    expect(stt.transcribe).toHaveBeenCalledTimes(1);
  });

  // ─── STT + TTS autoSpeak pipeline ────────────────────────────────────────

  it('emits speechStarted → speechCompleted when autoSpeak is enabled with TTS provider', async () => {
    const stt = makeStt();
    const tts = makeTts();
    const { initialize, startDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const events: string[] = [];

    addWakeWordListener('transcriptionStarted', () =>
      events.push('transcriptionStarted')
    );
    addWakeWordListener('transcriptionResult', () =>
      events.push('transcriptionResult')
    );
    addWakeWordListener('speechStarted', () => events.push('speechStarted'));
    addWakeWordListener('speechCompleted', () =>
      events.push('speechCompleted')
    );

    await initialize({ sttProvider: stt, ttsProvider: tts, autoSpeak: true });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    expect(events).toEqual([
      'transcriptionStarted',
      'transcriptionResult',
      'speechStarted',
      'speechCompleted',
    ]);
    expect(tts.speak).toHaveBeenCalledWith('hello world');
  });

  // ─── TTS is skipped without autoSpeak ────────────────────────────────────

  it('skips TTS synthesis when autoSpeak is false', async () => {
    const stt = makeStt();
    const tts = makeTts();
    const { initialize, startDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const speechEvents: string[] = [];
    addWakeWordListener('speechStarted', () =>
      speechEvents.push('speechStarted')
    );
    addWakeWordListener('speechCompleted', () =>
      speechEvents.push('speechCompleted')
    );

    await initialize({ sttProvider: stt, ttsProvider: tts, autoSpeak: false });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync();

    expect(speechEvents).toHaveLength(0);
    expect(tts.speak).not.toHaveBeenCalled();
  });

  // ─── STT failure emits transcriptionError ─────────────────────────────────

  it('emits transcriptionError when STT transcription throws', async () => {
    const stt = makeStt({
      transcribe: jest.fn().mockRejectedValue(new Error('mic unavailable')),
    });
    const { initialize, startDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const errors: unknown[] = [];
    addWakeWordListener('transcriptionError', (payload) =>
      errors.push(payload)
    );

    await initialize({ sttProvider: stt });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'stt_transcribe_failed',
      provider: 'mock-stt',
      message: 'mic unavailable',
    });
  });

  // ─── Cancelled transcription ──────────────────────────────────────────────

  it('emits transcriptionError with stt_cancelled code when STT throws a cancel error', async () => {
    const stt = makeStt({
      transcribe: jest
        .fn()
        .mockRejectedValue({ code: 'stt_cancelled', message: 'Cancelled.' }),
    });
    const { initialize, startDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const errors: unknown[] = [];
    addWakeWordListener('transcriptionError', (payload) =>
      errors.push(payload)
    );

    await initialize({ sttProvider: stt });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync();

    expect(errors[0]).toMatchObject({ code: 'stt_cancelled' });
  });

  // ─── Generation invalidation ──────────────────────────────────────────────

  it('discards stale transcription result when stopDetection invalidates generation mid-flight', async () => {
    let resolveTranscription!: (result: TranscriptionResult) => void;
    const pendingTranscription = new Promise<TranscriptionResult>((resolve) => {
      resolveTranscription = resolve;
    });

    const stt = makeStt({
      transcribe: jest.fn().mockReturnValue(pendingTranscription),
      cancel: jest.fn().mockResolvedValue(undefined),
    });

    const { initialize, startDetection, stopDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const transcriptionResults: TranscriptionResult[] = [];
    addWakeWordListener('transcriptionResult', (p) =>
      transcriptionResults.push(p)
    );

    await initialize({ sttProvider: stt });
    await startDetection();

    // Fire wake word to start pending transcription
    capturedWakeWordHandler!(makeWakeWordPayload());
    await Promise.resolve(); // let the queue pick it up

    // stopDetection invalidates the orchestration generation
    await stopDetection();

    // Resolve the pending transcription after invalidation
    resolveTranscription({ text: 'stale result', provider: 'mock-stt' });
    await flushAsync();

    // Stale result must be dropped
    expect(transcriptionResults).toHaveLength(0);
  });

  // ─── No STT provider → orchestration skipped ─────────────────────────────

  it('does not emit transcriptionStarted when no STT provider is configured', async () => {
    const { initialize, startDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const transcriptionEvents: string[] = [];
    addWakeWordListener('transcriptionStarted', () =>
      transcriptionEvents.push('started')
    );

    await initialize({}); // no sttProvider
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync();

    expect(transcriptionEvents).toHaveLength(0);
  });

  // ─── TTS error emits speechError ─────────────────────────────────────────

  it('emits speechError when TTS speak throws', async () => {
    const stt = makeStt();
    const tts = makeTts({
      speak: jest
        .fn()
        .mockRejectedValue(new Error('audio session interrupted')),
    });
    const { initialize, startDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const speechErrors: unknown[] = [];
    addWakeWordListener('speechError', (p) => speechErrors.push(p));

    await initialize({ sttProvider: stt, ttsProvider: tts, autoSpeak: true });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    expect(speechErrors).toHaveLength(1);
    expect(speechErrors[0]).toMatchObject({
      code: 'tts_speak_failed',
      provider: 'mock-tts',
      message: 'audio session interrupted',
    });
  });
});
