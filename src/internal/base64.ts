/**
 * Base64 helpers for audio payloads crossing the RN bridge.
 *
 * These run on the JS thread inside per-frame audio paths, so they avoid the
 * obvious `binary += String.fromCharCode(byte)` loop: building a string one
 * character at a time is quadratic under Hermes' rope representation and a
 * multi-hundred-kilobyte WAV can stall the thread long enough to drop frames.
 * Encoding goes through fixed-size blocks instead.
 */

/**
 * Bytes converted per `String.fromCharCode` call. Kept well under the argument
 * limit that large spreads hit on JS engines while still amortising the call.
 */
const ENCODE_BLOCK_SIZE = 8192;

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const blocks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += ENCODE_BLOCK_SIZE) {
    const block = bytes.subarray(offset, offset + ENCODE_BLOCK_SIZE);
    blocks.push(String.fromCharCode(...block));
  }
  return btoa(blocks.join(''));
}

/**
 * Decode a base64 float32 LE PCM frame.
 *
 * Returns `null` rather than throwing when the payload is not a whole number
 * of float32 values. These frames arrive from a native event listener, where
 * a raised `RangeError` would escape into the emitter rather than into any
 * caller that could handle it.
 */
export function base64ToFloat32Array(base64: string): Float32Array | null {
  const bytes = base64ToUint8Array(base64);
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0
  ) {
    return null;
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}
