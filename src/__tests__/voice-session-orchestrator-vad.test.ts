/** VAD-driven listening — Silero + native emitter mocked */

let vadPcmHandler: ((e: { pcm: string }) => void) | undefined;

jest.mock('react-native', () => ({
  NativeModules: {
    VoiceActivator: {
      startVADCapture: jest.fn().mockResolvedValue(undefined),
      stopVADCapture: jest.fn().mockResolvedValue(undefined),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn((_ev: string, cb: (e: { pcm: string }) => void) => {
      vadPcmHandler = cb;
      return {
        remove: jest.fn(() => {
          vadPcmHandler = undefined;
        }),
      };
    }),
  })),
  Platform: { OS: 'ios' },
}));

jest.mock('../providers/vad/SileroVADEngine', () => ({
  VAD_NATIVE_PCM_FRAME_EVENT: 'VoiceActivatorOnVADPCMFrame',
  SileroVADEngine: jest.fn().mockImplementation(() => ({
    loadModel: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
}));

// The fork uses named exports (no default) — spread the mock object directly
jest.mock('@dr.pogodin/react-native-fs', () => ({
  __esModule: true,
  CachesDirectoryPath: '/mock/caches',
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import * as sessionEvents from '../internal/session-events';
import { VoiceSessionOrchestrator } from '../runtime/session-orchestrator';
import type {
  SpeechToTextProvider,
  TextToSpeechProvider,
  VoiceSessionEventName,
  VoiceSessionState,
} from '../public/types';

function makePCMBase64(): string {
  const samples = new Float32Array(512);
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
}

async function waitForState(
  orch: VoiceSessionOrchestrator,
  want: VoiceSessionState,
  maxSteps = 300
): Promise<void> {
  for (let s = 0; s < maxSteps; s++) {
    if (orch.state === want) return;
    await flushMicrotasks();
    await jest.advanceTimersByTimeAsync(1);
  }
  throw new Error(`expected state ${want}, still ${orch.state}`);
}

function trackSessionEvents(
  o: VoiceSessionOrchestrator,
  recorded: string[]
): void {
  const names: VoiceSessionEventName[] = [
    'sessionStarted',
    'sessionListening',
    'sessionTranscribed',
    'sessionSpeaking',
    'sessionTurnComplete',
    'sessionEnded',
    'sessionError',
  ];
  for (const n of names) {
    o.addListener(n, () => recorded.push(n));
  }
}

function makeStt(
  transcribeFromWavPath: SpeechToTextProvider['transcribeFromWavPath']
): SpeechToTextProvider {
  return {
    name: 'mock-stt',
    transcribe: jest.fn(),
    cancel: jest.fn().mockResolvedValue(undefined),
    transcribeFromWavPath,
  };
}

function makeTts(): TextToSpeechProvider {
  return {
    name: 'mock-tts',
    speak: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  vadPcmHandler = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('VoiceSessionOrchestrator — VAD listening', () => {
  it('waits for speechEnd + speechPadMs then transcribes from buffered WAV path', async () => {
    const recorded: string[] = [];

    const transcribeFromWavPath = jest.fn().mockResolvedValue({
      text: 'user spoke',
      provider: 'mock',
    });

    const o = new VoiceSessionOrchestrator(
      {
        aiHandler: jest.fn(async () => 'reply'),
        reListenMode: 'manual',
        vad: { speechPadMs: 300 },
      },
      makeStt(transcribeFromWavPath),
      makeTts()
    );
    trackSessionEvents(o, recorded);

    const startP = o.start();
    await flushMicrotasks();

    vadPcmHandler?.({ pcm: makePCMBase64() });
    sessionEvents.emitSessionEvent('speechStart', {});
    vadPcmHandler?.({ pcm: makePCMBase64() });
    sessionEvents.emitSessionEvent('speechEnd', {
      durationMs: 200,
      speechPadMs: 300,
    });

    await jest.advanceTimersByTimeAsync(300);
    await flushMicrotasks();
    await startP;

    expect(transcribeFromWavPath).toHaveBeenCalledTimes(1);
    expect(String(transcribeFromWavPath.mock.calls[0][0])).toMatch(
      /vad-utterance-\d+\.wav$/
    );
    expect(recorded).toEqual([
      'sessionStarted',
      'sessionListening',
      'sessionTranscribed',
      'sessionSpeaking',
      'sessionTurnComplete',
    ]);
  });

  it('clears the session timeout as soon as speechStart fires', async () => {
    const recorded: string[] = [];

    const transcribeFromWavPath = jest.fn().mockResolvedValue({
      text: 'user spoke',
      provider: 'mock',
    });

    const o = new VoiceSessionOrchestrator(
      {
        aiHandler: jest.fn(async () => 'reply'),
        reListenMode: 'manual',
        silenceTimeoutMs: 2000,
        vad: { speechPadMs: 100 },
      },
      makeStt(transcribeFromWavPath),
      makeTts()
    );
    trackSessionEvents(o, recorded);

    const startP = o.start();
    await flushMicrotasks();

    sessionEvents.emitSessionEvent('speechStart', {});
    vadPcmHandler?.({ pcm: makePCMBase64() });

    await jest.advanceTimersByTimeAsync(2500);
    await flushMicrotasks();

    expect(recorded).not.toContain('sessionEnded');
    expect(o.state).toBe('listening');
    expect(transcribeFromWavPath).not.toHaveBeenCalled();

    sessionEvents.emitSessionEvent('speechEnd', {
      durationMs: 200,
      speechPadMs: 100,
    });
    await jest.advanceTimersByTimeAsync(100);
    await flushMicrotasks();

    await o.close();
    await startP;
  });

  it('does not call transcribeFromWavPath before speechEnd', async () => {
    const transcribeFromWavPath = jest.fn().mockResolvedValue({
      text: 'x',
      provider: 'mock',
    });

    const o = new VoiceSessionOrchestrator(
      {
        aiHandler: jest.fn(async () => 'r'),
        reListenMode: 'manual',
        vad: {},
      },
      makeStt(transcribeFromWavPath),
      makeTts()
    );

    const startP = o.start();
    await flushMicrotasks();

    sessionEvents.emitSessionEvent('speechStart', {});
    vadPcmHandler?.({ pcm: makePCMBase64() });
    await jest.advanceTimersByTimeAsync(400);

    expect(transcribeFromWavPath).not.toHaveBeenCalled();

    await o.close();
    await startP;
  });

  it('does not call transcribeFromWavPath if the session closes during WAV handoff', async () => {
    let resolveWriteFile: (() => void) | undefined;
    const writeFilePromise = new Promise<void>((resolve) => {
      resolveWriteFile = resolve;
    });

    const rnfs = jest.requireMock('@dr.pogodin/react-native-fs') as {
      mkdir: jest.Mock;
      writeFile: jest.Mock;
      unlink: jest.Mock;
      CachesDirectoryPath: string;
    };
    rnfs.writeFile.mockReturnValueOnce(writeFilePromise);

    const transcribeFromWavPath = jest.fn().mockResolvedValue({
      text: 'x',
      provider: 'mock',
    });

    const o = new VoiceSessionOrchestrator(
      {
        aiHandler: jest.fn(async () => 'r'),
        reListenMode: 'manual',
        vad: { speechPadMs: 100 },
      },
      makeStt(transcribeFromWavPath),
      makeTts()
    );

    const startP = o.start();
    await flushMicrotasks();

    sessionEvents.emitSessionEvent('speechStart', {});
    vadPcmHandler?.({ pcm: makePCMBase64() });
    sessionEvents.emitSessionEvent('speechEnd', {
      durationMs: 50,
      speechPadMs: 100,
    });

    await jest.advanceTimersByTimeAsync(100);
    await flushMicrotasks();

    await o.close();
    resolveWriteFile?.();
    await writeFilePromise;
    await startP;

    expect(transcribeFromWavPath).not.toHaveBeenCalled();
  });

  it('session silenceTimeoutMs still ends session when no speechEnd', async () => {
    const recorded: string[] = [];

    const transcribeFromWavPath = jest.fn();

    const o = new VoiceSessionOrchestrator(
      {
        aiHandler: jest.fn(async () => 'r'),
        reListenMode: 'manual',
        vad: {},
        silenceTimeoutMs: 2000,
      },
      makeStt(transcribeFromWavPath),
      makeTts()
    );
    trackSessionEvents(o, recorded);

    const startP = o.start();
    await flushMicrotasks();

    await jest.advanceTimersByTimeAsync(2001);
    await flushMicrotasks();
    await startP;

    expect(transcribeFromWavPath).not.toHaveBeenCalled();
    expect(recorded).toContain('sessionEnded');
    expect(o.state).toBe('closed');
  });

  it('emits sessionError when vad is set but STT lacks transcribeFromWavPath', async () => {
    const recorded: string[] = [];

    const stt: SpeechToTextProvider = {
      name: 'no-wav',
      transcribe: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    const o = new VoiceSessionOrchestrator(
      {
        aiHandler: jest.fn(async () => 'r'),
        reListenMode: 'manual',
        vad: {},
      },
      stt,
      makeTts()
    );
    trackSessionEvents(o, recorded);

    await o.start();

    expect(recorded).toContain('sessionError');
    expect(o.state).toBe('idle');
  });

  it('runs multiple auto-mode turns with VAD utterance simulation', async () => {
    const cycles = 10;
    const transcribeFromWavPath = jest
      .fn()
      .mockResolvedValue({ text: 'ok', provider: 'mock' });

    const orch = new VoiceSessionOrchestrator(
      {
        aiHandler: jest.fn(async () => 'ai'),
        reListenMode: 'auto',
        vad: { speechPadMs: 100 },
      },
      makeStt(transcribeFromWavPath),
      makeTts()
    );

    const startP = orch.start();

    for (let i = 0; i < cycles; i++) {
      await waitForState(orch, 'listening');
      sessionEvents.emitSessionEvent('speechStart', {});
      vadPcmHandler?.({ pcm: makePCMBase64() });
      sessionEvents.emitSessionEvent('speechEnd', {
        durationMs: 50,
        speechPadMs: 100,
      });
      await jest.advanceTimersByTimeAsync(100);
      await flushMicrotasks();
    }

    await orch.close();
    await startP;

    expect(transcribeFromWavPath).toHaveBeenCalledTimes(cycles);
    expect(orch.state).toBe('closed');
  });
});
