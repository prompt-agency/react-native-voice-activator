import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const exampleRoot = join(root, 'example');
const expoBin = join(exampleRoot, 'node_modules', '.bin', 'expo');

if (!existsSync(expoBin)) {
  console.error('Expo CLI is not installed in example/node_modules/.bin/expo.');
  process.exit(1);
}

const tempRoot = mkdtempSync(join(tmpdir(), 'rnva-expo-prebuild-'));
const tempRepoRoot = join(tempRoot, 'repo');
const tempExampleRoot = join(tempRepoRoot, 'example');
const tempExpoHome = join(tempExampleRoot, '.expo-home');

mkdirSync(tempRepoRoot, { recursive: true });
mkdirSync(tempExpoHome, { recursive: true });

cpSync(exampleRoot, tempExampleRoot, {
  recursive: true,
  filter: (source) => {
    return !source.includes(`${join(exampleRoot, 'node_modules')}`);
  },
});

for (const relativePath of ['app.plugin.js', 'package.json', 'plugin']) {
  cpSync(join(root, relativePath), join(tempRepoRoot, relativePath), {
    recursive: true,
  });
}

symlinkSync(join(exampleRoot, 'node_modules'), join(tempExampleRoot, 'node_modules'));
symlinkSync(join(root, 'node_modules'), join(tempRepoRoot, 'node_modules'));

const result = spawnSync(
  expoBin,
  ['prebuild', '--clean', '--no-install', '--platform', 'all'],
  {
    cwd: tempExampleRoot,
    env: {
      ...process.env,
      CI: '1',
      EXPO_NO_TELEMETRY: '1',
      HOME: tempExpoHome,
    },
    encoding: 'utf8',
  }
);

if (result.status !== 0) {
  const stderr = result.stderr?.trim();
  const stdout = result.stdout?.trim();
  console.error(stderr || stdout || 'Expo prebuild validation failed with no output.');
  rmSync(tempRoot, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

const iosDir = join(tempExampleRoot, 'ios');
const androidDir = join(tempExampleRoot, 'android');
if (!existsSync(iosDir) || !existsSync(androidDir)) {
  console.error('Expo prebuild validation did not generate both ios and android directories.');
  rmSync(tempRoot, { recursive: true, force: true });
  process.exit(1);
}

console.log(`Expo prebuild validation passed for ${resolve(tempExampleRoot)}`);
rmSync(tempRoot, { recursive: true, force: true });
