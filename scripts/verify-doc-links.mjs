import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredDocs = [
  'docs/getting-started.md',
  'docs/bare-react-native-setup.md',
  'docs/expo-setup.md',
  // Presence check only; does not crawl markdown links inside the file.
  'docs/model-training/wake-word-training.md',
  'docs/model-training/tts-voice-cloning.md',
  'docs/examples/index.md',
  'docs/examples/expo-speech-tts-provider.md',
  'docs/examples/expo-speech-recognition-stt-provider.md',
  'docs/background-behavior.md',
  'docs/reliability-validation.md',
  'docs/troubleshooting.md',
  'docs/migration.md',
  'docs/android-battery-optimization.md',
  'docs/android-tts-setup.md',
  'docs/app-store-submission.md',
];
const readmePath = join(root, 'README.md');

const missingDocs = requiredDocs.filter((relativePath) => {
  return !existsSync(join(root, relativePath));
});

const errors = [...missingDocs];
const supportMatrixPath = join(root, 'scripts/release-support-matrix.ts');
const supportMatrixSource = existsSync(supportMatrixPath)
  ? readFileSync(supportMatrixPath, 'utf8')
  : '';
const reactNativeSupport =
  supportMatrixSource.match(/reactNative:\s*'([^']+)'/)?.[1] ?? null;
const expoSupport = supportMatrixSource.match(/expo:\s*'([^']+)'/)?.[1] ?? null;

if (!existsSync(readmePath)) {
  errors.push('README.md');
} else {
  const readme = readFileSync(readmePath, 'utf8');
  const requiredReadmeText = [
    'addWakeWordListener',
    'async function runQuickstart()',
    'initialize',
    'startDetection',
    'stopDetection',
    'dispose',
    'real engine-backed local wake word detection is implemented through the built-in native-managed engine path',
    'Reliability evaluation artifacts',
    'tests/fixtures/reliability/latest-results.json',
    'The example app also exposes evaluator-facing runtime diagnostics',
    'current normalized runtime status from `getStatus()`',
    'recent runtime events including `stateChanged`, `error`, `interruption`, and `audioRouteChanged`',
    'normalized error-category surface: `permission`, `lifecycle`, `configuration`, `engine`, `platform`, and `internal`',
    'supported iOS background continuation requires `UIBackgroundModes` to include `audio`',
    'Android background continuation requires a visible app context for start, microphone permission, and an active foreground-service notification.',
    'Expo config and prebuild compatibility are validated through docs, contract checks, the Expo-capable example package scripts in `example/package.json`, an Expo CLI config resolution check against the example app, and Expo prebuild generation against a temporary copy of the example app.',
    'Expo Go is NOT supported.',
    'Wake-to-Transcribe-to-Speak Flow',
    'STT and TTS providers are **opt-in but package-driven**. You supply the provider; the package calls it.',
    'If you pass no `sttProvider`, the package emits `wakeWordDetected` and stops there',
    'the package takes over the flow and drives it for you',
    'The provider *implementations* are yours (or one of the bundled adapters); the orchestration between them is the package\'s.',
    'docs/examples/',
    '## Built-In Model Configuration',
    'engineConfig.assetKeys.modelAssetKey',
    'engineConfig.assetKeys.keywordAssetKey',
  ];

  if (reactNativeSupport && !readme.includes(`React Native \`${reactNativeSupport}\``)) {
    errors.push(`README missing support-matrix React Native version: ${reactNativeSupport}`);
  }

  if (expoSupport && !readme.includes(`Expo SDK \`${expoSupport.replace('SDK ', '')}\``)) {
    errors.push(`README missing support-matrix Expo version: ${expoSupport}`);
  }

  for (const text of requiredReadmeText) {
    if (!readme.includes(text)) {
      errors.push(`README missing required text: ${text}`);
    }
  }

  if (readme.includes('provide an AccessKey')) {
    errors.push('README must not instruct users to provide an AccessKey');
  }
}

const reliabilityValidationPath = join(root, 'docs/reliability-validation.md');

if (existsSync(reliabilityValidationPath)) {
  const reliabilityValidation = readFileSync(reliabilityValidationPath, 'utf8');
  const requiredReliabilityText = [
    'tests/fixtures/reliability/reference-device-matrix.json',
    'tests/fixtures/reliability/latest-results.json',
    'The PRD requires a 30-minute continuous detection endurance test',
    'compile-only validation is not the same as device validation',
    'The repo now has an automated deterministic host-side runner for quiet, noisy, and endurance evidence.',
    'deterministic host-side validation is not the same as acoustic device validation',
    'A passed physical-device run must replace those null placeholders with measured values',
  ];

  for (const text of requiredReliabilityText) {
    if (!reliabilityValidation.includes(text)) {
      errors.push(`reliability-validation missing required text: ${text}`);
    }
  }
}

const backgroundBehaviorPath = join(root, 'docs/background-behavior.md');
const bareSetupPath = join(root, 'docs/bare-react-native-setup.md');
const expoSetupPath = join(root, 'docs/expo-setup.md');

if (existsSync(backgroundBehaviorPath)) {
  const backgroundBehavior = readFileSync(backgroundBehaviorPath, 'utf8');
  const requiredBackgroundBehaviorText = [
    'force-quit continuation',
    'background_audio_mode_required',
    'event-driven consumers do not need to poll `getStatus()`',
    'visible activity context',
    'foreground_service_visible_context_required',
    'audioRouteChanged',
    'interrupted',
  ];

  for (const text of requiredBackgroundBehaviorText) {
    if (!backgroundBehavior.includes(text)) {
      errors.push(`background-behavior missing required text: ${text}`);
    }
  }
}

if (existsSync(bareSetupPath)) {
  const bareSetup = readFileSync(bareSetupPath, 'utf8');
  const requiredBareSetupText = [
    `React Native \`${reactNativeSupport ?? '0.83+'}\``,
    'microphone permission',
    'UIBackgroundModes',
    'foreground_service_visible_context_required',
    'scripts/release-support-matrix.ts',
    'What Is Automatic vs Manual',
    'Built-In Sherpa Asset Model',
    'engineConfig.assetKeys.modelAssetKey',
    'engineConfig.assetKeys.keywordAssetKey',
  ];

  for (const text of requiredBareSetupText) {
    if (!bareSetup.includes(text)) {
      errors.push(`bare-react-native-setup missing required text: ${text}`);
    }
  }

  if (bareSetup.includes('provide an AccessKey')) {
    errors.push('bare-react-native-setup must not instruct users to provide an AccessKey');
  }
}

if (existsSync(expoSetupPath)) {
  const expoSetup = readFileSync(expoSetupPath, 'utf8');
  const requiredExpoSetupText = [
    'What Is Automatic vs Manual',
    'expo prebuild',
    'scripts/release-support-matrix.ts',
    'Expo Go is NOT supported.',
    'The support matrix source in this repo is',
    'config-plugin and prebuild',
    `Expo SDK \`${(expoSupport ?? 'SDK 55+').replace('SDK ', '')}\``,
    'Built-In Sherpa Asset Model',
    'engineConfig.assetKeys.modelAssetKey',
    'engineConfig.assetKeys.keywordAssetKey',
  ];

  for (const text of requiredExpoSetupText) {
    if (!expoSetup.includes(text)) {
      errors.push(`expo-setup missing required text: ${text}`);
    }
  }

  if (expoSetup.includes('provide an AccessKey')) {
    errors.push('expo-setup must not instruct users to provide an AccessKey');
  }
}

const troubleshootingPath = join(root, 'docs/troubleshooting.md');
const gettingStartedPath = join(root, 'docs/getting-started.md');

if (existsSync(troubleshootingPath)) {
  const troubleshooting = readFileSync(troubleshootingPath, 'utf8');
  const requiredTroubleshootingText = [
    'addWakeWordListener(\'stateChanged\', ...)',
    'addWakeWordListener(\'error\', ...)',
    'current runtime status',
    'latest structured error',
    'recent runtime events',
    'normalized error categories',
    '## Troubleshooting by Error Category',
    '### `permission`',
    '### `lifecycle`',
    '### `configuration`',
    '### `engine`',
    '### `platform`',
    '### `internal`',
    'Expo Go is unsupported',
    'primary runtime validation path today',
    'optional STT/TTS extension-point examples',
    'downstream application integrations only',
    'Troubleshoot the Provider Pattern Separately',
    'The example app previews that provider pattern with simulated host implementations.',
    'docs/examples/',
  ];

  for (const text of requiredTroubleshootingText) {
    if (!troubleshooting.includes(text)) {
      errors.push(`troubleshooting missing required text: ${text}`);
    }
  }
}

if (existsSync(gettingStartedPath)) {
  const gettingStarted = readFileSync(gettingStartedPath, 'utf8');
  const requiredGettingStartedText = [
    'stateChanged',
    'error',
    'wakeWordDetected',
    'audioRouteChanged',
    'permission`, `lifecycle`,',
    'normalized error categories',
    'It does not carry an event history',
    'You supply the STT and TTS providers; the package calls them.',
    'the orchestration between them is the package',
    '### What `recoverable` means',
    'Wake-to-Transcribe-to-Speak Guide',
    'docs/examples/',
    'Built-In Engine Defaults',
    'native-managed Sherpa-ONNX',
    'engineConfig.assetKeys.modelAssetKey',
    'engineConfig.assetKeys.keywordAssetKey',
  ];

  for (const text of requiredGettingStartedText) {
    if (!gettingStarted.includes(text)) {
      errors.push(`getting-started missing required text: ${text}`);
    }
  }

  if (gettingStarted.includes('provide an AccessKey')) {
    errors.push('getting-started must not instruct users to provide an AccessKey');
  }
}

const migrationPath = join(root, 'docs/migration.md');
const androidBatteryOptimizationPath = join(root, 'docs/android-battery-optimization.md');
const appStoreSubmissionPath = join(root, 'docs/app-store-submission.md');
const exampleReadmePath = join(root, 'example/README.md');

if (existsSync(migrationPath)) {
  const migration = readFileSync(migrationPath, 'utf8');
  const requiredMigrationText = [
    'credential-era built-in engine path',
    'native-managed Sherpa-ONNX',
    'engineConfig.assetKeys.modelAssetKey',
    'engineConfig.assetKeys.keywordAssetKey',
  ];

  if (migration.includes('Placeholder created during Story 1.1 bootstrap.')) {
    errors.push('migration still contains bootstrap placeholder text');
  }

  for (const text of requiredMigrationText) {
    if (!migration.includes(text)) {
      errors.push(`migration missing required text: ${text}`);
    }
  }
}

if (existsSync(androidBatteryOptimizationPath)) {
  const batteryDoc = readFileSync(androidBatteryOptimizationPath, 'utf8');
  const requiredBatteryText = [
    'foreground-service ownership',
    'foreground_service_visible_context_required',
    'OEM battery management',
  ];

  if (batteryDoc.includes('Placeholder created during Story 1.1 bootstrap.')) {
    errors.push('android-battery-optimization still contains bootstrap placeholder text');
  }

  for (const text of requiredBatteryText) {
    if (!batteryDoc.includes(text)) {
      errors.push(`android-battery-optimization missing required text: ${text}`);
    }
  }
}

if (existsSync(appStoreSubmissionPath)) {
  const appStoreDoc = readFileSync(appStoreSubmissionPath, 'utf8');
  const requiredAppStoreText = [
    'NSMicrophoneUsageDescription',
    'UIBackgroundModes',
    'on-device-first baseline detection',
  ];

  if (appStoreDoc.includes('Placeholder created during Story 1.1 bootstrap.')) {
    errors.push('app-store-submission still contains bootstrap placeholder text');
  }

  for (const text of requiredAppStoreText) {
    if (!appStoreDoc.includes(text)) {
      errors.push(`app-store-submission missing required text: ${text}`);
    }
  }
}

if (existsSync(exampleReadmePath)) {
  const exampleReadme = readFileSync(exampleReadmePath, 'utf8');

  if (exampleReadme.includes('Story 4.2:')) {
    errors.push('example README still contains stale Story 4.2 framing');
  }

  if (!exampleReadme.includes('../docs/examples/')) {
    errors.push('example README missing docs/examples reference');
  }

  if (!exampleReadme.includes('Provider Pattern Evaluation Flow')) {
    errors.push('example README missing provider pattern evaluation flow section');
  }

  if (!exampleReadme.includes('The wake step is real package behavior.')) {
    errors.push('example README missing wake step ownership clarification');
  }

  if (!exampleReadme.includes('choose a bundled keyword preset')) {
    errors.push('example README missing bundled keyword preset guidance');
  }

  if (!exampleReadme.includes('They map to pre-bundled keyword files')) {
    errors.push('example README missing bundled keyword file explanation');
  }
}

const examplesIndexPath = join(root, 'docs/examples/index.md');

if (existsSync(examplesIndexPath)) {
  const examplesIndex = readFileSync(examplesIndexPath, 'utf8');
  const requiredExamplesIndexText = [
    'SpeechToTextProvider',
    'TextToSpeechProvider',
    'initialize({ sttProvider, ttsProvider, autoSpeak })',
    'They do not belong in `src/`, `src/internal/`, or the mandatory package runtime.',
    'expo-speech-tts-provider.md',
    'expo-speech-recognition-stt-provider.md',
    'Recommended Evaluation Flow',
    'real wake-word runtime',
    'separate simulated host-provider previews',
    'bundled keyword selector',
    'engineConfig.assetKeys.keywordAssetKey',
  ];

  for (const text of requiredExamplesIndexText) {
    if (!examplesIndex.includes(text)) {
      errors.push(`docs/examples/index missing required text: ${text}`);
    }
  }
}

const ttsExamplePath = join(root, 'docs/examples/expo-speech-tts-provider.md');

if (existsSync(ttsExamplePath)) {
  const ttsExample = readFileSync(ttsExamplePath, 'utf8');
  const requiredTtsExampleText = [
    'TextToSpeechProvider',
    'expo-speech',
    'initialize({ ttsProvider, autoSpeak: true })',
    'Do not move it into the library package core.',
  ];

  for (const text of requiredTtsExampleText) {
    if (!ttsExample.includes(text)) {
      errors.push(`expo-speech TTS example missing required text: ${text}`);
    }
  }
}

const sttExamplePath = join(
  root,
  'docs/examples/expo-speech-recognition-stt-provider.md'
);

if (existsSync(sttExamplePath)) {
  const sttExample = readFileSync(sttExamplePath, 'utf8');
  const requiredSttExampleText = [
    'SpeechToTextProvider',
    'expo-speech-recognition',
    'initialize({ sttProvider })',
    'Do not move it into the library package core.',
  ];

  for (const text of requiredSttExampleText) {
    if (!sttExample.includes(text)) {
      errors.push(`expo-speech-recognition STT example missing required text: ${text}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Missing expected documentation files:', errors.join(', '));
  process.exitCode = 1;
} else {
  console.log('Documentation placeholder checks passed.');
}
