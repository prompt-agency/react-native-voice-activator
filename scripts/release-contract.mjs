#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(path) {
  return JSON.parse(await readFile(join(ROOT, path), 'utf8'));
}

export function releaseNotes(changelog, version) {
  const escaped = version.replaceAll('.', '\\.');
  const header = new RegExp(`^#{1,2} \\[${escaped}\\][^\\n]*$`, 'm');
  const match = header.exec(changelog);
  if (!match) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const next = /^#{1,2} \[/gm;
  next.lastIndex = match.index + match[0].length;
  const end = next.exec(changelog)?.index ?? changelog.length;
  const body = changelog.slice(match.index, end).trim();
  if (!body.includes('\n')) throw new Error(`CHANGELOG.md section for ${version} is empty`);
  return body;
}

export function expectedAssets(ios, android, models) {
  const assets = new Map();
  for (const manifest of [ios, android]) {
    if (manifest.algorithm !== 'sha256') throw new Error('Vendor manifest must use sha256');
    for (const [name, sha256] of Object.entries(manifest.assets ?? {})) {
      if (assets.has(name)) throw new Error(`Duplicate expected asset: ${name}`);
      assets.set(name, { sha256 });
    }
  }
  for (const model of models.files ?? []) {
    if (assets.has(model.asset)) throw new Error(`Duplicate expected asset: ${model.asset}`);
    assets.set(model.asset, { sha256: model.sha256, size: model.bytes });
  }
  if (assets.size < 4) throw new Error('Release manifests contain too few assets');
  for (const [name, spec] of assets) {
    if (!/^[0-9a-f]{64}$/.test(spec.sha256 ?? '')) {
      throw new Error(`Invalid sha256 for ${name}`);
    }
  }
  return assets;
}

export function verifyReleaseMetadata(release, assets, tag) {
  if (release.tagName !== tag) throw new Error(`Release tag is ${release.tagName}, expected ${tag}`);
  const actual = new Map();
  for (const asset of release.assets ?? []) {
    if (actual.has(asset.name)) throw new Error(`Duplicate uploaded asset: ${asset.name}`);
    actual.set(asset.name, asset);
  }
  for (const [name, spec] of assets) {
    const asset = actual.get(name);
    if (!asset) throw new Error(`Missing uploaded asset: ${name}`);
    if (asset.state !== 'uploaded') throw new Error(`Asset ${name} is ${asset.state}`);
    if (asset.digest !== `sha256:${spec.sha256}`) {
      throw new Error(`Uploaded asset ${name} has wrong sha256`);
    }
    if (spec.size !== undefined && asset.size !== spec.size) {
      throw new Error(`Uploaded asset ${name} has wrong size`);
    }
  }
  for (const name of actual.keys()) {
    if (!assets.has(name)) throw new Error(`Unexpected uploaded asset: ${name}`);
  }
}

async function main() {
  const command = process.argv[2];
  const pkg = await readJson('package.json');
  const manifest = await readJson('.release-please-manifest.json');
  if (manifest['.'] !== pkg.version) {
    throw new Error(`Release manifest ${manifest['.']} differs from package ${pkg.version}`);
  }
  const notes = releaseNotes(await readFile(join(ROOT, 'CHANGELOG.md'), 'utf8'), pkg.version);
  if (command === 'check') {
    console.log(`Release contract valid for v${pkg.version}`);
  } else if (command === 'notes') {
    const output = process.argv[3];
    if (!output) throw new Error('Pass an output file for release notes');
    await writeFile(output, `${notes}\n`);
  } else if (command === 'verify-metadata') {
    const input = process.argv[3];
    if (!input) throw new Error('Pass a release JSON file');
    const assets = expectedAssets(
      await readJson('ios/vendor-checksums.json'),
      await readJson('android/vendor-checksums.json'),
      await readJson('src/internal/model-manifest.json')
    );
    verifyReleaseMetadata(JSON.parse(await readFile(input, 'utf8')), assets, `v${pkg.version}`);
    console.log(`All ${assets.size} release assets match their manifests.`);
  } else {
    throw new Error('Usage: release-contract.mjs check|notes FILE|verify-metadata FILE');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
