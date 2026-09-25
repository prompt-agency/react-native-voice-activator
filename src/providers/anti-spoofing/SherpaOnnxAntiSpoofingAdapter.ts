import type { AntiSpoofingProvider } from '../../public/types';

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * SherpaOnnxAntiSpoofingAdapter
 *
 * **Not implemented.** Constructing this adapter throws.
 *
 * The native `detectSpoofing` bridge is a stub that resolves `0.0` on both
 * platforms (`VoiceActivatorModule.kt`, `VoiceActivator.mm`) because
 * Sherpa-ONNX v1.12.29 ships no anti-spoofing model. Since the wake-word gate
 * treats a score at or below `spoofingThreshold` as a pass, a constant `0.0`
 * meant every input passed — including replayed and synthetic audio.
 *
 * An anti-spoofing check that always passes is worse than no check, because it
 * reads as a security control in code review and in the consuming app's own
 * compliance documentation. Rather than ship that, this adapter refuses to
 * construct until a real model is wired up.
 *
 * The `antiSpoofingProvider` option on `initialize()` is unaffected and works
 * correctly: supply your own `AntiSpoofingProvider` and the gate will reject
 * scores above `spoofingThreshold`.
 *
 * Requirements: SPOOF-02 (deferred — real AASIST integration pending)
 */
export class SherpaOnnxAntiSpoofingAdapter implements AntiSpoofingProvider {
  constructor() {
    throw new Error(
      'SherpaOnnxAntiSpoofingAdapter is not implemented. The native ' +
        'detectSpoofing bridge is a stub that always returns 0.0, so this ' +
        'adapter would pass every input including replay and synthetic audio. ' +
        'Supply your own AntiSpoofingProvider via ' +
        'initialize({ antiSpoofingProvider }) instead, or omit anti-spoofing ' +
        'entirely.'
    );
  }

  async detectSpoofing(
    _pcmBuffer: ArrayBuffer,
    _sampleRate: number
  ): Promise<number> {
    /* istanbul ignore next -- unreachable: the constructor always throws */
    throw new Error('SherpaOnnxAntiSpoofingAdapter is not implemented.');
  }
}
