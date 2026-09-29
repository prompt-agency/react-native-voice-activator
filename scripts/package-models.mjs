#!/usr/bin/env node
/**
 * Stages the model files for upload as GitHub release assets.
 *
 * The models are not shipped in the npm tarball; prepareModels() downloads them
 * once at runtime and verifies each against src/internal/model-manifest.json.
 * That only works if the release actually carries the files the manifest
 * describes, under the flattened names it records — GitHub release asset names
 * cannot contain slashes.
 *
 * Writes each file into `dist-models/` under its flattened asset name, and fails
 * if any file is missing or does not match its recorded checksum. Run
 * `yarn generate:model-manifest` first if a model has changed.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = join(ROOT, 'ios', 'Assets');
const OUT_DIR = join(ROOT, 'dist-models');
const MANIFEST = join(ROOT, 'src', 'internal', 'model-manifest.json');

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));

const errors = [];

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

for (const spec of manifest.files) {
  const source = join(SOURCE_ROOT, spec.path);

  let bytes;
  try {
    bytes = await readFile(source);
  } catch {
    errors.push(
      `Missing model file ${relative(ROOT, source)}. The manifest lists it but it is not on disk.`
    );
    continue;
  }

  if (bytes.length !== spec.bytes) {
    errors.push(
      `${spec.path} is ${bytes.length} bytes but the manifest records ${spec.bytes}. ` +
        'Re-run `yarn generate:model-manifest`.'
    );
    continue;
  }

  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== spec.sha256) {
    errors.push(
      `${spec.path} has sha256 ${digest} but the manifest pins ${spec.sha256}. ` +
        'Re-run `yarn generate:model-manifest`.'
    );
    continue;
  }

  await writeFile(join(OUT_DIR, spec.asset), bytes);
}

if (errors.length > 0) {
  console.error('Model packaging failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Staged ${manifest.files.length} model files (${(manifest.totalBytes / 1e6).toFixed(2)} MB) in ${relative(ROOT, OUT_DIR)}/.`
);
console.log(
  'Upload every file in that directory as an asset of the matching v<version> release.'
);
