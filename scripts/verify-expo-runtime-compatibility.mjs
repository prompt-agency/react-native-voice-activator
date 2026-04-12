import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];

const examplePackageJson = JSON.parse(
  readFileSync(join(root, 'example/package.json'), 'utf8')
);
const appJson = JSON.parse(readFileSync(join(root, 'example/app.json'), 'utf8'));
const expoConfig = appJson.expo;

if (!expoConfig) {
  errors.push('example/app.json missing expo config.');
} else {
  if (expoConfig.slug !== 'voice-activator-example') {
    errors.push('example/app.json missing expected Expo slug.');
  }

  const pluginEntry = expoConfig.plugins?.find((plugin) => {
    return (
      plugin === 'react-native-voice-activator' ||
      plugin === '../app.plugin.js' ||
      (Array.isArray(plugin) &&
        (plugin[0] === 'react-native-voice-activator' ||
          plugin[0] === '../app.plugin.js'))
    );
  });

  if (!pluginEntry) {
    errors.push(
      'example/app.json missing react-native-voice-activator Expo plugin registration.'
    );
  }
}

const exampleDependencies = examplePackageJson.dependencies ?? {};
const exampleScripts = examplePackageJson.scripts ?? {};

if (!exampleDependencies.expo) {
  errors.push('example/package.json missing expo dependency.');
}

if (!exampleDependencies['expo-dev-client']) {
  errors.push('example/package.json missing expo-dev-client dependency.');
}

const requiredExampleScripts = {
  start: 'expo start',
  prebuild: 'CI=1 expo prebuild --clean',
  android: 'expo run:android',
  ios: 'expo run:ios',
};

for (const [scriptName, expectedValue] of Object.entries(requiredExampleScripts)) {
  if (exampleScripts[scriptName] !== expectedValue) {
    errors.push(
      `example/package.json missing Expo development-build script ${scriptName}: ${expectedValue}`
    );
  }
}

const expoSetup = readFileSync(join(root, 'docs/expo-setup.md'), 'utf8');
const exampleReadme = readFileSync(join(root, 'example/README.md'), 'utf8');

const requiredExpoSetupText = [
  'Expo Go is NOT supported.',
  'config-plugin and prebuild',
  'expo start',
  'expo run:ios',
  'expo run:android',
  'same public runtime API used by bare React Native consumers',
  'validation command that executes in CI against the example app',
  'prebuild --clean --no-install',
  'local plugin path (`../app.plugin.js`)',
  'still validate your own Expo-generated native app',
  'device matrix',
  'native toolchain',
];

for (const text of requiredExpoSetupText) {
  if (!expoSetup.includes(text)) {
    errors.push(`docs/expo-setup.md missing required text: ${text}`);
  }
}

const requiredExampleReadmeText = [
  'Expo config and prebuild compatibility contract',
  'expo start',
  'expo run:ios',
  'expo run:android',
  'expo prebuild',
  'example/app.json',
  'Expo Go is explicitly unsupported',
  'CI executes Expo config resolution against this example app',
  'CI executes Expo prebuild generation against a temporary copy of this example app',
];

for (const text of requiredExampleReadmeText) {
  if (!exampleReadme.includes(text)) {
    errors.push(`example/README.md missing required text: ${text}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Expo config and prebuild compatibility checks passed.');
}
