import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredDocs = [
  'docs/getting-started.md',
  'docs/bare-react-native-setup.md',
  'docs/expo-setup.md',
  'docs/background-behavior.md',
  'docs/reliability-validation.md',
  'docs/troubleshooting.md',
  'docs/migration.md',
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
    'real engine-backed local wake word detection is implemented through the built-in Porcupine adapter',
    'Reliability evaluation artifacts',
    'tests/fixtures/reliability/latest-results.json',
    'The example app also exposes evaluator-facing runtime diagnostics',
    'current normalized runtime status from `getStatus()`',
    'recent runtime events including `stateChanged`, `error`, `interruption`, and `audioRouteChanged`',
    'normalized error-category surface: `permission`, `lifecycle`, `configuration`, `engine`, `platform`, and `internal`',
    'supported iOS background continuation requires `UIBackgroundModes` to include `audio`',
    'Android background continuation requires a visible app context for start, microphone permission, and an active foreground-service notification.',
    'Expo config and prebuild compatibility are validated through docs, contract checks, the Expo-capable example package scripts in `example/package.json`, an Expo CLI prebuild-config resolution check against the example app, and Expo prebuild generation against a temporary copy of the example app.',
    'Expo Go is NOT supported.',
    'optional downstream STT/TTS extension examples',
    'the package itself does not own transcription or synthesis',
    'downstream STT/TTS integrations can be layered on top of the public event contract without modifying package internals',
    'STT/TTS examples in the repo are illustrative downstream integrations, not built-in package runtime features',
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
}

const reliabilityValidationPath = join(root, 'docs/reliability-validation.md');

if (existsSync(reliabilityValidationPath)) {
  const reliabilityValidation = readFileSync(reliabilityValidationPath, 'utf8');
  const requiredReliabilityText = [
    'tests/fixtures/reliability/reference-device-matrix.json',
    'tests/fixtures/reliability/latest-results.json',
    'The PRD requires a 30-minute continuous detection endurance test',
    'compile-only validation is not the same as device validation',
    'There is no automated runner yet that executes quiet/noisy or endurance scenarios for you',
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
  ];

  for (const text of requiredBareSetupText) {
    if (!bareSetup.includes(text)) {
      errors.push(`bare-react-native-setup missing required text: ${text}`);
    }
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
    `Expo SDK \`${(expoSupport ?? 'SDK 55+').replace('SDK ', '')}\``,
  ];

  for (const text of requiredExpoSetupText) {
    if (!expoSetup.includes(text)) {
      errors.push(`expo-setup missing required text: ${text}`);
    }
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
    'current `getStatus()` snapshot',
    'recent runtime events',
    'normalized error categories',
    'application-owned STT handoff',
    'TTS response step can run after detection or transcript handling',
    'those speech flows remain outside the package runtime and use public APIs only',
  ];

  for (const text of requiredGettingStartedText) {
    if (!gettingStarted.includes(text)) {
      errors.push(`getting-started missing required text: ${text}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Missing expected documentation files:', errors.join(', '));
  process.exitCode = 1;
} else {
  console.log('Documentation placeholder checks passed.');
}
