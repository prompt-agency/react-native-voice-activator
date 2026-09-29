#!/usr/bin/env node
// Compiles and runs the host-side Objective-C++ checks under
// scripts/native-checks/.
//
// Our iOS sources have no test target, so behaviour that lives only in native
// code is normally verified by building the example app and running it on a
// device. That is slow, and it only exercises the paths the example app
// happens to take: the SherpaOnnxAssetLoader bug this check was written for
// broke the DEFAULT on-demand model flow while leaving the bundled-asset flow
// the example app uses working, so no amount of device testing would have
// surfaced it.
//
// The checks here are limited to sources that depend on Foundation alone, so
// they compile on the host with clang in under a second and need no simulator,
// no CocoaPods, and no sherpa-onnx.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Each check is one executable: a main() file plus the production sources it
 * exercises, compiled together.
 */
const CHECKS = [
  {
    name: 'SherpaOnnxAssetLoader root paths',
    sources: [
      'scripts/native-checks/sherpa-asset-loader-check.mm',
      'ios/Engines/SherpaOnnx/SherpaOnnxAssetLoader.mm',
    ],
    includes: ['ios/Engines/SherpaOnnx'],
  },
];

if (process.platform !== 'darwin') {
  console.log(
    'Skipping native checks: they need clang and the macOS Foundation framework.'
  );
  process.exit(0);
}

try {
  execFileSync('xcrun', ['--find', 'clang++'], { stdio: 'ignore' });
} catch {
  console.log('Skipping native checks: no clang++ in the active toolchain.');
  process.exit(0);
}

const buildDir = mkdtempSync(join(tmpdir(), 'va-native-checks-'));
let failed = false;

try {
  for (const check of CHECKS) {
    const binary = join(buildDir, check.name.replace(/\W+/g, '-'));
    const args = [
      '-fobjc-arc',
      '-fmodules',
      // The production sources are compiled with warnings-as-errors in the real
      // build; keep the host compile at least as strict so this never becomes a
      // place where a warning can hide.
      '-Wall',
      '-Wextra',
      '-Werror',
      '-framework',
      'Foundation',
      ...check.includes.flatMap((dir) => ['-I', join(repoRoot, dir)]),
      '-o',
      binary,
      ...check.sources.map((source) => join(repoRoot, source)),
    ];

    console.log(`\n${check.name}`);
    try {
      execFileSync('xcrun', ['clang++', ...args], { stdio: 'inherit' });
    } catch {
      console.error(`  compilation failed for ${check.name}`);
      failed = true;
      continue;
    }

    try {
      execFileSync(binary, { stdio: 'inherit' });
    } catch {
      failed = true;
    }
  }
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}

if (failed) {
  console.error('\nNative checks failed.');
  process.exit(1);
}

console.log('\nAll native checks passed.');
