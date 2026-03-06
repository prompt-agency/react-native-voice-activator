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
    'Real engine-backed local wake word detection lands in Epic 2 integration work.',
  ];

  for (const text of requiredReadmeText) {
    if (!readme.includes(text)) {
      errors.push(`README missing required text: ${text}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Missing expected documentation files:', errors.join(', '));
  process.exitCode = 1;
} else {
  console.log('Documentation placeholder checks passed.');
}
