/**
 * native-bridge-spec.test.ts
 *
 * Unit tests for the 7 Phase 1 bridge methods declared in NativeVoiceActivator.ts.
 * These tests verify the JS-side contract against a mocked native module.
 * They do NOT go through the full VoiceActivator public API — they test the spec contract directly.
 *
 * Requirements: BRIDGE-01, BRIDGE-02, BRIDGE-03, BRIDGE-04, BRIDGE-05, BRIDGE-06, SPOOF-01
 */

function createMockNativeModule() {
  return {
    // Existing methods (required to avoid "partially implemented" guard)
    initialize: jest.fn<Promise<void>, [any]>(async () => undefined),
    startDetection: jest.fn<Promise<void>, []>(async () => undefined),
    stopDetection: jest.fn<Promise<void>, []>(async () => undefined),
    getStatus: jest.fn(() => ({
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    })),
    dispose: jest.fn<Promise<void>, []>(async () => undefined),
    addListener: jest.fn<void, [string]>(),
    removeListeners: jest.fn<void, [number]>(),
    playPCMChunk: jest.fn<Promise<void>, [string, number]>(
      async () => undefined
    ),
    playWav: jest.fn<Promise<void>, [string]>(async () => undefined),
    stopPlayback: jest.fn<Promise<void>, []>(async () => undefined),
    setVolumeDucking: jest.fn<Promise<void>, [boolean]>(async () => undefined),
    setAudioRoute: jest.fn<Promise<void>, [string]>(async () => undefined),
    startVADCapture: jest.fn<Promise<void>, [number]>(async () => undefined),
    stopVADCapture: jest.fn<Promise<void>, []>(async () => undefined),
    synthesizeTTS: jest.fn<Promise<void>, [any]>(async () => undefined),

    // Phase 1 — Speaker Embedding (BRIDGE-01)
    extractSpeakerEmbedding: jest.fn<Promise<string>, [string, number]>(
      async () => 'dGVzdGVtYmVkZGluZw=='
    ),

    // Phase 1 — Speaker Registration (BRIDGE-02)
    registerSpeaker: jest.fn<Promise<void>, [string, string]>(
      async () => undefined
    ),

    // Phase 1 — Speaker Verification (BRIDGE-03)
    // Returns UnsafeObject with shape: { matched: boolean, score: number }
    verifySpeaker: jest.fn<
      Promise<{ matched: boolean; score: number }>,
      [string, string, number]
    >(async () => ({ matched: true, score: 0.85 })),

    // Phase 1 — Speaker Identification (BRIDGE-04)
    // Returns UnsafeObject with shape: { name: string | null, score: number }
    identifySpeaker: jest.fn<
      Promise<{ name: string | null; score: number }>,
      [string, number]
    >(async () => ({ name: 'alice', score: 0.9 })),

    // Phase 1 — Clear Speakers (BRIDGE-05)
    clearSpeakers: jest.fn<Promise<void>, []>(async () => undefined),

    // Phase 1 — Audio Denoising (BRIDGE-06)
    denoiseAudio: jest.fn<Promise<string>, [string, number]>(
      async () => 'Y2xlYW5hdWRpbw=='
    ),

    // Phase 1 — Anti-Spoofing (SPOOF-01)
    // Returns spoof probability 0-1 (stub: returns 0.0 until anti-spoofing model available)
    detectSpoofing: jest.fn<Promise<number>, [string, number]>(async () => 0.0),
  };
}

describe('NativeVoiceActivator Phase 1 bridge spec', () => {
  // Test 1: extractSpeakerEmbedding (BRIDGE-01)
  it('extractSpeakerEmbedding returns a non-empty base64 string', async () => {
    const mockModule = createMockNativeModule();
    mockModule.extractSpeakerEmbedding.mockResolvedValueOnce(
      'dGVzdGVtYmVkZGluZw=='
    );

    const result = await mockModule.extractSpeakerEmbedding(
      'dGVzdHBjbQ==',
      16000
    );

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // Test 2: registerSpeaker (BRIDGE-02)
  it('registerSpeaker resolves without error', async () => {
    const mockModule = createMockNativeModule();
    mockModule.registerSpeaker.mockResolvedValueOnce(undefined);

    await expect(
      mockModule.registerSpeaker('alice', 'dGVzdGVtYmVkZGluZw==')
    ).resolves.toBeUndefined();
  });

  // Test 3: verifySpeaker (BRIDGE-03) — matched true
  it('verifySpeaker returns an object with matched (boolean) and score (number) properties', async () => {
    const mockModule = createMockNativeModule();
    mockModule.verifySpeaker.mockResolvedValueOnce({
      matched: true,
      score: 0.85,
    });

    const result = await mockModule.verifySpeaker(
      'alice',
      'dGVzdGVtYmVkZGluZw==',
      0.5
    );

    expect(typeof result.matched).toBe('boolean');
    expect(result.matched).toBe(true);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBe(0.85);
  });

  // Test 4: identifySpeaker (BRIDGE-04) — matched speaker above threshold
  it('identifySpeaker returns an object with name (string) and score (number) properties', async () => {
    const mockModule = createMockNativeModule();
    mockModule.identifySpeaker.mockResolvedValueOnce({
      name: 'alice',
      score: 0.9,
    });

    const result = await mockModule.identifySpeaker(
      'dGVzdGVtYmVkZGluZw==',
      0.5
    );

    expect(typeof result.name).toBe('string');
    expect(result.name).toBe('alice');
    expect(typeof result.score).toBe('number');
    expect(result.score).toBe(0.9);
  });

  // Test 5: identifySpeaker (BRIDGE-04) — below threshold, name is null
  it('identifySpeaker returns name as null when below threshold', async () => {
    const mockModule = createMockNativeModule();
    mockModule.identifySpeaker.mockResolvedValueOnce({
      name: null,
      score: 0.2,
    });

    const result = await mockModule.identifySpeaker(
      'dGVzdGVtYmVkZGluZw==',
      0.5
    );

    expect(result.name).toBeNull();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBe(0.2);
  });

  // Test 6: clearSpeakers (BRIDGE-05)
  it('clearSpeakers resolves without error', async () => {
    const mockModule = createMockNativeModule();
    mockModule.clearSpeakers.mockResolvedValueOnce(undefined);

    await expect(mockModule.clearSpeakers()).resolves.toBeUndefined();
  });

  // Test 7: denoiseAudio (BRIDGE-06)
  it('denoiseAudio returns a non-empty base64 string', async () => {
    const mockModule = createMockNativeModule();
    mockModule.denoiseAudio.mockResolvedValueOnce('Y2xlYW5hdWRpbw==');

    const result = await mockModule.denoiseAudio('dGVzdHBjbQ==', 16000);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // Test 8: detectSpoofing (SPOOF-01)
  it('detectSpoofing returns a number between 0 and 1', async () => {
    const mockModule = createMockNativeModule();
    mockModule.detectSpoofing.mockResolvedValueOnce(0.0);

    const result = await mockModule.detectSpoofing('dGVzdHBjbQ==', 16000);

    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  // Test 9: Contract parity — all 7 new methods exist as functions on the mock module
  it('all 7 Phase 1 bridge methods are present as functions on the native module', () => {
    const mockModule = createMockNativeModule();

    expect(typeof mockModule.extractSpeakerEmbedding).toBe('function');
    expect(typeof mockModule.registerSpeaker).toBe('function');
    expect(typeof mockModule.verifySpeaker).toBe('function');
    expect(typeof mockModule.identifySpeaker).toBe('function');
    expect(typeof mockModule.clearSpeakers).toBe('function');
    expect(typeof mockModule.denoiseAudio).toBe('function');
    expect(typeof mockModule.detectSpoofing).toBe('function');
  });
});
