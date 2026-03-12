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
    'Assistant flow guide',
    'Preview STT adapter',
    'Preview TTS adapter',
    'wakeWordDetected',
    'application-level reference provider',
    'createReferenceProviders',
    'referenceProviderCatalog',
    'createDemoReferenceSttBridge',
    'createDemoReferenceTtsBridge',
    'transcriptionStarted',
    'transcriptionResult',
    'speechStarted',
    'speechCompleted',
    'Bundled keyword presets',
    'Keyword detection status',
    'selectedKeywordPresetId',
    'activeKeywordPresetId',
    'keywordAssetKey',
    'All bundled phrases',
    'HELLO WORLD',
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

  if (!exampleAppSource.includes('initialize({')) {
    errors.push(
      'Example app does not configure reference providers through initialize({...}).'
    );
  }

  if (!exampleAppSource.includes('sttProvider: referenceProviders.sttProvider')) {
    errors.push(
      'Example app does not pass the STT reference provider through the public initialize options.'
    );
  }

  if (!exampleAppSource.includes('ttsProvider: referenceProviders.ttsProvider')) {
    errors.push(
      'Example app does not pass the TTS reference provider through the public initialize options.'
    );
  }

  if (!exampleAppSource.includes('autoSpeak: true')) {
    errors.push(
      'Example app does not demonstrate the runtime-owned autoSpeak provider orchestration path.'
    );
  }

  if (!exampleAppSource.includes('engineConfig: {')) {
    errors.push(
      'Example app does not configure engineConfig through initialize({...}).'
    );
  }

  if (!exampleAppSource.includes('keywordAssetKey: selectedKeywordPreset.keywordAssetKey')) {
    errors.push(
      'Example app does not pass the selected bundled keyword preset through engineConfig.assetKeys.keywordAssetKey.'
    );
  }

  if (!exampleAppSource.includes('simulated host implementation to preview the contract')) {
    errors.push(
      'Example app does not explain that the adapter preview is an application-owned simulated host implementation.'
    );
  }

  const requiredExampleLimitationText = [
    'The package-owned native runtime detects a wake phrase.',
    'Active preset:',
    'Selected preset:',
    'Asset key:',
    'Detected phrase:',
    'Keyword selection changed. Run Initialize again before Start detection',
    'The optional application-owned STT provider can turn that wake',
    'This screen shows the package wake runtime plus separate simulated',
    'The wake step is real package behavior.',
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
    'after a successful STT result when `autoSpeak: true` is enabled.',
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

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Example setup checks passed.');
}
