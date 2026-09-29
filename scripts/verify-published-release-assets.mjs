#!/usr/bin/env node
/**
 * Proves the published GitHub release actually carries every artifact this
 * package downloads at build time and at runtime.
 *
 * Neither the vendored binaries nor the ONNX models ship in the npm tarball.
 * The podspec's prepare_command, Gradle's fetchSherpaOnnxAar task and
 * prepareModels() each fetch from
 * `releases/download/v<version>/<asset>` and refuse any file whose SHA-256 is
 * not the one pinned in the matching manifest.
 *
 * verify-vendor-checksums.mjs --require-assets only proves the LOCAL build
 * artifacts match their manifest; it never touches the network, and release-it's
 * after:release hook deletes those local files immediately. So a failed or
 * partial asset upload produces a green release and a package that is broken for
 * every consumer, with nothing in the pipeline catching it. This script is that
 * missing check, and it is the last gate before announcing a version.
 *
 * Usage:
 *   node scripts/verify-published-release-assets.mjs            # full digest verification
 *   node scripts/verify-published-release-assets.mjs --quick    # existence + size only
 *   node scripts/verify-published-release-assets.mjs --version=0.2.0
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'prompt-agency/react-native-voice-activator';
const CONCURRENCY = 4;

const quick = process.argv.includes('--quick');
const versionArg = process.argv
  .find((arg) => arg.startsWith('--version='))
  ?.slice('--version='.length);

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'));
}

const pkg = await readJson('package.json');
const version = versionArg ?? pkg.version;
const baseUrl = `https://github.com/${REPO}/releases/download/v${version}`;

/** Every asset a consumer resolves, with the digest its manifest pins. */
async function collectExpectedAssets() {
  const assets = [];

  const ios = await readJson(join('ios', 'vendor-checksums.json'));
  for (const name of ['sherpa-onnx.xcframework.zip', 'sherpa-onnxruntime.xcframework.zip']) {
    assets.push({ source: 'iOS podspec', name, sha256: ios.assets?.[name] });
  }

  const android = await readJson(join('android', 'vendor-checksums.json'));
  for (const [name, sha256] of Object.entries(android.assets ?? {})) {
    assets.push({ source: 'Android Gradle', name, sha256 });
  }

  const models = await readJson(join('src', 'internal', 'model-manifest.json'));
  for (const spec of models.files) {
    assets.push({
      source: 'runtime prepareModels()',
      name: spec.asset,
      sha256: spec.sha256,
      bytes: spec.bytes,
    });
  }

  return assets;
}

async function verifyAsset(asset) {
  const url = `${baseUrl}/${asset.name}`;

  if (typeof asset.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(asset.sha256)) {
    return `${asset.name}: no valid sha256 pinned in its manifest, so the published asset cannot be verified.`;
  }

  let response;
  try {
    response = await fetch(url, { method: quick ? 'HEAD' : 'GET', redirect: 'follow' });
  } catch (cause) {
    return `${asset.name}: request failed (${cause.message}). Required by ${asset.source}.`;
  }

  if (!response.ok) {
    return `${asset.name}: HTTP ${response.status} at ${url}. Required by ${asset.source}. The release is missing this asset.`;
  }

  if (quick) {
    const length = Number(response.headers.get('content-length'));
    if (asset.bytes && Number.isFinite(length) && length !== asset.bytes) {
      return `${asset.name}: published size ${length} bytes, manifest records ${asset.bytes}.`;
    }
    return null;
  }

  const digest = createHash('sha256')
    .update(Buffer.from(await response.arrayBuffer()))
    .digest('hex');

  if (digest !== asset.sha256) {
    return (
      `${asset.name}: published asset has sha256 ${digest}, but its manifest pins ${asset.sha256}. ` +
      `Every ${asset.source} download will reject this file.`
    );
  }

  return null;
}

/** Bounded concurrency; the model bundle alone is ~7.8 MB across many files. */
async function runPool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    })
  );

  return results;
}

const assets = await collectExpectedAssets();

console.log(
  `Verifying ${assets.length} published release assets for v${version}` +
    `${quick ? ' (quick: existence and size only)' : ''}...`
);

const errors = (await runPool(assets, verifyAsset)).filter(Boolean);

if (errors.length > 0) {
  console.error(`\nPublished release asset verification FAILED for v${version}:`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    '\nA published npm version whose release assets are missing or mismatched is unusable:\n' +
      "  pod install fails closed on iOS, Gradle fails closed on Android, and prepareModels() rejects the download.\n" +
      `  Re-upload the assets to the v${version} release, then re-run this check before announcing.`
  );
  process.exit(1);
}

console.log(`All ${assets.length} published release assets resolve and match their manifests.`);
