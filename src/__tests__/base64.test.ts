import {
  base64ToFloat32Array,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '../internal/base64';

function encodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

describe('base64 helpers', () => {
  it('round-trips bytes that span more than one encode block', () => {
    // 8192 is the block size; go past it so block joining is exercised.
    const bytes = new Uint8Array(20_000);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 256;
    }

    expect(base64ToUint8Array(uint8ArrayToBase64(bytes))).toEqual(bytes);
  });

  it('encodes identically to a naive per-character implementation', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42, 7]);

    expect(uint8ArrayToBase64(bytes)).toBe(encodeBytes(bytes));
  });

  it('round-trips an empty buffer', () => {
    expect(uint8ArrayToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToUint8Array('')).toEqual(new Uint8Array(0));
  });

  describe('base64ToFloat32Array', () => {
    it('decodes a whole number of float32 values', () => {
      const samples = new Float32Array([0.5, -0.25, 1, -1]);
      const encoded = encodeBytes(new Uint8Array(samples.buffer));

      expect(base64ToFloat32Array(encoded)).toEqual(samples);
    });

    it('returns null instead of throwing on a truncated frame', () => {
      // 6 bytes is not a whole number of float32 values. The old code built a
      // Float32Array over this directly and raised a RangeError inside a
      // native event listener, where nothing could catch it.
      const encoded = encodeBytes(new Uint8Array([1, 2, 3, 4, 5, 6]));

      expect(base64ToFloat32Array(encoded)).toBeNull();
    });

    it('returns null on an empty frame', () => {
      expect(base64ToFloat32Array('')).toBeNull();
    });
  });
});
