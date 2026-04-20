/**
 * Integration tests for the speaker verification gate wired into voice-activator.ts.
 *
 * Covers:
 *   - Concurrent verification (session starts before verification completes)
 *   - verificationFailureBehavior: 'closed', 'open', 'emit'
 *   - Generation-ID guard (two wake words 60ms apart)
 *   - Enrollment API delegation and error on null provider
 *   - Anti-spoofing running concurrently via Promise.all
 *   - audioPreprocessingProvider passed as 4th constructor param
 *   - Default threshold and failure behavior values
 */

// ─── Types ────────────────────────────────────────────────────────────────────

import type {
  AntiSpoofingProvider,
  AudioPreprocessingProvider,
  EnrollmentData,
  SpeakerVerificationProvider,
  WakeWordDetectedEvent,
} from '../public/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function flushAsync(passes = 10) {
  for (let i = 0; i < passes; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function makeWakeWordPayload(phrase = 'hey'): WakeWordDetectedEvent {
  return { detectedPhrase: phrase, detectedAt: '2026-01-01T00:00:00.000Z' };
}

function makeEnrollmentData(): EnrollmentData {
  return { version: 1, speakers: {} };
}

function makeSpeakerVerificationProvider(
  overrides?: Partial<SpeakerVerificationProvider>
): SpeakerVerificationProvider {
  return {
    enrollSpeaker: jest.fn().mockResolvedValue(undefined),
    verifySpeaker: jest.fn().mockResolvedValue({ matched: true, score: 0.9 }),
    identifySpeaker: jest
      .fn()
      .mockResolvedValue({ name: 'alice', score: 0.9 }),
    exportEnrollment: jest.fn().mockResolvedValue(makeEnrollmentData()),
    importEnrollment: jest.fn().mockResolvedValue(undefined),
    clearEnrollment: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAntiSpoofingProvider(score = 0.1): AntiSpoofingProvider {
  return {
    detectSpoofing: jest.fn().mockResolvedValue(score),
  };
}

function makeAudioPreprocessingProvider(): AudioPreprocessingProvider {
  return {
    process: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('speaker verification gate', () => {
  let capturedWakeWordHandler:
    | ((payload: WakeWordDetectedEvent) => void)
    | null = null;

  let mockEmitSessionEvent: jest.Mock;
  let mockAddSessionListener: jest.Mock;

  // Orchestrator mock factory — we need to intercept constructor + abort
  let mockOrchestratorInstances: Array<{
    start: jest.Mock;
    abort: jest.Mock;
    close: jest.Mock;
    bargeIn: jest.Mock;
    state: string;
  }>;

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
    mockOrchestratorInstances = [];
    mockEmitSessionEvent = jest.fn();
    mockAddSessionListener = jest.fn(() => ({ remove: jest.fn() }));

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
      addSessionListener: mockAddSessionListener,
      emitSessionEvent: mockEmitSessionEvent,
    }));

    // Mock VoiceSessionOrchestrator so we can control start/abort/state
    jest.doMock('../runtime/session-orchestrator', () => {
      return {
        VoiceSessionOrchestrator: jest.fn().mockImplementation(() => {
          const instance = {
            start: jest.fn().mockResolvedValue(undefined),
            abort: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined),
            bargeIn: jest.fn().mockResolvedValue(undefined),
            state: 'idle' as string,
          };
          mockOrchestratorInstances.push(instance);
          return instance;
        }),
      };
    });

    return runtimeBridge;
  }

  beforeEach(() => {
    jest.resetModules();
    setupMocks();
  });

  // ─── Helper to get fresh module and set up audio buffer ──────────────────

  async function initializeWithSession(options: {
    speakerVerificationProvider?: SpeakerVerificationProvider;
    antiSpoofingProvider?: AntiSpoofingProvider;
    audioPreprocessingProvider?: AudioPreprocessingProvider;
    verificationThreshold?: number;
    verificationFailureBehavior?: 'open' | 'closed' | 'emit';
  } = {}) {
    const mod = await import('../public/voice-activator');

    const stt = {
      name: 'mock-stt',
      transcribe: jest.fn().mockResolvedValue({ text: 'hi', provider: 'mock-stt' }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    const tts = {
      name: 'mock-tts',
      speak: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    };

    await mod.initialize({
      sttProvider: stt,
      ttsProvider: tts,
      session: {
        aiHandler: jest.fn().mockResolvedValue('response'),
        reListenMode: 'manual',
      },
      ...options,
    });
    await mod.startDetection();

    return mod;
  }

  // ─── Test 1: sessionStarted emits BEFORE verification result ─────────────

  it('T1: sessionStarted emits before verification completes (concurrent start)', async () => {
    let resolveVerification!: (v: { name: string | null; score: number }) => void;
    const pendingVerification = new Promise<{ name: string | null; score: number }>(
      (resolve) => { resolveVerification = resolve; }
    );

    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockReturnValue(pendingVerification),
    });

    const mod = await initializeWithSession({ speakerVerificationProvider: verificationProvider });

    // Set a verification audio buffer so the gate runs
    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(3);

    // orchestrator.start() should have been called (sessionStarted fires inside start())
    expect(mockOrchestratorInstances).toHaveLength(1);
    expect(mockOrchestratorInstances[0]!.start).toHaveBeenCalledTimes(1);

    // Verification should have been initiated but not completed yet
    expect(verificationProvider.identifySpeaker).toHaveBeenCalledTimes(1);

    // Now resolve the verification
    resolveVerification({ name: 'alice', score: 0.9 });
    await flushAsync(5);
  });

  // ─── Test 2: speakerVerificationPassed fires when identified ─────────────

  it('T2: speakerVerificationPassed fires with score and speakerId when verification passes', async () => {
    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockResolvedValue({ name: 'alice', score: 0.92 }),
    });

    const mod = await initializeWithSession({ speakerVerificationProvider: verificationProvider });

    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    expect(mockEmitSessionEvent).toHaveBeenCalledWith('speakerVerificationPassed', {
      score: 0.92,
      speakerId: 'alice',
    });
  });

  // ─── Test 3: 'closed' behavior aborts orchestrator, no sessionEnded ──────

  it('T3: verificationFailureBehavior=closed calls orchestrator.abort() and emits speakerVerificationFailed, not sessionEnded', async () => {
    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockResolvedValue({ name: null, score: 0.3 }),
    });

    const mod = await initializeWithSession({
      speakerVerificationProvider: verificationProvider,
      verificationFailureBehavior: 'closed',
    });

    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    expect(mockEmitSessionEvent).toHaveBeenCalledWith('speakerVerificationFailed', { score: 0.3 });
    expect(mockOrchestratorInstances[0]!.abort).toHaveBeenCalledTimes(1);
    // sessionEnded must NOT be emitted
    const sessionEndedCalls = mockEmitSessionEvent.mock.calls.filter(
      ([eventName]: [string]) => eventName === 'sessionEnded'
    );
    expect(sessionEndedCalls).toHaveLength(0);
  });

  // ─── Test 4: 'open' behavior keeps session, fires failed event ───────────

  it('T4: verificationFailureBehavior=open continues session when verification fails', async () => {
    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockResolvedValue({ name: null, score: 0.2 }),
    });

    const mod = await initializeWithSession({
      speakerVerificationProvider: verificationProvider,
      verificationFailureBehavior: 'open',
    });

    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    expect(mockEmitSessionEvent).toHaveBeenCalledWith('speakerVerificationFailed', { score: 0.2 });
    expect(mockOrchestratorInstances[0]!.abort).not.toHaveBeenCalled();
  });

  // ─── Test 5: 'emit' behavior fires event, app decides ────────────────────

  it('T5: verificationFailureBehavior=emit fires speakerVerificationFailed without aborting orchestrator', async () => {
    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockResolvedValue({ name: null, score: 0.1 }),
    });

    const mod = await initializeWithSession({
      speakerVerificationProvider: verificationProvider,
      verificationFailureBehavior: 'emit',
    });

    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    expect(mockEmitSessionEvent).toHaveBeenCalledWith('speakerVerificationFailed', { score: 0.1 });
    expect(mockOrchestratorInstances[0]!.abort).not.toHaveBeenCalled();
  });

  // ─── Test 6: Default threshold is 0.55, default failure behavior is 'closed' ──

  it('T6: verificationThreshold defaults to 0.55, verificationFailureBehavior defaults to closed', async () => {
    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockResolvedValue({ name: null, score: 0.5 }),
    });

    const mod = await initializeWithSession({
      speakerVerificationProvider: verificationProvider,
      // No explicit threshold or behavior — should use defaults
    });

    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    // identifySpeaker should have been called with threshold 0.55
    expect(verificationProvider.identifySpeaker).toHaveBeenCalledWith(
      dummyBuffer,
      16000,
      0.55
    );
    // Default 'closed' behavior: abort is called on failure
    expect(mockOrchestratorInstances[0]!.abort).toHaveBeenCalledTimes(1);
  });

  // ─── Test 7: Generation-ID guard discards stale verification ─────────────

  it('T7: Two wake words 60ms apart — first verification callback is discarded by generation-ID guard', async () => {
    let resolveFirst!: (v: { name: string | null; score: number }) => void;
    const firstVerification = new Promise<{ name: string | null; score: number }>(
      (resolve) => { resolveFirst = resolve; }
    );

    let callCount = 0;
    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return firstVerification;
        return Promise.resolve({ name: 'alice', score: 0.9 });
      }),
    });

    const mod = await initializeWithSession({
      speakerVerificationProvider: verificationProvider,
      verificationFailureBehavior: 'closed',
    });

    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    // First wake word — verification pending
    capturedWakeWordHandler!(makeWakeWordPayload('hey'));
    await flushAsync(2);

    // Second wake word fires — increments providerOrchestrationGeneration
    capturedWakeWordHandler!(makeWakeWordPayload('hey'));
    await flushAsync(2);

    // Now resolve first verification after generation has moved on
    resolveFirst({ name: null, score: 0.1 });
    await flushAsync(10);

    // The first verification result should be discarded — abort should NOT have been called
    // (because the generation guard bails out before abort on the stale callback)
    // The second verification passed (alice), so no abort on second either
    expect(mockOrchestratorInstances[0]!.abort).not.toHaveBeenCalled();
  });

  // ─── Test 8: No verification provider → session proceeds without verification ──

  it('T8: When speakerVerificationProvider is not set, session proceeds normally with no verification', async () => {
    const mod = await initializeWithSession({
      // no speakerVerificationProvider
    });

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    // Orchestrator was created and started
    expect(mockOrchestratorInstances).toHaveLength(1);
    expect(mockOrchestratorInstances[0]!.start).toHaveBeenCalledTimes(1);
    // No verification events
    const verificationCalls = mockEmitSessionEvent.mock.calls.filter(
      ([eventName]: [string]) =>
        eventName === 'speakerVerificationPassed' ||
        eventName === 'speakerVerificationFailed'
    );
    expect(verificationCalls).toHaveLength(0);
  });

  // ─── Test 9: Anti-spoofing runs concurrently via Promise.all ─────────────

  it('T9: Anti-spoofing runs concurrently with verification and rejects if spoof score > threshold', async () => {
    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockResolvedValue({ name: 'alice', score: 0.9 }),
    });

    // Spoof score 0.8 > default spoofingThreshold 0.5 — should fail
    const antiSpoofingProvider = makeAntiSpoofingProvider(0.8);

    const mod = await initializeWithSession({
      speakerVerificationProvider: verificationProvider,
      antiSpoofingProvider,
      verificationFailureBehavior: 'closed',
    });

    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    // Both were called concurrently
    expect(verificationProvider.identifySpeaker).toHaveBeenCalledTimes(1);
    expect(antiSpoofingProvider.detectSpoofing).toHaveBeenCalledTimes(1);

    // Even though speaker identity matched, spoof detection failed → abort
    expect(mockOrchestratorInstances[0]!.abort).toHaveBeenCalledTimes(1);
    expect(mockEmitSessionEvent).toHaveBeenCalledWith('speakerVerificationFailed', expect.anything());
  });

  // ─── Test 10: enrollSpeaker throws when provider is null ─────────────────

  it('T10: enrollSpeaker throws clear error when no speakerVerificationProvider configured', async () => {
    const mod = await import('../public/voice-activator');

    await mod.initialize({});

    await expect(
      mod.voiceActivator.enrollSpeaker('alice', new ArrayBuffer(8))
    ).rejects.toThrow(
      'enrollSpeaker() requires a speakerVerificationProvider to be configured in initialize()'
    );
  });

  // ─── Test 11: enrollSpeaker delegates with hardcoded 16000 Hz ────────────

  it('T11: enrollSpeaker delegates to activeSpeakerVerificationProvider.enrollSpeaker with 16000 sampleRate', async () => {
    const verificationProvider = makeSpeakerVerificationProvider();
    const mod = await import('../public/voice-activator');

    await mod.initialize({ speakerVerificationProvider: verificationProvider });

    const audioBuffer = new ArrayBuffer(32);
    await mod.voiceActivator.enrollSpeaker('bob', audioBuffer);

    expect(verificationProvider.enrollSpeaker).toHaveBeenCalledWith('bob', audioBuffer, 16000);
  });

  // ─── Test 12: exportEnrollment, importEnrollment, clearEnrollment ─────────

  it('T12: exportEnrollment/importEnrollment/clearEnrollment delegate to provider and throw when null', async () => {
    const mod = await import('../public/voice-activator');
    await mod.initialize({});

    await expect(mod.voiceActivator.exportEnrollment()).rejects.toThrow(
      'exportEnrollment() requires a speakerVerificationProvider'
    );
    await expect(
      mod.voiceActivator.importEnrollment(makeEnrollmentData())
    ).rejects.toThrow('importEnrollment() requires a speakerVerificationProvider');
    await expect(mod.voiceActivator.clearEnrollment()).rejects.toThrow(
      'clearEnrollment() requires a speakerVerificationProvider'
    );

    // With provider set — should delegate
    const verificationProvider = makeSpeakerVerificationProvider();
    await mod.initialize({ speakerVerificationProvider: verificationProvider });

    const data = makeEnrollmentData();
    await mod.voiceActivator.exportEnrollment();
    await mod.voiceActivator.importEnrollment(data);
    await mod.voiceActivator.clearEnrollment();

    expect(verificationProvider.exportEnrollment).toHaveBeenCalledTimes(1);
    expect(verificationProvider.importEnrollment).toHaveBeenCalledWith(data);
    expect(verificationProvider.clearEnrollment).toHaveBeenCalledTimes(1);
  });

  // ─── Test 13: audioPreprocessingProvider passed as 4th constructor param ──

  it('T13: audioPreprocessingProvider is passed as 4th constructor param to VoiceSessionOrchestrator', async () => {
    const { VoiceSessionOrchestrator } = await import('../runtime/session-orchestrator');
    const audioPreprocessingProvider = makeAudioPreprocessingProvider();

    const mod = await import('../public/voice-activator');

    const stt = {
      name: 'mock-stt',
      transcribe: jest.fn().mockResolvedValue({ text: 'hi', provider: 'mock-stt' }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    const tts = {
      name: 'mock-tts',
      speak: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    };

    await mod.initialize({
      sttProvider: stt,
      ttsProvider: tts,
      session: {
        aiHandler: jest.fn().mockResolvedValue('response'),
        reListenMode: 'manual',
      },
      audioPreprocessingProvider,
    });
    await mod.startDetection();

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    expect(VoiceSessionOrchestrator).toHaveBeenCalledWith(
      expect.anything(),
      stt,
      tts,
      audioPreprocessingProvider
    );
  });

  // ─── Test 14: Verification events only in session mode ───────────────────

  it('T14: When no session config is set, verification runs silently (no event emission)', async () => {
    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockResolvedValue({ name: 'alice', score: 0.9 }),
    });

    const mod = await import('../public/voice-activator');

    const stt = {
      name: 'mock-stt',
      transcribe: jest.fn().mockResolvedValue({ text: 'hi', provider: 'mock-stt' }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    await mod.initialize({
      sttProvider: stt,
      // No session config — non-session mode
      speakerVerificationProvider: verificationProvider,
    });
    await mod.startDetection();

    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    // No verification events in non-session mode
    const verificationCalls = mockEmitSessionEvent.mock.calls.filter(
      ([eventName]: [string]) =>
        eventName === 'speakerVerificationPassed' ||
        eventName === 'speakerVerificationFailed'
    );
    expect(verificationCalls).toHaveLength(0);
  });

  // ─── Test 15: activeVoiceSession set to null after abort ─────────────────

  it('T15: activeVoiceSession is set to null after abort on verification failure', async () => {
    const verificationProvider = makeSpeakerVerificationProvider({
      identifySpeaker: jest.fn().mockResolvedValue({ name: null, score: 0.2 }),
    });

    const mod = await initializeWithSession({
      speakerVerificationProvider: verificationProvider,
      verificationFailureBehavior: 'closed',
    });

    const dummyBuffer = new ArrayBuffer(16);
    (mod as unknown as { setVerificationAudioBuffer?: (b: ArrayBuffer | null) => void })
      .setVerificationAudioBuffer?.(dummyBuffer);

    capturedWakeWordHandler!(makeWakeWordPayload());
    await flushAsync(10);

    expect(mockOrchestratorInstances[0]!.abort).toHaveBeenCalledTimes(1);

    // getSession() should return null
    expect(mod.getSession()).toBeNull();
  });
});
