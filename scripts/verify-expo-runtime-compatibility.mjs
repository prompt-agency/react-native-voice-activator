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

const requiredExactExampleScripts = {
  start: 'expo start',
};

for (const [scriptName, expectedValue] of Object.entries(
  requiredExactExampleScripts
)) {
  if (exampleScripts[scriptName] !== expectedValue) {
    errors.push(
      `example/package.json missing Expo development-build script ${scriptName}: ${expectedValue}`
    );
  }
}

// Every script that prebuilds must be non-interactive and must not let prebuild
// run its own package install. Checked as a property of all of them rather than
// as the exact text of the `prebuild` script, because pinning one script's text
// is what let the run scripts be added later without either flag.
//
//   CI=1         prebuild prompts when it wants to resolve something, and an
//                unattended run then hangs instead of failing.
//   --no-install prebuild otherwise runs its own package install, which in this
//                Yarn workspace re-resolves the `portal:` link pointing at the
//                library under development.
const prebuildScriptEntries = Object.entries(exampleScripts).filter(
  ([, command]) => typeof command === 'string' && command.includes('expo prebuild')
);

if (prebuildScriptEntries.length === 0) {
  errors.push('example/package.json has no script that runs expo prebuild.');
}

for (const [scriptName, command] of prebuildScriptEntries) {
  if (!command.includes('CI=1')) {
    errors.push(
      `example/package.json script ${scriptName} runs expo prebuild without CI=1, so it can prompt and hang.`
    );
  }
  if (!command.includes('--no-install')) {
    errors.push(
      `example/package.json script ${scriptName} runs expo prebuild without --no-install, so prebuild may re-resolve the portal: link to the library.`
    );
  }
}

// A device UDID or Apple team pinned into the repo belongs to one developer's
// machine and account; for everyone else it is a "device not found" or a
// signing failure against a team they are not a member of.
for (const [scriptName, command] of Object.entries(exampleScripts)) {
  if (typeof command === 'string' && /--device\s+\S/.test(command)) {
    errors.push(
      `example/package.json script ${scriptName} pins a device UDID. Pass --device with no value so Expo prompts for an attached device.`
    );
  }
}

// The run scripts must invoke an Expo development build rather than Expo Go,
// but they are allowed to prefix it. They currently run `expo prebuild` first,
// because `expo run:<platform>` only prebuilds when the native directory is
// absent: with a stale ios/ or android/ present it builds that as-is, so a
// change in app.json or a config plugin never reaches the built app.
const requiredExampleRunCommands = {
  android: 'expo run:android',
  ios: 'expo run:ios',
};

for (const [scriptName, requiredCommand] of Object.entries(
  requiredExampleRunCommands
)) {
  if (!(exampleScripts[scriptName] ?? '').includes(requiredCommand)) {
    errors.push(
      `example/package.json script ${scriptName} must invoke ${requiredCommand}`
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
