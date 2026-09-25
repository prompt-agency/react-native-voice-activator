/**
 * session-turn-timeouts.test.ts
 *
 * The managed session turn loop awaits three calls it does not control:
 * sttProvider.transcribe(), config.aiHandler() and ttsProvider.speak(). All
 * three were unbounded.
 *
 * silenceTimeoutMs does not cover them: it only arms during the listening stage
 * and is cleared as soon as STT resolves, so it guards a user who never speaks,
 * not a provider or handler that never returns. A hang therefore stranded the
 * turn in its stage with no recovery path other than an external close().
 *
 * The providerTimeoutMs bound added for the single-shot path did not apply here,
 * because the orchestrator never used it.
 */

jest.mock('../internal/session-events', () => ({
  addSessionListener: jest.fn(() => ({ remove: jest.fn() })),
  emitSessionEvent: jest.fn(),
}));

import { VoiceSessionOrchestrator } from '../runtime/session-orchestrator';
import type {
  SpeechToTextProvider,
  TextToSpeechProvider,
  TranscriptionResult,
  VoiceSessionConfig,
} from '../public/types';

function makeTranscription(text: string): TranscriptionResult {
  return { text, provider: 'mock-stt' };
}

function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function makeStt(
  overrides?: Partial<SpeechToTextProvider>
): SpeechToTextProvider {
  return {
    name: 'mock-stt',
    transcribe: jest.fn(async () => makeTranscription('hello')),
    cancel: jest.fn(async () => undefined),
    ...overrides,
  };
}

function makeTts(
  overrides?: Partial<TextToSpeechProvider>
): TextToSpeechProvider {
  return {
    name: 'mock-tts',
    speak: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    ...overrides,
  };
}

function makeConfig(
  overrides?: Partial<VoiceSessionConfig>
): VoiceSessionConfig {
  return {
    aiHandler: jest.fn(async () => 'world'),
    reListenMode: 'manual',
    providerTimeoutMs: 50,
    aiHandlerTimeoutMs: 50,
    ...overrides,
  };
}

describe('session turn timeouts', () => {
  it('does not hang forever when transcribe() never settles', async () => {
    const errors: Array<{ code: string }> = [];
    const orch = new VoiceSessionOrchestrator(
      makeConfig(),
      makeStt({ transcribe: jest.fn(() => neverSettles()) }),
      makeTts()
    );
    orch.addListener('sessionError', (e) => errors.push(e));

    await orch.start();

    expect(errors.map((e) => e.code)).toContain('stt_timeout');
    expect(orch.state).not.toBe('listening');
  });

  it('does not hang forever when the AI handler never settles', async () => {
    const errors: Array<{ code: string }> = [];
    const orch = new VoiceSessionOrchestrator(
      makeConfig({ aiHandler: jest.fn(() => neverSettles<string>()) }),
      makeStt(),
      makeTts()
    );
    orch.addListener('sessionError', (e) => errors.push(e));

    await orch.start();

    expect(errors.map((e) => e.code)).toContain('ai_handler_timeout');
    expect(orch.state).not.toBe('waiting');
  });

  it('does not hang forever when speak() never settles', async () => {
    const errors: Array<{ code: string }> = [];
    const orch = new VoiceSessionOrchestrator(
      makeConfig(),
      makeStt(),
      makeTts({ speak: jest.fn(() => neverSettles()) })
    );
    orch.addListener('sessionError', (e) => errors.push(e));

    await orch.start();

    expect(errors.map((e) => e.code)).toContain('tts_timeout');
    expect(orch.state).not.toBe('speaking');
  });

  it('does not bound a provider when the timeout is disabled', async () => {
    const transcribe = jest.fn(async () => makeTranscription('fine'));
    const orch = new VoiceSessionOrchestrator(
      makeConfig({ providerTimeoutMs: 0, aiHandlerTimeoutMs: 0 }),
      makeStt({ transcribe }),
      makeTts()
    );

    await orch.start();

    // A well-behaved provider is unaffected by the bound being off.
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(orch.state).toBe('idle');
  });

  it('leaves a normal turn untouched', async () => {
    const aiHandler = jest.fn(async () => 'answer');
    const tts = makeTts();
    const orch = new VoiceSessionOrchestrator(
      makeConfig({ aiHandler }),
      makeStt(),
      tts
    );

    await orch.start();

    expect(aiHandler).toHaveBeenCalledWith('hello');
    expect(tts.speak as jest.Mock).toHaveBeenCalledWith('answer');
    expect(orch.state).toBe('idle');
  });
});
