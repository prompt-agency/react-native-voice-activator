import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const examplePackageJson = JSON.parse(
  readFileSync(join(root, 'example/package.json'), 'utf8')
);
const exampleAppConfig = JSON.parse(
  readFileSync(join(root, 'example/app.json'), 'utf8')
);
const exampleReadmePath = join(root, 'example/README.md');
const exampleIndexPath = join(root, 'example/index.js');
const exampleBabelConfigPath = join(root, 'example/babel.config.js');

const errors = [];
const exampleAppPath = join(root, 'example/src/App.tsx');
const exampleAppConfigPath = join(root, 'example/app.json');

if (packageJson.name !== 'react-native-voice-activator') {
  errors.push('Root package name is not react-native-voice-activator.');
}

if (!packageJson.workspaces?.includes('example')) {
  errors.push('Root workspaces do not include example.');
}

if (examplePackageJson.name !== 'react-native-voice-activator-example') {
  errors.push('Example package name is not react-native-voice-activator-example.');
}

// ─── Example source files ─────────────────────────────────────────────────────

if (!existsSync(exampleAppPath)) {
  errors.push('Example app entrypoint does not exist at example/src/App.tsx.');
} else {
  const appSource = readFileSync(exampleAppPath, 'utf8');

  // App.tsx must wire the three screens
  const requiredInApp = [
    'WakeWordScreen',
    'SessionScreen',
    'ManualScreen',
  ];

  for (const token of requiredInApp) {
    if (!appSource.includes(token)) {
      errors.push(`App.tsx does not reference ${token}.`);
    }
  }
}

// ─── WakeWordScreen ───────────────────────────────────────────────────────────

const wakeWordScreenPath = join(root, 'example/src/screens/WakeWordScreen.tsx');

if (!existsSync(wakeWordScreenPath)) {
  errors.push('WakeWordScreen.tsx does not exist at example/src/screens/WakeWordScreen.tsx.');
} else {
  const src = readFileSync(wakeWordScreenPath, 'utf8');

  const required = [
    'addWakeWordListener',
    'getStatus',
    'initialize',
    'startDetection',
    'stopDetection',
    'dispose',
    'wakeWordDetected',
    'interruption',
    'audioRouteChanged',
    'builtInSTT',
    'builtInTTS',
    'autoSpeak: true',
    'engineConfig',
    'keywordAssetKey',
    'Bundled keyword presets',
    'Keyword detection status',
    'All bundled phrases',
    'HELLO WORLD',
    'Keyword selection changed. Run Initialize again before Start detection',
    'iOS background continuation still requires the audio',
    'Android background continuation requires a visible app context',
    'Recent runtime events',
  ];

  for (const token of required) {
    if (!src.includes(token)) {
      errors.push(`WakeWordScreen.tsx does not reference: ${token}`);
    }
  }
}

// ─── SessionScreen ────────────────────────────────────────────────────────────

const sessionScreenPath = join(root, 'example/src/screens/SessionScreen.tsx');

if (!existsSync(sessionScreenPath)) {
  errors.push('SessionScreen.tsx does not exist at example/src/screens/SessionScreen.tsx.');
} else {
  const src = readFileSync(sessionScreenPath, 'utf8');

  const required = [
    'useVoiceSession',
    'aiHandler',
    'reListenMode',
    'builtInSTT',
    'builtInTTS',
    'initialize',
    'startDetection',
    'dispose',
  ];

  for (const token of required) {
    if (!src.includes(token)) {
      errors.push(`SessionScreen.tsx does not reference: ${token}`);
    }
  }
}

// ─── ManualScreen ─────────────────────────────────────────────────────────────

const manualScreenPath = join(root, 'example/src/screens/ManualScreen.tsx');

if (!existsSync(manualScreenPath)) {
  errors.push('ManualScreen.tsx does not exist at example/src/screens/ManualScreen.tsx.');
} else {
  const src = readFileSync(manualScreenPath, 'utf8');

  const required = [
    'RunAnywhereSTTAdapter',
    'RunAnywhereTTSAdapter',
    'transcribe',
    'speak',
  ];

  for (const token of required) {
    if (!src.includes(token)) {
      errors.push(`ManualScreen.tsx does not reference: ${token}`);
    }
  }
}

// ─── index.js ─────────────────────────────────────────────────────────────────

if (!existsSync(exampleAppConfigPath)) {
  errors.push('Example app config does not exist at example/app.json.');
}

if (!existsSync(exampleIndexPath)) {
  errors.push('Example app index does not exist at example/index.js.');
} else {
  const exampleIndexSource = readFileSync(exampleIndexPath, 'utf8');

  if (!exampleIndexSource.includes("registerRootComponent(App)")) {
    errors.push('Example app index does not register the Expo root component.');
  }

  if (exampleIndexSource.includes('AppRegistry.registerComponent')) {
    errors.push(
      'Example app index uses AppRegistry.registerComponent instead of Expo root registration.'
    );
  }
}

// ─── Babel config ─────────────────────────────────────────────────────────────

if (!existsSync(exampleBabelConfigPath)) {
  errors.push('Example Babel config does not exist at example/babel.config.js.');
} else {
  const exampleBabelConfigSource = readFileSync(exampleBabelConfigPath, 'utf8');

  if (!exampleBabelConfigSource.includes("presets: ['babel-preset-expo']")) {
    errors.push('Example Babel config does not use babel-preset-expo.');
  }

  if (exampleBabelConfigSource.includes('react-native-builder-bob/babel-config')) {
    errors.push(
      'Example Babel config still uses react-native-builder-bob/babel-config.'
    );
  }
}

// ─── app.json plugin registration ────────────────────────────────────────────

const registeredPlugins = exampleAppConfig.expo?.plugins;
const usesLocalPluginPath = Array.isArray(registeredPlugins)
  ? registeredPlugins.some((plugin) => {
      if (typeof plugin === 'string') {
        return plugin === '../app.plugin.js';
      }

      return Array.isArray(plugin) && plugin[0] === '../app.plugin.js';
    })
  : false;

if (!usesLocalPluginPath) {
  errors.push('Example app config does not register ../app.plugin.js.');
}

// ─── README ───────────────────────────────────────────────────────────────────

if (!existsSync(exampleReadmePath)) {
  errors.push('Example README does not exist at example/README.md.');
} else {
  const exampleReadme = readFileSync(exampleReadmePath, 'utf8');
  const requiredReadmeText = [
    '../docs/bare-react-native-setup.md',
    '../docs/expo-setup.md',
    '../scripts/release-support-matrix.ts',
    'local plugin path (`../app.plugin.js`)',
    'Sherpa asset manifest',
    'package-owned Sherpa native asset bundle',
    'Expo example config: app.json registers the local plugin path',
    'current runtime diagnostics',
    'recent runtime events',
    'normalized error categories',
    'optional STT/TTS extension points',
    'application-level examples only',
    '../docs/examples/',
  ];

  for (const text of requiredReadmeText) {
    if (!exampleReadme.includes(text)) {
      errors.push(`Example README missing required text: ${text}`);
    }
  }
}

// ─── Result ───────────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Example setup checks passed.');
}
