#!/usr/bin/env node
/**
 * Generates src/internal/model-manifest.json from the model assets on disk.
 *
 * The models are not shipped in the npm tarball — they are uploaded as release
 * assets and downloaded once, at runtime, by prepareModels(). This manifest is
 * what the runtime verifies each downloaded file against, so it must be
 * regenerated and committed whenever a model changes, and the files it describes
 * must be the exact ones attached to the release.
 *
 * Both platforms share one set of files: the assets under ios/Assets and
 * android/src/main/assets are byte-identical copies of the same models, which is
 * why they were duplicated in the tarball in the first place.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = join(ROOT, 'ios', 'Assets');
const OUTPUT = join(ROOT, 'src', 'internal', 'model-manifest.json');

/**
 * Bumped by hand when the model set changes. The runtime stores files under a
 * directory named for this value, so a bump means a clean re-download rather
 * than a mix of old and new files.
 */
const BUNDLE_VERSION = '1';

/** Excluded because the runtime never loads them. */
const EXCLUDE = [
  // The fp32 variants; only int8 is used on device.
  /-epoch-12-avg-2-chunk-16-left-64\.onnx$/,
  /\/test_wavs\//,
  /README\.md$/,
  // keywords.txt and keywords_raw.txt are the upstream demo aggregate files;
  // the per-phrase keywords-*.txt files are what keywordAssetKey selects.
  /\/keywords_raw\.txt$/,
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const all = await walk(SOURCE_ROOT);

const files = [];
for (const full of all) {
  const rel = relative(SOURCE_ROOT, full).split('\\').join('/');
  if (EXCLUDE.some((pattern) => pattern.test(`/${rel}`))) continue;

  const bytes = await readFile(full);
  files.push({
    // Where the file lives inside the model directory on device.
    path: rel,
    // GitHub release asset names cannot contain slashes, so each file is
    // uploaded under a flattened name and mapped back on download.
    asset: rel.replace(/\//g, '__'),
    bytes: (await stat(full)).size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

files.sort((a, b) => a.path.localeCompare(b.path));

const total = files.reduce((sum, f) => sum + f.bytes, 0);

const manifest = {
  bundleVersion: BUNDLE_VERSION,
  algorithm: 'sha256',
  totalBytes: total,
  files,
};

await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `Wrote ${relative(ROOT, OUTPUT)}: ${files.length} files, ${(total / 1e6).toFixed(2)} MB, bundleVersion ${BUNDLE_VERSION}.`
);
for (const f of files) {
  console.log(`  ${(f.bytes / 1e6).toFixed(2).padStart(6)} MB  ${f.path}`);
}
