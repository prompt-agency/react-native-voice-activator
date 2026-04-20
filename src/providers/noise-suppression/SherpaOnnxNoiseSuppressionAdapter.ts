import NativeVoiceActivator from '../../NativeVoiceActivator';
import type { AudioPreprocessingProvider } from '../../public/types';

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
  // Strip non-base64 chars (same pattern as SherpaOnnxSpeakerVerificationAdapter)
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * SherpaOnnxNoiseSuppressionAdapter
 *
 * Implements AudioPreprocessingProvider using the Sherpa-ONNX denoiseAudio bridge.
 * Converts PCM ArrayBuffer to base64 before calling the native bridge, and converts
 * the returned base64-encoded denoised audio back to an ArrayBuffer.
 *
 * Requirements: NOISE-01, NOISE-02, NOISE-03, NOISE-04
 * Decisions: D-10 (sampleRate at call time, not constructor), D-11 (stateless, no init/dispose)
 */
export class SherpaOnnxNoiseSuppressionAdapter
  implements AudioPreprocessingProvider
{
  private readonly _modelPath: string;

  constructor(options: { modelPath: string }) {
    this._modelPath = options.modelPath;
  }

  get modelPath(): string {
    return this._modelPath;
  }

  async process(audioBuffer: ArrayBuffer, sampleRate: number): Promise<ArrayBuffer> {
    const pcmBase64 = arrayBufferToBase64(audioBuffer);
    const denoisedBase64 = await NativeVoiceActivator!.denoiseAudio(
      pcmBase64,
      sampleRate
    );
    return base64ToArrayBuffer(denoisedBase64);
  }
}
