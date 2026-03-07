import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredDocs = [
  'docs/getting-started.md',
  'docs/bare-react-native-setup.md',
  'docs/expo-setup.md',
  'docs/background-behavior.md',
  'docs/troubleshooting.md',
  'docs/migration.md',
];
const readmePath = join(root, 'README.md');

const missingDocs = requiredDocs.filter((relativePath) => {
  return !existsSync(join(root, relativePath));
});

const errors = [...missingDocs];

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
    'supported iOS background continuation requires `UIBackgroundModes` to include `audio`',
    'Android background continuation requires a visible app context for start, microphone permission, and an active foreground-service notification.',
  ];

  for (const text of requiredReadmeText) {
    if (!readme.includes(text)) {
      errors.push(`README missing required text: ${text}`);
    }
  }
}

const backgroundBehaviorPath = join(root, 'docs/background-behavior.md');

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

if (errors.length > 0) {
  console.error('Missing expected documentation files:', errors.join(', '));
  process.exitCode = 1;
} else {
  console.log('Documentation placeholder checks passed.');
}
