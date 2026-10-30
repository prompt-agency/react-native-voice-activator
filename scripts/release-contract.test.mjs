import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedAssets, releaseNotes, verifyReleaseMetadata } from './release-contract.mjs';

const digest = 'a'.repeat(64);
const ios = { algorithm: 'sha256', assets: { ios: digest } };
const android = { algorithm: 'sha256', assets: { android: digest } };
const models = {
  files: Array.from({ length: 16 }, (_, index) => ({
    asset: `model-${index}`,
    sha256: digest,
    bytes: 10,
  })),
};
const assets = expectedAssets(ios, android, models);
const release = {
  tagName: 'v0.2.2',
  assets: [...assets].map(([name, spec]) => ({
    name,
    digest: `sha256:${spec.sha256}`,
    size: spec.size ?? 20,
    state: 'uploaded',
  })),
};

test('release notes are limited to the matching version', () => {
  const changelog = '# Changelog\n\n## [0.2.2] (today)\n\nFixes\n\n## [0.2.1] (yesterday)\n\nOld';
  assert.equal(releaseNotes(changelog, '0.2.2'), '## [0.2.2] (today)\n\nFixes');
  assert.throws(() => releaseNotes(changelog, '0.2.3'), /no section/);
});

test('release metadata matches the exact expected asset set', () => {
  assert.doesNotThrow(() => verifyReleaseMetadata(release, assets, 'v0.2.2'));
  assert.throws(() => verifyReleaseMetadata({ ...release, assets: release.assets.slice(1) }, assets, 'v0.2.2'), /Missing/);
  assert.throws(() => verifyReleaseMetadata({ ...release, assets: [...release.assets, release.assets[0]] }, assets, 'v0.2.2'), /Duplicate/);
  assert.throws(() => verifyReleaseMetadata({ ...release, assets: [...release.assets, { name: 'extra' }] }, assets, 'v0.2.2'), /Unexpected/);
  assert.throws(() => verifyReleaseMetadata({ ...release, tagName: 'v0.2.3' }, assets, 'v0.2.2'), /tag/);
});

test('release metadata rejects corruption and incomplete uploads', () => {
  for (const change of [
    { digest: `sha256:${'b'.repeat(64)}` },
    { size: 11 },
    { state: 'new' },
  ]) {
    const changed = { ...release.assets.at(-1), ...change };
    assert.throws(() => verifyReleaseMetadata({ ...release, assets: [...release.assets.slice(0, -1), changed] }, assets, 'v0.2.2'));
  }
});
