/**
 * sherpa-onnx-speaker-verification-adapter.test.ts
 *
 * Unit tests for SherpaOnnxSpeakerVerificationAdapter.
 *
 * Requirements: ENROLL-01, ENROLL-02, ENROLL-03, ENROLL-04, ENROLL-05,
 *               API-01, API-02, PRIV-01, SPOOF-03
 */

jest.mock('../NativeVoiceActivator', () => ({
  __esModule: true,
  default: {
    extractSpeakerEmbedding: jest.fn<Promise<string>, [string, number]>(),
    registerSpeaker: jest.fn<Promise<void>, [string, string]>(
      async () => undefined
    ),
    verifySpeaker: jest.fn<
      Promise<{ matched: boolean; score: number }>,
      [string, string, number]
    >(),
    identifySpeaker: jest.fn<
      Promise<{ name: string | null; score: number }>,
      [string, number]
    >(),
    clearSpeakers: jest.fn<Promise<void>, []>(async () => undefined),
    detectSpoofing: jest.fn<Promise<number>, [string, number]>(async () => 0.0),
  },
}));

import { SherpaOnnxSpeakerVerificationAdapter } from '../providers/speaker-verification';
import type { SpeakerVerificationProvider } from '../public/types';

function getNativeMock() {
  return jest.requireMock('../NativeVoiceActivator').default as Record<
    string,
    jest.Mock
  >;
}

/**
 * Helper: encode a Float32Array of given values as base64 string.
 * Dimension 4: produces 16 bytes => 24-char base64 string.
 */
function fakeEmbeddingBase64(values: number[]): string {
  const f32 = new Float32Array(values);
  const bytes = new Uint8Array(f32.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function dummyAudioBuffer(): ArrayBuffer {
  return new ArrayBuffer(16);
}

describe('SherpaOnnxSpeakerVerificationAdapter', () => {
  let adapter: SherpaOnnxSpeakerVerificationAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new SherpaOnnxSpeakerVerificationAdapter();
    // Set up a sequence of different fake embeddings for extractSpeakerEmbedding
    const mock = getNativeMock();
    mock['extractSpeakerEmbedding']
      ?.mockResolvedValueOnce(fakeEmbeddingBase64([1, 2, 3, 4]))
      .mockResolvedValueOnce(fakeEmbeddingBase64([2, 3, 4, 5]))
      .mockResolvedValueOnce(fakeEmbeddingBase64([3, 4, 5, 6]))
      .mockResolvedValueOnce(fakeEmbeddingBase64([4, 5, 6, 7]))
      .mockResolvedValueOnce(fakeEmbeddingBase64([5, 6, 7, 8]))
      .mockResolvedValueOnce(fakeEmbeddingBase64([6, 7, 8, 9]));
  });

  // Test 1: enrollSpeaker accumulates samples (ENROLL-01)
  it('enrollSpeaker accumulates samples (ENROLL-01)', async () => {
    const mock = getNativeMock();
    const audio = dummyAudioBuffer();

    await adapter.enrollSpeaker('alice', audio, 16000);
    await adapter.enrollSpeaker('alice', audio, 16000);
    await adapter.enrollSpeaker('alice', audio, 16000);

    expect(mock['extractSpeakerEmbedding']).toHaveBeenCalledTimes(3);
    expect(mock['registerSpeaker']).toHaveBeenCalledTimes(3);
  });

  // Test 2: enrollSpeaker throws at 5-sample cap (D-06)
  it('enrollSpeaker throws at 5-sample cap (D-06)', async () => {
    const mock = getNativeMock();
    const audio = dummyAudioBuffer();

    // Enroll 5 times successfully
    await adapter.enrollSpeaker('alice', audio, 16000);
    await adapter.enrollSpeaker('alice', audio, 16000);
    await adapter.enrollSpeaker('alice', audio, 16000);
    await adapter.enrollSpeaker('alice', audio, 16000);
    await adapter.enrollSpeaker('alice', audio, 16000);

    expect(mock['extractSpeakerEmbedding']).toHaveBeenCalledTimes(5);

    // 6th should throw before calling extractSpeakerEmbedding
    await expect(
      adapter.enrollSpeaker('alice', audio, 16000)
    ).rejects.toThrow(/already has 5 enrolled samples/);

    // extractSpeakerEmbedding should NOT have been called a 6th time
    expect(mock['extractSpeakerEmbedding']).toHaveBeenCalledTimes(5);
  });

  // Test 3: verifySpeaker averages stored embeddings (D-05)
  it('verifySpeaker averages stored embeddings (D-05)', async () => {
    const mock = getNativeMock();
    const audio = dummyAudioBuffer();

    await adapter.enrollSpeaker('alice', audio, 16000);
    await adapter.enrollSpeaker('alice', audio, 16000);

    // Reset registerSpeaker call count so we can check verify call separately
    mock['registerSpeaker']?.mockClear();

    // Mock verifySpeaker to return a specific result
    mock['verifySpeaker']?.mockResolvedValueOnce({ matched: true, score: 0.85 });
    // Need another extractSpeakerEmbedding for the verify call
    mock['extractSpeakerEmbedding']?.mockResolvedValueOnce(
      fakeEmbeddingBase64([1.5, 2.5, 3.5, 4.5])
    );

    const result = await adapter.verifySpeaker('alice', audio, 16000, 0.5);

    expect(result).toEqual({ matched: true, score: 0.85 });
    expect(mock['verifySpeaker']).toHaveBeenCalledWith(
      'alice',
      expect.any(String),
      0.5
    );
  });

  // Test 4: identifySpeaker calls bridge (ENROLL-05)
  it('identifySpeaker calls bridge (ENROLL-05)', async () => {
    const mock = getNativeMock();
    const audio = dummyAudioBuffer();

    await adapter.enrollSpeaker('alice', audio, 16000);

    mock['identifySpeaker']?.mockResolvedValueOnce({
      name: 'alice',
      score: 0.9,
    });
    mock['extractSpeakerEmbedding']?.mockResolvedValueOnce(
      fakeEmbeddingBase64([1, 2, 3, 4])
    );

    const result = await adapter.identifySpeaker(audio, 16000, 0.5);

    expect(result).toEqual({ name: 'alice', score: 0.9 });
    expect(mock['identifySpeaker']).toHaveBeenCalledWith(
      expect.any(String),
      0.5
    );
  });

  // Test 5: exportEnrollment returns raw embeddings (D-03, ENROLL-02)
  it('exportEnrollment returns raw embeddings (D-03, ENROLL-02)', async () => {
    const audio = dummyAudioBuffer();

    await adapter.enrollSpeaker('alice', audio, 16000);
    await adapter.enrollSpeaker('alice', audio, 16000);

    const result = await adapter.exportEnrollment();

    expect(result.version).toBe(1);
    expect(result.speakers).toHaveProperty('alice');
    expect(result.speakers['alice']?.embeddings).toHaveLength(2);
    expect(result.speakers['alice']?.sampleCount).toBe(2);
    // Embeddings should be raw strings (not averaged)
    expect(typeof result.speakers['alice']?.embeddings[0]).toBe('string');
  });

  // Test 6: importEnrollment restores on fresh adapter (ENROLL-03)
  it('importEnrollment restores on fresh adapter (ENROLL-03)', async () => {
    const mock = getNativeMock();

    const emb1 = fakeEmbeddingBase64([1, 2, 3, 4]);
    const emb2 = fakeEmbeddingBase64([2, 3, 4, 5]);

    await adapter.importEnrollment({
      version: 1,
      speakers: {
        alice: { embeddings: [emb1, emb2], sampleCount: 2 },
      },
    });

    // clearSpeakers should be called first
    expect(mock['clearSpeakers']).toHaveBeenCalledTimes(1);
    // registerSpeaker should be called for alice (with averaged embedding)
    expect(mock['registerSpeaker']).toHaveBeenCalledWith(
      'alice',
      expect.any(String)
    );
  });

  // Test 7: clearEnrollment clears JS Map and native state (ENROLL-04, PRIV-01)
  it('clearEnrollment clears JS Map and native state (ENROLL-04, PRIV-01)', async () => {
    const mock = getNativeMock();
    const audio = dummyAudioBuffer();

    await adapter.enrollSpeaker('alice', audio, 16000);

    await adapter.clearEnrollment();

    // clearSpeakers should have been called
    expect(mock['clearSpeakers']).toHaveBeenCalled();

    // exportEnrollment should return empty speakers
    const exported = await adapter.exportEnrollment();
    expect(exported).toEqual({ version: 1, speakers: {} });
  });

  // Test 8: multi-speaker enrollment (ENROLL-05)
  it('multi-speaker enrollment (ENROLL-05)', async () => {
    const mock = getNativeMock();
    const audio = dummyAudioBuffer();

    // Need more fake embeddings for two speakers
    mock['extractSpeakerEmbedding']
      ?.mockReset()
      .mockResolvedValueOnce(fakeEmbeddingBase64([1, 2, 3, 4]))
      .mockResolvedValueOnce(fakeEmbeddingBase64([5, 6, 7, 8]));

    await adapter.enrollSpeaker('alice', audio, 16000);
    await adapter.enrollSpeaker('bob', audio, 16000);

    const exported = await adapter.exportEnrollment();

    expect(exported.speakers).toHaveProperty('alice');
    expect(exported.speakers).toHaveProperty('bob');
    expect(exported.speakers['alice']?.sampleCount).toBe(1);
    expect(exported.speakers['bob']?.sampleCount).toBe(1);
  });

  // Test 9: custom provider without detectSpoofing satisfies interface (SPOOF-03)
  it('custom provider without detectSpoofing satisfies interface (SPOOF-03)', () => {
    class CustomProvider implements SpeakerVerificationProvider {
      async enrollSpeaker(
        _userId: string,
        _audioBuffer: ArrayBuffer,
        _sampleRate: number
      ): Promise<void> {}
      async verifySpeaker(
        _userId: string,
        _audioBuffer: ArrayBuffer,
        _sampleRate: number,
        _threshold: number
      ): Promise<{ matched: boolean; score: number }> {
        return { matched: false, score: 0 };
      }
      async identifySpeaker(
        _audioBuffer: ArrayBuffer,
        _sampleRate: number,
        _threshold: number
      ): Promise<{ name: string | null; score: number }> {
        return { name: null, score: 0 };
      }
      async exportEnrollment() {
        return { version: 1 as const, speakers: {} };
      }
      async importEnrollment(
        _data: import('../public/types').EnrollmentData
      ): Promise<void> {}
      async clearEnrollment(): Promise<void> {}
      // Note: detectSpoofing is intentionally omitted — it's optional (SPOOF-03)
    }

    const p: SpeakerVerificationProvider = new CustomProvider();
    expect(p).toBeTruthy();
  });
});
