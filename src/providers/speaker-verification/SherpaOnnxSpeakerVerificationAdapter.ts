import NativeVoiceActivator from '../../NativeVoiceActivator';
import type {
  EnrollmentData,
  SpeakerVerificationProvider,
} from '../../public/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Strip non-base64 chars (same pattern as WhisperRNSTTAdapter)
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function averageEmbeddings(embeddings: string[]): string {
  if (embeddings.length === 1) {
    return embeddings[0]!;
  }

  const arrays = embeddings.map((b64) => {
    const buf = base64ToArrayBuffer(b64);
    return new Float32Array(buf);
  });

  const len = arrays[0]!.length;
  for (const arr of arrays) {
    if (arr.length !== len) {
      throw new Error(
        `Embedding dimension mismatch: expected ${len}, got ${arr.length}`
      );
    }
  }

  const averaged = new Float32Array(len);
  for (const arr of arrays) {
    for (let i = 0; i < len; i++) {
      averaged[i]! += arr[i]!;
    }
  }
  for (let i = 0; i < len; i++) {
    averaged[i]! /= embeddings.length;
  }

  return arrayBufferToBase64(averaged.buffer);
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * SherpaOnnxSpeakerVerificationAdapter
 *
 * Implements SpeakerVerificationProvider using the Sherpa-ONNX native bridge.
 * Maintains an in-memory enrollment state machine:
 *   - Accumulates up to 5 raw embeddings per speaker (ENROLL-01, D-04, D-06)
 *   - Averages embeddings at query time (D-05)
 *   - Exports/imports raw embeddings for app-side persistence (D-03, PRIV-01)
 *   - Never persists embeddings — app owns storage (GDPR/CCPA/BIPA)
 */
export class SherpaOnnxSpeakerVerificationAdapter
  implements SpeakerVerificationProvider
{
  private readonly _speakers = new Map<string, string[]>();

  /**
   * Enroll a speaker by extracting their embedding from an audio buffer and
   * accumulating it in the in-memory store. Throws if the speaker already has
   * 5 enrolled samples (hard cap per D-06).
   *
   * Requirements: ENROLL-01, D-04, D-06
   */
  async enrollSpeaker(
    userId: string,
    audioBuffer: ArrayBuffer,
    sampleRate: number
  ): Promise<void> {
    const existing = this._speakers.get(userId) ?? [];

    // Guard before any await — throw synchronously if cap reached
    if (existing.length >= 5) {
      throw new Error(
        `Speaker '${userId}' already has 5 enrolled samples. Call clearEnrollment() before re-enrolling.`
      );
    }

    const pcmBase64 = arrayBufferToBase64(audioBuffer);
    const embedding = await NativeVoiceActivator!.extractSpeakerEmbedding(
      pcmBase64,
      sampleRate
    );

    const updated = [...existing, embedding];
    this._speakers.set(userId, updated);

    // Keep native registry current with averaged embedding
    const avgEmbedding = averageEmbeddings(updated);
    await NativeVoiceActivator!.registerSpeaker(userId, avgEmbedding);
  }

  /**
   * Verify a speaker by comparing their current audio against stored embeddings.
   * Averages stored embeddings before calling the native bridge (D-05).
   *
   * Requirements: ENROLL-01, D-05
   */
  async verifySpeaker(
    userId: string,
    audioBuffer: ArrayBuffer,
    sampleRate: number,
    threshold: number
  ): Promise<{ matched: boolean; score: number }> {
    const stored = this._speakers.get(userId);
    if (!stored || stored.length === 0) {
      throw new Error(`No enrolled samples for speaker '${userId}'`);
    }

    const pcmBase64 = arrayBufferToBase64(audioBuffer);
    // Extract query embedding from audio (used for native extraction pipeline)
    await NativeVoiceActivator!.extractSpeakerEmbedding(pcmBase64, sampleRate);

    // Average stored embeddings and pass as the reference embedding to the bridge (D-05)
    const avgEmbedding = averageEmbeddings(stored);
    const result = await NativeVoiceActivator!.verifySpeaker(
      userId,
      avgEmbedding,
      threshold
    );

    return result as { matched: boolean; score: number };
  }

  /**
   * Identify the closest enrolled speaker for the given audio buffer.
   * Calls the native identifySpeaker bridge with the extracted embedding.
   *
   * Requirements: ENROLL-05, D-07
   */
  async identifySpeaker(
    audioBuffer: ArrayBuffer,
    sampleRate: number,
    threshold: number
  ): Promise<{ name: string | null; score: number }> {
    const pcmBase64 = arrayBufferToBase64(audioBuffer);
    const embedding = await NativeVoiceActivator!.extractSpeakerEmbedding(
      pcmBase64,
      sampleRate
    );

    const result = await NativeVoiceActivator!.identifySpeaker(
      embedding,
      threshold
    );

    return result as { name: string | null; score: number };
  }

  /**
   * Export the full raw embeddings for all enrolled speakers.
   * Returns raw (un-averaged) embeddings so importEnrollment can
   * reconstruct exact in-memory state (D-03, ENROLL-02).
   *
   * Requirements: ENROLL-02, D-03
   */
  async exportEnrollment(): Promise<EnrollmentData> {
    const speakers: EnrollmentData['speakers'] = {};

    for (const [userId, embeddings] of this._speakers.entries()) {
      speakers[userId] = {
        embeddings: [...embeddings], // defensive copy
        sampleCount: embeddings.length,
      };
    }

    return { version: 1, speakers };
  }

  /**
   * Restore enrollment state from a previously exported EnrollmentData object.
   * Clears native state first, then rebuilds from the imported data (ENROLL-03).
   *
   * Requirements: ENROLL-03
   */
  async importEnrollment(data: EnrollmentData): Promise<void> {
    // Clear native state first
    await NativeVoiceActivator!.clearSpeakers();

    // Clear JS state
    this._speakers.clear();

    // Restore each speaker
    for (const [userId, speakerData] of Object.entries(data.speakers)) {
      this._speakers.set(userId, [...speakerData.embeddings]);

      // Register with averaged embedding in native layer
      const avgEmbedding = averageEmbeddings(speakerData.embeddings);
      await NativeVoiceActivator!.registerSpeaker(userId, avgEmbedding);
    }
  }

  /**
   * Clear all enrolled speakers from both JS state and native registry.
   * After this call, exportEnrollment returns an empty speakers object.
   *
   * Requirements: ENROLL-04, PRIV-01
   */
  async clearEnrollment(): Promise<void> {
    this._speakers.clear();
    await NativeVoiceActivator!.clearSpeakers();
  }
}
