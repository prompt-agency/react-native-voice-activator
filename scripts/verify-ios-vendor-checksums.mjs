#!/usr/bin/env node
/**
 * Guards the iOS vendored-framework integrity manifest.
 *
 * The podspec refuses any downloaded xcframework whose SHA-256 is not listed in
 * `ios/vendor-checksums.json`, so a missing or malformed manifest is a release
 * blocker rather than a warning.
 *
 * Pass `--require-assets` (as the release hook does) to additionally demand
 * that the release zips exist locally and match the manifest. That is the check
 * that catches the real hazard: publishing assets that were re-zipped after the
 * manifest was written, which would make every consumer's `pod install` reject
 * the download.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(ROOT, 'ios', 'vendor-checksums.json');

const REQUIRED_ASSETS = [
  'sherpa-onnx.xcframework.zip',
  'sherpa-onnxruntime.xcframework.zip',
];

const errors = [];
const requireAssets = process.argv.includes('--require-assets');

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    errors.push(
      'Missing or unreadable ios/vendor-checksums.json. Run `yarn package:ios-vendor` and commit the result.'
    );
    return;
  }

  if (manifest.algorithm !== 'sha256') {
    errors.push(
      `ios/vendor-checksums.json declares algorithm "${manifest.algorithm}"; expected "sha256".`
    );
  }

  for (const asset of REQUIRED_ASSETS) {
    const digest = manifest.assets?.[asset];
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
      errors.push(
        `ios/vendor-checksums.json is missing a valid sha256 for "${asset}".`
      );
      continue;
    }

    // When the release zip is present, prove the manifest actually describes it
    // rather than trusting the recorded value.
    let bytes;
    try {
      bytes = await readFile(join(ROOT, asset));
    } catch {
      if (requireAssets) {
        errors.push(
          `Release asset ${asset} is missing. Run \`yarn package:ios-vendor\` before releasing.`
        );
      }
      // Outside a release run the zips are absent; the manifest stands alone.
      continue;
    }

    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== digest) {
      errors.push(
        `Local ${asset} has sha256 ${actual}, but the manifest pins ${digest}. ` +
          'Re-run `yarn package:ios-vendor` and commit the regenerated manifest.'
      );
    }
  }
}

await main();

if (errors.length > 0) {
  console.error('iOS vendor checksum verification failed:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log('iOS vendor checksum manifest checks passed.');
