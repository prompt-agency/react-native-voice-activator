#!/usr/bin/env node
/**
 * Downloads the upstream Silero VAD ONNX (MIT) into iOS and Android asset paths
 * used by SileroVADEngine / getSileroVADModelPath().
 *
 * Pinned: snakers4/silero-vad tag v5.1.2 — src/silero_vad/data/silero_vad.onnx
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MODEL_URL =
  'https://raw.githubusercontent.com/snakers4/silero-vad/v5.1.2/src/silero_vad/data/silero_vad.onnx';

/** SHA-256 of the pinned file (bump when changing MODEL_URL). */
const EXPECTED_SHA256 =
  '2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f';

const DESTINATIONS = [
  join(ROOT, 'ios', 'Assets', 'silero_vad.onnx'),
  join(ROOT, 'android', 'src', 'main', 'assets', 'silero_vad.onnx'),
];

async function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function main() {
  if (process.env.SKIP_SILERO_VAD_FETCH === '1') {
    console.log('[fetch-silero-vad-model] SKIP_SILERO_VAD_FETCH=1 — skipping');
    return;
  }

  try {
    const existing = await readFile(DESTINATIONS[0]);
    if ((await sha256(existing)) === EXPECTED_SHA256) {
      console.log(
        '[fetch-silero-vad-model] Pinned model already present — skipping download'
      );
      return;
    }
  } catch {
    // fetch below
  }

  console.log('[fetch-silero-vad-model] Downloading', MODEL_URL);
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = await sha256(buf);
  if (hash !== EXPECTED_SHA256) {
    throw new Error(
      `[fetch-silero-vad-model] SHA-256 mismatch: got ${hash}, expected ${EXPECTED_SHA256}`
    );
  }

  for (const dest of DESTINATIONS) {
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    console.log('[fetch-silero-vad-model] Wrote', dest);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
