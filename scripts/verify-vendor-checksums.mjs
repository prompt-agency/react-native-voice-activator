#!/usr/bin/env node
/**
 * Guards the vendored-binary integrity manifests for both platforms.
 *
 * Neither platform ships its Sherpa-ONNX binary inside the npm tarball. The
 * podspec's prepare_command downloads the iOS XCFrameworks and Gradle's
 * fetchSherpaOnnxAar task downloads the Android AAR, and both refuse any file
 * whose SHA-256 is not the one pinned in the matching manifest. A missing or
 * malformed manifest is therefore a release blocker, not a warning.
 *
 * Pass `--require-assets` (as the release hook does) to additionally demand that
 * the release artifacts exist locally and match their manifest. That is the
 * check that catches the real hazard: publishing an artifact that was rebuilt
 * after the manifest was written, which would make every consumer's build reject
 * the download.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORMS = [
  {
    label: 'iOS',
    manifest: join('ios', 'vendor-checksums.json'),
    regenerate: 'yarn package:ios-vendor',
    // Release zips are produced at the repo root by package:ios-vendor.
    assets: [
      { name: 'sherpa-onnx.xcframework.zip', localPath: 'sherpa-onnx.xcframework.zip' },
      {
        name: 'sherpa-onnxruntime.xcframework.zip',
        localPath: 'sherpa-onnxruntime.xcframework.zip',
      },
    ],
  },
  {
    label: 'Android',
    manifest: join('android', 'vendor-checksums.json'),
    regenerate: 'update android/vendor-checksums.json with the AAR sha256',
    assets: [
      {
        name: 'sherpa-onnx-static-link-onnxruntime-1.12.29.aar',
        localPath: join('android', 'libs', 'sherpa-onnx-static-link-onnxruntime-1.12.29.aar'),
      },
    ],
  },
];

const errors = [];
const requireAssets = process.argv.includes('--require-assets');

async function checkPlatform(platform) {
  const manifestPath = join(ROOT, platform.manifest);

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    errors.push(
      `Missing or unreadable ${platform.manifest}. Fix it with: ${platform.regenerate}.`
    );
    return;
  }

  if (manifest.algorithm !== 'sha256') {
    errors.push(
      `${platform.manifest} declares algorithm "${manifest.algorithm}"; expected "sha256".`
    );
  }

  for (const asset of platform.assets) {
    const digest = manifest.assets?.[asset.name];
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
      errors.push(
        `${platform.manifest} is missing a valid sha256 for "${asset.name}".`
      );
      continue;
    }

    // When the artifact is present, prove the manifest actually describes it
    // rather than trusting the recorded value.
    let bytes;
    try {
      bytes = await readFile(join(ROOT, asset.localPath));
    } catch {
      if (requireAssets) {
        errors.push(
          `Release asset ${asset.localPath} is missing. Fix it with: ${platform.regenerate}.`
        );
      }
      // Outside a release run the artifact may legitimately be absent; the
      // manifest stands alone.
      continue;
    }

    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== digest) {
      errors.push(
        `Local ${asset.localPath} has sha256 ${actual}, but ${platform.manifest} pins ${digest}. ` +
          `Fix it with: ${platform.regenerate}.`
      );
    }
  }
}

async function main() {
  for (const platform of PLATFORMS) {
    await checkPlatform(platform);
  }
}

await main();

if (errors.length > 0) {
  console.error('Vendor checksum verification failed:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log('Vendor checksum manifest checks passed (iOS + Android).');
