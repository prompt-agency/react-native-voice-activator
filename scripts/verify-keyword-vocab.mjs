#!/usr/bin/env node
/**
 * Guards the generated keyword vocabulary against drift.
 *
 * The table is baked into the JavaScript bundle, but the model it describes is
 * downloaded at runtime. That is only safe because the download is verified
 * against src/internal/model-manifest.json, and this check proves the table, the
 * two checked-in copies of bpe.model, and that manifest all agree. Changing the
 * model bundle without regenerating the table fails here rather than on a device.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const IOS_MODEL_DIR = join(
  ROOT,
  'ios/Assets/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
);
const ANDROID_MODEL_DIR = join(
  ROOT,
  'android/src/main/assets/voice-activator-sherpa-onnx/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
);
const TABLE_PATH = join(ROOT, 'src/internal/keyword-vocab.generated.json');

const failures = [];

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const table = JSON.parse(readFileSync(TABLE_PATH, 'utf8'));

// 1. The checked-in table matches a fresh parse, byte for byte. --stdout keeps
//    this read-only: a lint check must not rewrite the file it is checking, or
//    it would launder drift into a passing run and a dirty working tree.
const regenerated = execFileSync(
  process.execPath,
  [join(ROOT, 'scripts/generate-keyword-vocab.mjs'), '--stdout'],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
);
if (regenerated !== readFileSync(TABLE_PATH, 'utf8')) {
  failures.push(
    'src/internal/keyword-vocab.generated.json does not match a fresh parse of ' +
      'bpe.model. Regenerate it with: yarn generate:keyword-vocab'
  );
}

// 2. The piece set equals tokens.txt, in both directions.
const tokens = readFileSync(join(IOS_MODEL_DIR, 'tokens.txt'), 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => line.slice(0, line.lastIndexOf(' ')))
  .filter((token) => !token.startsWith('<'));
const pieces = table.pieces.map(([piece]) => piece);

const missingFromTable = tokens.filter((token) => !pieces.includes(token));
const missingFromTokens = pieces.filter((piece) => !tokens.includes(piece));
if (missingFromTable.length > 0) {
  failures.push(`tokens.txt has pieces the table lacks: ${missingFromTable.join(', ')}`);
}
if (missingFromTokens.length > 0) {
  failures.push(
    `the table has pieces tokens.txt lacks, which sherpa-onnx would reject with ` +
      `exit(-1): ${missingFromTokens.join(', ')}`
  );
}

// 3. bpe.model agrees across both platforms and the download manifest.
const iosDigest = sha256(join(IOS_MODEL_DIR, 'bpe.model'));
const androidDigest = sha256(join(ANDROID_MODEL_DIR, 'bpe.model'));
const manifest = JSON.parse(
  readFileSync(join(ROOT, 'src/internal/model-manifest.json'), 'utf8')
);
const manifestEntry = manifest.files.find((file) => file.path.endsWith('/bpe.model'));

if (table.sha256 !== iosDigest) {
  failures.push(
    `the table describes bpe.model ${table.sha256} but the iOS asset is ${iosDigest}. ` +
      'Regenerate it with: yarn generate:keyword-vocab'
  );
}
if (androidDigest !== iosDigest) {
  failures.push(
    `bpe.model differs between platforms: iOS ${iosDigest}, Android ${androidDigest}.`
  );
}
if (manifestEntry === undefined) {
  failures.push('model-manifest.json has no bpe.model entry.');
} else if (manifestEntry.sha256 !== iosDigest) {
  failures.push(
    `model-manifest.json pins bpe.model ${manifestEntry.sha256} but the checked-in ` +
      `asset is ${iosDigest}, so the downloaded model would not be the one the ` +
      'baked vocabulary describes.'
  );
}

if (failures.length > 0) {
  console.error('Keyword vocabulary checks failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Keyword vocabulary checks passed (${pieces.length} pieces).`);
}
