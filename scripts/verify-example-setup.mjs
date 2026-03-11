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

if (!existsSync(exampleAppPath)) {
  errors.push('Example app entrypoint does not exist at example/src/App.tsx.');
} else {
  const exampleAppSource = readFileSync(exampleAppPath, 'utf8');
  const normalizedExampleAppSource = exampleAppSource.replace(/\s+/g, ' ');
  const requiredApiUsage = [
    'addWakeWordListener',
    'getStatus',
    'initialize',
    'startDetection',
    'stopDetection',
    'dispose',
    'interruption',
    'audioRouteChanged',
    'syncDiagnosticsFromStatus',
    'getStatus().lastError',
    'Optional STT/TTS extension examples',
    'Run STT handoff example',
    'Run TTS response example',
    'wakeWordDetected',
    'application-level extension examples',
  ];

  for (const token of requiredApiUsage) {
    if (!exampleAppSource.includes(token)) {
      errors.push(`Example app does not reference ${token}.`);
    }
  }

  if (exampleAppSource.includes('setLastError(null);')) {
    errors.push(
      'Example app clears lastError optimistically instead of mirroring getStatus().lastError.'
    );
  }

  if (!exampleAppSource.includes('void runSttExtensionFromDetection(event)')) {
    errors.push(
      'Example app does not trigger the STT extension from the public wakeWordDetected event.'
    );
  }

  if (!exampleAppSource.includes('setSttTranscript(null);')) {
    errors.push(
      'Example app does not clear stale STT transcript state when a new wake word is detected.'
    );
  }

  if (!exampleAppSource.includes('setTtsResponse(null);')) {
    errors.push(
      'Example app does not clear stale TTS response state when a new wake word is detected.'
    );
  }

  const requiredExampleLimitationText = [
    'iOS background continuation still requires the audio',
    'background mode and does not survive force-quit.',
    'Android background continuation requires a visible app context',
    'Recent runtime events',
    'Normalized error categories',
    'permission',
    'lifecycle',
    'configuration',
    'engine',
    'platform',
    'internal',
  ];

  for (const text of requiredExampleLimitationText) {
    if (!normalizedExampleAppSource.includes(text)) {
      errors.push(
        `Example app does not document the current runtime limitation text: ${text}`
      );
    }
  }
}

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

if (!existsSync(exampleReadmePath)) {
  errors.push('Example README does not exist at example/README.md.');
} else {
  const exampleReadme = readFileSync(exampleReadmePath, 'utf8');
  const requiredReadmeText = [
    '../docs/bare-react-native-setup.md',
    '../docs/expo-setup.md',
    '../scripts/release-support-matrix.ts',
    'local plugin path (`../app.plugin.js`)',
    'current runtime diagnostics',
    'recent runtime events',
    'normalized error categories',
    'optional STT/TTS extension points',
    'application-level examples only',
  ];

  for (const text of requiredReadmeText) {
    if (!exampleReadme.includes(text)) {
      errors.push(`Example README missing required text: ${text}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Example setup checks passed.');
}
