import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredPaths = [
  'ios',
  'android',
  'example',
  'src',
  'plugin',
  'docs',
  'tests',
  'scripts',
  'vendor',
];

const missingPaths = requiredPaths.filter((relativePath) => {
  return !existsSync(join(root, relativePath));
});

if (missingPaths.length > 0) {
  console.error('Missing required bootstrap paths:', missingPaths.join(', '));
  process.exitCode = 1;
} else {
  console.log('Asset and directory bootstrap checks passed.');
}
