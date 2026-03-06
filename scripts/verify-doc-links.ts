import { existsSync } from 'node:fs';
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

const missingDocs = requiredDocs.filter((relativePath) => {
  return !existsSync(join(root, relativePath));
});

if (missingDocs.length > 0) {
  console.error(
    'Missing expected documentation files:',
    missingDocs.join(', ')
  );
  process.exitCode = 1;
} else {
  console.log('Documentation placeholder checks passed.');
}
