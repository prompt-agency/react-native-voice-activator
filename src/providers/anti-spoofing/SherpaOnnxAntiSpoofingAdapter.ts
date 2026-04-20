import NativeVoiceActivator from '../../NativeVoiceActivator';
import type { AntiSpoofingProvider } from '../../public/types';

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

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * SherpaOnnxAntiSpoofingAdapter
 *
 * Implements AntiSpoofingProvider using the Sherpa-ONNX detectSpoofing bridge.
 * The bridge returns a stub 0.0 value (Phase 1 implementation) — no real anti-spoofing
 * model is available in Sherpa-ONNX v1.12.29. This adapter passes through the result
 * without throwing.
 *
 * Requirements: SPOOF-02
 * Note: Real AASIST integration deferred per RESEARCH.md
 */
export class SherpaOnnxAntiSpoofingAdapter implements AntiSpoofingProvider {
  async detectSpoofing(
    pcmBuffer: ArrayBuffer,
    sampleRate: number
  ): Promise<number> {
    const pcmBase64 = arrayBufferToBase64(pcmBuffer);
    // Returns 0.0 stub per Phase 1 implementation — documented behavior
    // Passes through without throwing for any returned value
    return NativeVoiceActivator!.detectSpoofing(pcmBase64, sampleRate);
  }
}
