/** 16 kHz mono 16-bit LE WAV from VAD native float32 PCM chunks (base64). */

import { base64ToUint8Array, uint8ArrayToBase64 } from './base64';

const SAMPLE_RATE = 16_000;

function float32Base64ChunkToInt16Bytes(base64: string): Uint8Array {
  const raw = base64ToUint8Array(base64);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const numFloats = raw.byteLength / 4;
  const out = new Uint8Array(numFloats * 2);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < numFloats; i++) {
    let f = view.getFloat32(i * 4, true);
    f = Math.max(-1, Math.min(1, f));
    const s = Math.round(f * 32767);
    outView.setInt16(i * 2, s, true);
  }
  return out;
}

/**
 * Build a valid 16 kHz mono 16-bit PCM WAV (base64) from Silero/VAD float32 LE PCM chunks.
 */
export function float32PcmBase64ChunksToWavBase64(chunks: string[]): string {
  const pcmParts = chunks.map(float32Base64ChunkToInt16Bytes);
  const pcmLength = pcmParts.reduce((s, p) => s + p.length, 0);
  const pcm = new Uint8Array(pcmLength);
  let offset = 0;
  for (const p of pcmParts) {
    pcm.set(p, offset);
    offset += p.length;
  }

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const wavBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(wavBuffer);

  view.setUint8(0, 0x52);
  view.setUint8(1, 0x49);
  view.setUint8(2, 0x46);
  view.setUint8(3, 0x46);
  view.setUint32(4, 36 + pcmLength, true);
  view.setUint8(8, 0x57);
  view.setUint8(9, 0x41);
  view.setUint8(10, 0x56);
  view.setUint8(11, 0x45);

  view.setUint8(12, 0x66);
  view.setUint8(13, 0x6d);
  view.setUint8(14, 0x74);
  view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  view.setUint8(36, 0x64);
  view.setUint8(37, 0x61);
  view.setUint8(38, 0x74);
  view.setUint8(39, 0x61);
  view.setUint32(40, pcmLength, true);

  new Uint8Array(wavBuffer).set(pcm, 44);

  return uint8ArrayToBase64(new Uint8Array(wavBuffer));
}
