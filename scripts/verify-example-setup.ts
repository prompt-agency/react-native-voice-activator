import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type PackageManifest = {
  name?: string;
  workspaces?: string[];
};

const root = process.cwd();
const packageJson = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8')
) as PackageManifest;
const examplePackageJson = JSON.parse(
  readFileSync(join(root, 'example/package.json'), 'utf8')
) as PackageManifest;

const errors: string[] = [];

if (packageJson.name !== 'react-native-voice-activator') {
  errors.push('Root package name is not react-native-voice-activator.');
}

if (!packageJson.workspaces?.includes('example')) {
  errors.push('Root workspaces do not include example.');
}

if (examplePackageJson.name !== 'react-native-voice-activator-example') {
  errors.push(
    'Example package name is not react-native-voice-activator-example.'
  );
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Example setup checks passed.');
}
