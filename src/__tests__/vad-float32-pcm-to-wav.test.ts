import { float32PcmBase64ChunksToWavBase64 } from '../internal/vad-float32-pcm-to-wav';

function float32SamplesToBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

describe('float32PcmBase64ChunksToWavBase64', () => {
  it('produces a WAV with correct RIFF header and 16-bit PCM', () => {
    const s = new Float32Array(4);
    s[0] = 0;
    s[1] = 1;
    s[2] = -1;
    s[3] = 0.5;
    const b64 = float32PcmBase64ChunksToWavBase64([float32SamplesToBase64(s)]);
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(String.fromCharCode(raw[0]!, raw[1]!, raw[2]!, raw[3]!)).toBe(
      'RIFF'
    );
    expect(String.fromCharCode(raw[8]!, raw[9]!, raw[10]!, raw[11]!)).toBe(
      'WAVE'
    );
    const dataSize = new DataView(raw.buffer).getUint32(40, true);
    expect(dataSize).toBe(8);
  });

  it('handles empty chunk list (header-only WAV)', () => {
    const b64 = float32PcmBase64ChunksToWavBase64([]);
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dataSize = new DataView(raw.buffer).getUint32(40, true);
    expect(dataSize).toBe(0);
  });
});
