/**
 * sherpa-onnx-anti-spoofing-adapter.test.ts
 *
 * SherpaOnnxAntiSpoofingAdapter refuses to construct while the native
 * detectSpoofing bridge is a stub returning a constant 0.0. See the adapter's
 * doc comment for why a permanently-passing check is worse than no check.
 *
 * Requirements: SPOOF-02 (deferred)
 */

import { SherpaOnnxAntiSpoofingAdapter } from '../providers/anti-spoofing';

describe('SherpaOnnxAntiSpoofingAdapter', () => {
  it('throws on construction rather than silently passing every input', () => {
    expect(() => new SherpaOnnxAntiSpoofingAdapter()).toThrow(
      /not implemented/i
    );
  });

  it('explains why, and points at the supported alternative', () => {
    expect(() => new SherpaOnnxAntiSpoofingAdapter()).toThrow(
      /always returns 0\.0/
    );
    expect(() => new SherpaOnnxAntiSpoofingAdapter()).toThrow(
      /antiSpoofingProvider/
    );
  });

  it('is still exported from the package root so the type surface is stable', async () => {
    const pkg = await import('../providers/anti-spoofing');

    expect(typeof pkg.SherpaOnnxAntiSpoofingAdapter).toBe('function');
  });
});
