#!/usr/bin/env node
/**
 * Packages the vendored SherpaOnnx xcframeworks into the release-asset zips and
 * records their SHA-256 digests in `ios/vendor-checksums.json`.
 *
 * The xcframeworks are too large to ship inside the npm tarball, so the podspec
 * downloads them at `pod install` time. That download is only as trustworthy as
 * what verifies it, hence the manifest: it is committed, ships inside the npm
 * tarball (which npm integrity-checks), and pins the exact bytes the podspec
 * will accept.
 *
 * Zip output is not byte-reproducible (entry order and mtimes vary per
 * checkout), so the digests are only meaningful for the exact zips this run
 * produced. Those same files must be the ones uploaded as release assets.
 * `release-it`'s before:init hook re-verifies that before publishing.
 *
 * Run this whenever the vendored frameworks change, then COMMIT the manifest.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = join(ROOT, 'ios', 'Vendor', 'SherpaOnnx');
const MANIFEST_PATH = join(ROOT, 'ios', 'vendor-checksums.json');

const FRAMEWORKS = [
  { framework: 'sherpa-onnx.xcframework', asset: 'sherpa-onnx.xcframework.zip' },
  {
    framework: 'sherpa-onnxruntime.xcframework',
    asset: 'sherpa-onnxruntime.xcframework.zip',
  },
];

async function sha256File(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function main() {
  for (const { framework } of FRAMEWORKS) {
    try {
      await stat(join(VENDOR_DIR, framework));
    } catch {
      throw new Error(
        `[package-ios-vendor-frameworks] Missing ${framework} in ios/Vendor/SherpaOnnx.\n` +
          'Run `git lfs pull` to fetch the vendored binaries before packaging.'
      );
    }
  }

  const checksums = {};
  for (const { framework, asset } of FRAMEWORKS) {
    const assetPath = join(ROOT, asset);
    console.log(`[package-ios-vendor-frameworks] Zipping ${framework}...`);
    execFileSync('zip', ['-qr', assetPath, framework], { cwd: VENDOR_DIR });
    checksums[asset] = await sha256File(assetPath);
    console.log(`[package-ios-vendor-frameworks] ${asset}  ${checksums[asset]}`);
  }

  const manifest = { algorithm: 'sha256', assets: checksums };

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    '[package-ios-vendor-frameworks] Wrote ios/vendor-checksums.json.\n' +
      'Commit it, and upload these exact zips as the release assets.'
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
