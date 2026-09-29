jest.mock('../internal/session-events', () => ({
  addSessionListener: jest.fn(() => ({ remove: jest.fn() })),
  emitSessionEvent: jest.fn(),
}));

import { VoiceSessionOrchestrator } from '../runtime/session-orchestrator';
import { emitSessionEvent } from '../internal/session-events';
import type {
  SpeechToTextProvider,
  TextToSpeechProvider,
  TranscriptionResult,
  VoiceSessionConfig,
} from '../public/types';

const mockEmit = emitSessionEvent as jest.Mock;

function makeTranscription(text: string): TranscriptionResult {
  return { text, provider: 'mock-stt' };
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
    ...overrides,
  };
}

function makeOrchestrator(
  configOverrides?: Partial<VoiceSessionConfig>,
  sttOverrides?: Partial<SpeechToTextProvider>,
  ttsOverrides?: Partial<TextToSpeechProvider>
) {
  return new VoiceSessionOrchestrator(
    makeConfig(configOverrides),
    makeStt(sttOverrides),
    makeTts(ttsOverrides)
  );
}

function emittedEvents() {
  return mockEmit.mock.calls.map(([name]: [string]) => name);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── State ────────────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts in idle state', () => {
    const o = makeOrchestrator();
    expect(o.state).toBe('idle');
  });
});

// ─── Manual mode — single turn ─────────────────────────────────────────────

describe('manual mode — full single turn', () => {
  it('emits events in the correct order and ends in idle', async () => {
    const o = makeOrchestrator({ reListenMode: 'manual' });
    await o.start();

    expect(emittedEvents()).toEqual([
      'sessionStarted',
      'sessionListening',
      'sessionTranscribed',
      'sessionSpeaking',
      'sessionTurnComplete',
    ]);
    expect(o.state).toBe('idle');
  });

  it('emits sessionTranscribed with the transcription text', async () => {
    const stt = makeStt({
      transcribe: jest.fn(async () => makeTranscription('test input')),
    });
    const o = new VoiceSessionOrchestrator(makeConfig(), stt, makeTts());
    await o.start();

    const transcribedCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionTranscribed'
    );
    expect(transcribedCall?.[1]).toEqual({ text: 'test input' });
  });

  it('passes transcription text to AI handler', async () => {
    const aiHandler = jest.fn(async () => 'response');
    const stt = makeStt({
      transcribe: jest.fn(async () => makeTranscription('user said')),
    });
    const o = new VoiceSessionOrchestrator(
      makeConfig({ aiHandler }),
      stt,
      makeTts()
    );
    await o.start();

    expect(aiHandler).toHaveBeenCalledWith('user said');
  });

  it('emits sessionSpeaking with AI response text', async () => {
    const o = makeOrchestrator({
      aiHandler: jest.fn(async () => 'the answer'),
    });
    await o.start();

    const speakingCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionSpeaking'
    );
    expect(speakingCall?.[1]).toEqual({ text: 'the answer' });
  });

  it('emits sessionTurnComplete with turn=1 after first turn', async () => {
    const o = makeOrchestrator({ reListenMode: 'manual' });
    await o.start();

    const turnCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionTurnComplete'
    );
    expect(turnCall?.[1]).toEqual({ turn: 1 });
  });

  it('does NOT auto-loop in manual mode', async () => {
    const stt = makeStt();
    const o = new VoiceSessionOrchestrator(
      makeConfig({ reListenMode: 'manual' }),
      stt,
      makeTts()
    );
    await o.start();
    expect((stt.transcribe as jest.Mock).mock.calls.length).toBe(1);
  });
});

// ─── Manual mode — session.listen() ───────────────────────────────────────

describe('manual mode — session.listen()', () => {
  it('starts a new turn from idle state', async () => {
    const o = makeOrchestrator({ reListenMode: 'manual' });
    await o.start(); // first turn — ends in idle
    jest.clearAllMocks();
    await o.listen(); // second turn

    expect(emittedEvents()).toContain('sessionListening');
    expect(emittedEvents()).toContain('sessionTranscribed');
  });

  it('increments turn count across multiple listen() calls', async () => {
    const o = makeOrchestrator({ reListenMode: 'manual' });
    await o.start();
    await o.listen();

    const turnCalls = mockEmit.mock.calls.filter(
      ([name]: [string]) => name === 'sessionTurnComplete'
    );
    expect(turnCalls[0]?.[1]).toEqual({ turn: 1 });
    expect(turnCalls[1]?.[1]).toEqual({ turn: 2 });
  });

  it('is a no-op when state is not idle', async () => {
    // listen() while the session is in 'listening' state (mid-turn) should be a no-op.
    // We verify this by calling listen() inside the transcribe mock — state will be
    // 'listening' at that point so the inner listen() must be ignored.
    let secondListenStarted = false;
    let orch: VoiceSessionOrchestrator;
    const slowStt = makeStt({
      transcribe: jest.fn(async () => {
        // During transcription, call listen() — should be no-op (state === 'listening')
        await orch.listen();
        secondListenStarted = true;
        return makeTranscription('hello');
      }),
    });
    orch = new VoiceSessionOrchestrator(
      makeConfig({ reListenMode: 'manual' }),
      slowStt,
      makeTts()
    );
    await orch.start();
    expect(secondListenStarted).toBe(true);
    // Only one transcription call (from start), not two
    expect((slowStt.transcribe as jest.Mock).mock.calls.length).toBe(1);
  });
});

// ─── Auto mode ────────────────────────────────────────────────────────────────

describe('auto mode', () => {
  it('re-listens automatically after each turn', async () => {
    let callCount = 0;
    let orch: VoiceSessionOrchestrator;
    const stt = makeStt({
      transcribe: jest.fn(async () => {
        callCount++;
        if (callCount >= 2) {
          // Close the session after 2 transcriptions to stop the loop
          await orch.close();
        }
        return makeTranscription('hello');
      }),
    });
    const tts = makeTts();
    orch = new VoiceSessionOrchestrator(
      makeConfig({ reListenMode: 'auto' }),
      stt,
      tts
    );
    await orch.start();

    // Should have transcribed twice before close stopped the loop
    expect(
      (stt.transcribe as jest.Mock).mock.calls.length
    ).toBeGreaterThanOrEqual(2);
    expect(orch.state).toBe('closed');
  });
});

// ─── close() ──────────────────────────────────────────────────────────────────

describe('close()', () => {
  it('emits sessionEnded with reason: explicit', async () => {
    const o = makeOrchestrator();
    await o.close();

    const endedCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionEnded'
    );
    expect(endedCall?.[1]).toEqual({ reason: 'explicit' });
  });

  it('sets state to closed', async () => {
    const o = makeOrchestrator();
    await o.close();
    expect(o.state).toBe('closed');
  });

  it('is idempotent — second call is no-op', async () => {
    const o = makeOrchestrator();
    await o.close();
    await o.close();

    const endedCalls = mockEmit.mock.calls.filter(
      ([name]: [string]) => name === 'sessionEnded'
    );
    expect(endedCalls.length).toBe(1);
  });

  it('cancels STT when closed mid-transcription', async () => {
    let orch: VoiceSessionOrchestrator;
    const stt = makeStt({
      transcribe: jest.fn(async () => {
        await orch.close();
        return makeTranscription('hello');
      }),
    });
    const tts = makeTts();
    orch = new VoiceSessionOrchestrator(makeConfig(), stt, tts);
    await orch.start();

    expect((stt.cancel as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(
      1
    );
  });

  it('stops TTS when closed during speech playback', async () => {
    let orch: VoiceSessionOrchestrator;
    const tts = makeTts({
      speak: jest.fn(async () => {
        await orch.close();
      }),
    });
    orch = new VoiceSessionOrchestrator(makeConfig(), makeStt(), tts);
    await orch.start();

    expect((tts.stop as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not emit further events after close during a turn', async () => {
    let closed = false;
    let orch: VoiceSessionOrchestrator;
    const stt = makeStt({
      transcribe: jest.fn(async () => {
        if (!closed) {
          closed = true;
          await orch.close();
        }
        return makeTranscription('hello');
      }),
    });
    orch = new VoiceSessionOrchestrator(makeConfig(), stt, makeTts());
    await orch.start();

    const eventsAfterClose = mockEmit.mock.calls
      .map(([name]: [string]) => name)
      .filter(
        (name: string) =>
          name !== 'sessionStarted' &&
          name !== 'sessionListening' &&
          name !== 'sessionEnded'
      );
    // No transcribed/speaking/turnComplete should have been emitted
    expect(eventsAfterClose).toHaveLength(0);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('STT error', () => {
  it('emits sessionError and returns to idle', async () => {
    const stt = makeStt({
      transcribe: jest.fn(async () => {
        throw new Error('mic failed');
      }),
    });
    const o = new VoiceSessionOrchestrator(makeConfig(), stt, makeTts());
    await o.start();

    const errorCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionError'
    );
    expect(errorCall?.[1]).toMatchObject({
      code: 'stt_failed',
      message: 'mic failed',
      recoverable: true,
    });
    expect(o.state).toBe('idle');
  });
});

describe('AI handler error', () => {
  it('emits sessionError and returns to idle', async () => {
    const o = makeOrchestrator({
      aiHandler: jest.fn(async () => {
        throw new Error('llm down');
      }),
    });
    await o.start();

    const errorCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionError'
    );
    expect(errorCall?.[1]).toMatchObject({
      code: 'ai_handler_failed',
      message: 'llm down',
      recoverable: true,
    });
    expect(o.state).toBe('idle');
  });
});

describe('TTS error', () => {
  it('emits sessionError and returns to idle', async () => {
    const tts = makeTts({
      speak: jest.fn(async () => {
        throw new Error('audio session broken');
      }),
    });
    const o = new VoiceSessionOrchestrator(makeConfig(), makeStt(), tts);
    await o.start();

    const errorCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionError'
    );
    expect(errorCall?.[1]).toMatchObject({
      code: 'tts_failed',
      message: 'audio session broken',
      recoverable: true,
    });
    expect(o.state).toBe('idle');
  });
});

// ─── addListener ──────────────────────────────────────────────────────────────

describe('addListener', () => {
  it('returns a subscription with remove()', () => {
    const o = makeOrchestrator();
    const sub = o.addListener('sessionStarted', jest.fn());
    expect(typeof sub.remove).toBe('function');
  });

  it('is instance-scoped — listeners added to one session do not fire for others', async () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    const o1 = makeOrchestrator({ reListenMode: 'manual' });
    const o2 = makeOrchestrator({ reListenMode: 'manual' });

    o1.addListener('sessionStarted', listener1);
    o2.addListener('sessionStarted', listener2);

    await o1.start();

    // listener1 should have fired (it's on o1 which started)
    expect(listener1).toHaveBeenCalledTimes(1);
    // listener2 should NOT have fired (it's on o2 which has not started)
    expect(listener2).not.toHaveBeenCalled();
  });
});

// ─── listen() on closed session ───────────────────────────────────────────────

describe('listen() on closed session', () => {
  it('is a no-op and emits nothing when session is closed', async () => {
    const o = makeOrchestrator();
    await o.close();
    jest.clearAllMocks();
    await o.listen();

    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ─── bargeIn() ────────────────────────────────────────────────────────────────

describe('bargeIn()', () => {
  it('during speaking — stops TTS and starts a new turn', async () => {
    let orch: VoiceSessionOrchestrator;
    let speakCallCount = 0;
    const tts = makeTts({
      speak: jest.fn(async () => {
        speakCallCount++;
        if (speakCallCount === 1) {
          // Simulate: wake word fires during TTS playback
          await orch.bargeIn();
          // speak() returns here, simulating the TTS stop() having resolved the promise
        }
      }),
      stop: jest.fn(async () => undefined),
    });
    orch = new VoiceSessionOrchestrator(
      makeConfig({ reListenMode: 'manual' }),
      makeStt(),
      tts
    );
    await orch.start();

    expect(speakCallCount).toBe(2);
    expect(tts.stop as jest.Mock).toHaveBeenCalledTimes(1);
    expect(orch.state).toBe('idle'); // manual mode ends at idle after second turn
  });

  it('during waiting — discards AI response and starts a new turn', async () => {
    let orch: VoiceSessionOrchestrator;
    let aiCallCount = 0;
    const tts = makeTts();
    const aiHandler = jest.fn(async (_text: string) => {
      aiCallCount++;
      if (aiCallCount === 1) {
        // Simulate: wake word fires while AI is processing
        await orch.bargeIn();
      }
      return 'ai response';
    });
    orch = new VoiceSessionOrchestrator(
      makeConfig({ aiHandler, reListenMode: 'manual' }),
      makeStt(),
      tts
    );
    await orch.start();

    expect(aiCallCount).toBe(2);
    // TTS called only ONCE (second turn) — first AI response was discarded
    expect(tts.speak as jest.Mock).toHaveBeenCalledTimes(1);
    expect(orch.state).toBe('idle');
  });

  it('during listening — abandons the utterance and restarts the turn', async () => {
    let orch: VoiceSessionOrchestrator;
    let attempt = 0;

    const stt = makeStt({
      transcribe: jest.fn(async () => {
        attempt += 1;
        if (attempt === 1) {
          // Wake word fires mid-utterance. The half-spoken phrase must be
          // abandoned, not transcribed and sent to the AI handler.
          await orch.bargeIn();
          return makeTranscription('interrupted half-sentence');
        }
        return makeTranscription('the real request');
      }),
    });
    const tts = makeTts();
    const aiHandler = jest.fn(async () => 'answer');

    orch = new VoiceSessionOrchestrator(
      makeConfig({ reListenMode: 'manual', aiHandler }),
      stt,
      tts
    );
    await orch.start();

    // Listened twice: the interrupted turn plus the restarted one.
    expect(stt.transcribe as jest.Mock).toHaveBeenCalledTimes(2);
    // The abandoned utterance never reached the AI handler.
    expect(aiHandler).toHaveBeenCalledTimes(1);
    expect(aiHandler).toHaveBeenCalledWith('the real request');
    expect(tts.speak as jest.Mock).toHaveBeenCalledTimes(1);
    expect(orch.state).toBe('idle');
  });

  it('during listening — cancels the STT provider so it stops capturing', async () => {
    let orch: VoiceSessionOrchestrator;
    let attempt = 0;
    const cancel = jest.fn(async () => undefined);

    const stt = makeStt({
      cancel,
      transcribe: jest.fn(async () => {
        attempt += 1;
        if (attempt === 1) {
          await orch.bargeIn();
          return makeTranscription('abandoned');
        }
        return makeTranscription('kept');
      }),
    });

    orch = new VoiceSessionOrchestrator(
      makeConfig({ reListenMode: 'manual' }),
      stt,
      makeTts()
    );
    await orch.start();

    expect(cancel).toHaveBeenCalled();
  });

  it('on a closed session — is a no-op', async () => {
    const o = makeOrchestrator();
    await o.close();
    jest.clearAllMocks();
    await o.bargeIn();

    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ─── silenceTimeoutMs ─────────────────────────────────────────────────────────

describe('silenceTimeoutMs', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires sessionEnded with reason: timeout when silence timeout expires during listening', async () => {
    const TIMEOUT_MS = 3000;
    let resolveStt!: () => void;
    const stt = makeStt({
      transcribe: jest.fn(
        () =>
          new Promise<TranscriptionResult>((resolve) => {
            resolveStt = () => resolve(makeTranscription('cancelled'));
          })
      ),
      cancel: jest.fn(async () => {
        resolveStt?.();
      }),
    });
    const o = new VoiceSessionOrchestrator(
      makeConfig({ silenceTimeoutMs: TIMEOUT_MS }),
      stt,
      makeTts()
    );

    const startPromise = o.start();
    jest.advanceTimersByTime(TIMEOUT_MS + 1);
    await startPromise;

    const endedCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionEnded'
    );
    expect(endedCall?.[1]).toEqual({ reason: 'timeout' });
    expect(o.state).toBe('closed');
    expect(stt.cancel as jest.Mock).toHaveBeenCalled();
  });

  it('clears timeout when transcription completes before timeout fires', async () => {
    // Uses default fast-resolving STT — timeout should never fire
    const o = makeOrchestrator({ silenceTimeoutMs: 5000 });
    // start() resolves immediately (STT resolves synchronously in test)
    await o.start();

    // Advance well past the timeout — should be a no-op
    jest.advanceTimersByTime(10000);

    // Session should be idle (manual mode), not closed by timeout
    expect(o.state).toBe('idle');
    const endedCalls = mockEmit.mock.calls.filter(
      ([name]: [string]) => name === 'sessionEnded'
    );
    expect(endedCalls.length).toBe(0);
  });

  it('clears timeout when close() is called before it fires', async () => {
    const TIMEOUT_MS = 5000;
    let resolveStt!: () => void;
    const stt = makeStt({
      transcribe: jest.fn(
        () =>
          new Promise<TranscriptionResult>((resolve) => {
            resolveStt = () => resolve(makeTranscription('cancelled'));
          })
      ),
      cancel: jest.fn(async () => {
        resolveStt?.();
      }),
    });
    const o = new VoiceSessionOrchestrator(
      makeConfig({ silenceTimeoutMs: TIMEOUT_MS }),
      stt,
      makeTts()
    );

    const startPromise = o.start();
    await o.close(); // close before timeout fires
    jest.advanceTimersByTime(TIMEOUT_MS + 1); // advance past timeout — should be no-op
    await startPromise;

    const endedCalls = mockEmit.mock.calls.filter(
      ([name]: [string]) => name === 'sessionEnded'
    );
    // Only ONE sessionEnded (from close()), not a second from the timer
    expect(endedCalls.length).toBe(1);
    expect(endedCalls[0]?.[1]).toEqual({ reason: 'explicit' });
  });

  it('clears timeout when bargeIn() is called during speaking state', async () => {
    // Start a session, get to speaking state, then barge in before timeout fires
    const TIMEOUT_MS = 5000;
    let orch: VoiceSessionOrchestrator;
    let speakCallCount = 0;
    const tts = makeTts({
      speak: jest.fn(async () => {
        speakCallCount++;
        if (speakCallCount === 1) {
          await orch.bargeIn();
        }
      }),
      stop: jest.fn(async () => undefined),
    });
    orch = new VoiceSessionOrchestrator(
      makeConfig({ reListenMode: 'manual', silenceTimeoutMs: TIMEOUT_MS }),
      makeStt(),
      tts
    );
    await orch.start();

    // Advance past timeout — barge-in should have cleared the timer for the second turn
    jest.advanceTimersByTime(TIMEOUT_MS + 1);

    expect(speakCallCount).toBe(2); // Two turns completed
    expect(orch.state).toBe('idle'); // Still alive, not timed out
    const endedCalls = mockEmit.mock.calls.filter(
      ([name]: [string]) => name === 'sessionEnded'
    );
    expect(endedCalls.length).toBe(0);
  });
});

// ─── maxTurns ─────────────────────────────────────────────────────────────────

describe('maxTurns', () => {
  it('closes session after exactly 1 turn with maxTurns: 1', async () => {
    const o = makeOrchestrator({ maxTurns: 1, reListenMode: 'manual' });
    await o.start();

    const endedCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionEnded'
    );
    expect(endedCall?.[1]).toEqual({ reason: 'explicit' });
    expect(o.state).toBe('closed');

    const turnCalls = mockEmit.mock.calls.filter(
      ([name]: [string]) => name === 'sessionTurnComplete'
    );
    expect(turnCalls.length).toBe(1);
  });

  it('closes session after exactly 3 turns with maxTurns: 3 in auto mode', async () => {
    const o = makeOrchestrator({ maxTurns: 3, reListenMode: 'auto' });
    await o.start();

    expect(o.state).toBe('closed');

    const turnCalls = mockEmit.mock.calls.filter(
      ([name]: [string]) => name === 'sessionTurnComplete'
    );
    expect(turnCalls.length).toBe(3);
    expect(turnCalls[2]?.[1]).toEqual({ turn: 3 });

    const endedCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionEnded'
    );
    expect(endedCall?.[1]).toEqual({ reason: 'explicit' });
  });

  it('does not close session prematurely when maxTurns is not set', async () => {
    let callCount = 0;
    let orch: VoiceSessionOrchestrator;
    const stt = makeStt({
      transcribe: jest.fn(async () => {
        callCount++;
        if (callCount >= 5) {
          await orch.close();
        }
        return makeTranscription('hello');
      }),
    });
    orch = new VoiceSessionOrchestrator(
      makeConfig({ reListenMode: 'auto' }),
      stt,
      makeTts()
    );
    await orch.start();

    // Session ran 5 turns and was explicitly closed — no premature maxTurns close
    const endedCall = mockEmit.mock.calls.find(
      ([name]: [string]) => name === 'sessionEnded'
    );
    expect(endedCall?.[1]).toEqual({ reason: 'explicit' });
    expect(callCount).toBeGreaterThanOrEqual(5);
  });
});

// ─── 10+ turn memory validation ───────────────────────────────────────────────

describe('10+ turn memory validation (auto mode)', () => {
  it('runs 10 turns cleanly without state corruption', async () => {
    let callCount = 0;
    let orch: VoiceSessionOrchestrator;
    const stt = makeStt({
      transcribe: jest.fn(async () => {
        callCount++;
        if (callCount >= 10) {
          await orch.close();
        }
        return makeTranscription('hello');
      }),
    });
    const tts = makeTts();
    orch = new VoiceSessionOrchestrator(
      makeConfig({ reListenMode: 'auto' }),
      stt,
      tts
    );
    await orch.start();

    expect(callCount).toBeGreaterThanOrEqual(10);
    expect(orch.state).toBe('closed');

    // Verify turn count is consistent — 10 transcriptions but the 10th closes
    // the session during transcription (before AI/TTS), so exactly 9 full turns complete.
    const turnCalls = mockEmit.mock.calls.filter(
      ([name]: [string]) => name === 'sessionTurnComplete'
    );
    expect(turnCalls.length).toBeGreaterThanOrEqual(9);
  });
});
