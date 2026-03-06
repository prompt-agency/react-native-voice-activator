import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const examplePackageJson = JSON.parse(
  readFileSync(join(root, 'example/package.json'), 'utf8')
);

const errors = [];
const exampleAppPath = join(root, 'example/src/App.tsx');

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
  const requiredApiUsage = [
    'addWakeWordListener',
    'getStatus',
    'initialize',
    'startDetection',
    'stopDetection',
    'dispose',
  ];

  for (const token of requiredApiUsage) {
    if (!exampleAppSource.includes(token)) {
      errors.push(`Example app does not reference ${token}.`);
    }
  }

  if (
    !exampleAppSource.includes(
      'Real built-in wake word detection is scheduled for Epic 2.'
    )
  ) {
    errors.push('Example app does not document the Epic 2 detection limitation.');
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Example setup checks passed.');
}
