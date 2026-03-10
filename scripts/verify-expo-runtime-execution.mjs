import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const exampleRoot = join(root, 'example');
const expoHome = join(exampleRoot, '.expo-home');
const expoBin = join(exampleRoot, 'node_modules', '.bin', 'expo');

if (!existsSync(expoBin)) {
  console.error('Expo CLI is not installed in example/node_modules/.bin/expo.');
  process.exit(1);
}

mkdirSync(expoHome, { recursive: true });

const result = spawnSync(
  expoBin,
  ['config', '--type', 'prebuild', '--json'],
  {
    cwd: exampleRoot,
    env: {
      ...process.env,
      CI: '1',
      EXPO_NO_TELEMETRY: '1',
      HOME: expoHome,
    },
    encoding: 'utf8',
  }
);

if (result.status !== 0) {
  const stderr = result.stderr?.trim();
  const stdout = result.stdout?.trim();
  console.error(
    stderr || stdout || 'Expo prebuild-config validation failed with no output.'
  );
  process.exit(result.status ?? 1);
}

const output = result.stdout.trim();
if (!output) {
  console.error('Expo prebuild-config validation produced no JSON output.');
  process.exit(1);
}

let parsedConfig;

try {
  parsedConfig = JSON.parse(output);
} catch (error) {
  console.error('Expo prebuild-config validation did not return valid JSON.');
  console.error(String(error));
  process.exit(1);
}

if (parsedConfig.slug !== 'voice-activator-example') {
  console.error('Expo config validation returned an unexpected app slug.');
  process.exit(1);
}

const pluginHistory = parsedConfig?._internal?.pluginHistory ?? {};
if (!pluginHistory['react-native-voice-activator']) {
  console.error(
    'Expo config validation did not resolve the react-native-voice-activator plugin.'
  );
  process.exit(1);
}

const pluginEntry = parsedConfig.plugins?.find((plugin) => {
  return Array.isArray(plugin) && plugin[0] === '../app.plugin.js';
});

if (!pluginEntry) {
  console.error(
    'Expo config validation did not preserve the expected local plugin registration.'
  );
  process.exit(1);
}

console.log(
  `Expo runtime execution validation passed for ${resolve(exampleRoot)}`
);
