/**
 * provider-orchestration-deadlock.test.ts
 *
 * The provider orchestration queue is a single module-level serially-chained
 * promise. Every wake word chains its callback onto whatever the queue
 * currently references, so a provider promise that never settles blocked every
 * subsequent wake word for the remaining lifetime of the process.
 *
 * The generation guard cannot help on its own: the check runs *inside* the
 * queued callback, so a wedged chain never reaches it.
 *
 * This is reachable in practice. WhisperRNSTTAdapter.cancel() cites whisper.rn
 * issue #183, acknowledging stop() may not unblock a pending transcription, and
 * CustomTTSAdapter.stop() only sets a flag checked at await boundaries — it
 * never cancels the blocking ONNX session.run().
 *
 * Two independent guarantees are asserted here:
 *   1. a provider call is bounded, so the chain always settles
 *   2. stopDetection() resets the queue, so a wedged promise from a previous
 *      generation cannot block new work even before it times out
 */

import type {
  SpeechToTextProvider,
  TextToSpeechProvider,
  TranscriptionResult,
  WakeWordDetectedEvent,
} from '../public/types';

async function flushAsync(passes = 5) {
  for (let i = 0; i < passes; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/** A promise that never settles, standing in for a wedged native call. */
function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function makeWakeWordPayload(phrase = 'hey'): WakeWordDetectedEvent {
  return { detectedPhrase: phrase, detectedAt: '2026-01-01T00:00:00.000Z' };
}

describe('provider orchestration queue — wedged provider promises', () => {
  let capturedWakeWordHandler:
    | ((payload: WakeWordDetectedEvent) => void)
    | null = null;

  function setupMocks() {
    capturedWakeWordHandler = null;
    const runtimeBridge = {
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
  }

  beforeEach(() => {
    jest.resetModules();
    jest.useRealTimers();
    setupMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not block later wake words when transcribe() never settles', async () => {
    const transcribe = jest
      .fn<Promise<TranscriptionResult>, []>()
      .mockImplementationOnce(() => neverSettles())
      .mockImplementationOnce(async () => ({
        text: 'second',
        provider: 'mock-stt',
      }));

    const stt: SpeechToTextProvider = {
      name: 'mock-stt',
      transcribe,
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    const { initialize, startDetection } =
      await import('../public/voice-activator');

    await initialize({ sttProvider: stt, providerTimeoutMs: 50 });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync();
    expect(transcribe).toHaveBeenCalledTimes(1);

    // Wait past the bound so the wedged call is abandoned and the chain settles.
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    await flushAsync();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    // Unbounded, this stays at 1: the second callback is chained onto a promise
    // that never settles, so it never runs.
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it('emits a timeout error rather than failing silently', async () => {
    const stt: SpeechToTextProvider = {
      name: 'mock-stt',
      transcribe: jest.fn(() => neverSettles<TranscriptionResult>()),
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    const { initialize, startDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const codes: string[] = [];
    addWakeWordListener('transcriptionError', (payload) => {
      codes.push(payload.code);
    });

    await initialize({ sttProvider: stt, providerTimeoutMs: 50 });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    await flushAsync();

    expect(codes).toContain('stt_timeout');
  });

  it('cancels the wedged provider when the bound expires', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const stt: SpeechToTextProvider = {
      name: 'mock-stt',
      transcribe: jest.fn(() => neverSettles<TranscriptionResult>()),
      cancel,
    };

    const { initialize, startDetection } =
      await import('../public/voice-activator');

    await initialize({ sttProvider: stt, providerTimeoutMs: 50 });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    await flushAsync();

    expect(cancel).toHaveBeenCalled();
  });

  it('bounds a wedged speak() call too', async () => {
    const speak = jest
      .fn<Promise<void>, [string]>()
      .mockImplementationOnce(() => neverSettles())
      .mockImplementationOnce(async () => undefined);

    const stt: SpeechToTextProvider = {
      name: 'mock-stt',
      transcribe: jest
        .fn()
        .mockResolvedValue({ text: 'hi', provider: 'mock-stt' }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    const tts: TextToSpeechProvider = {
      name: 'mock-tts',
      speak,
      stop: jest.fn().mockResolvedValue(undefined),
    };

    const { initialize, startDetection, addWakeWordListener } =
      await import('../public/voice-activator');

    const codes: string[] = [];
    addWakeWordListener('speechError', (payload) => codes.push(payload.code));

    await initialize({
      sttProvider: stt,
      ttsProvider: tts,
      autoSpeak: true,
      providerTimeoutMs: 50,
    });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    await flushAsync();

    expect(codes).toContain('tts_timeout');

    // And the queue is free for the next wake word.
    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('stopDetection() frees the queue even while an old call is wedged', async () => {
    const transcribe = jest
      .fn<Promise<TranscriptionResult>, []>()
      .mockImplementationOnce(() => neverSettles())
      .mockImplementationOnce(async () => ({
        text: 'after restart',
        provider: 'mock-stt',
      }));

    const stt: SpeechToTextProvider = {
      name: 'mock-stt',
      transcribe,
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    const { initialize, startDetection, stopDetection } =
      await import('../public/voice-activator');

    // No timeout configured: the queue reset alone must be enough.
    await initialize({ sttProvider: stt });
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync();
    expect(transcribe).toHaveBeenCalledTimes(1);

    await stopDetection();
    await startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    expect(transcribe).toHaveBeenCalledTimes(2);
  });
});
