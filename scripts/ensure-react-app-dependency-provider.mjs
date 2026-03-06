import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const appRoot = process.argv[2];

if (!appRoot) {
  console.error('App root argument is required.');
  process.exit(1);
}

const reactNativeRoot = path.join(appRoot, 'node_modules', 'react-native');
const templatesRoot = path.join(
  reactNativeRoot,
  'scripts',
  'codegen',
  'templates'
);
const outputDir = path.join(
  appRoot,
  'ios',
  'build',
  'generated',
  'ios',
  'ReactAppDependencyProvider'
);

const reactNativePackageJson = JSON.parse(
  readFileSync(path.join(reactNativeRoot, 'package.json'), 'utf8')
);

mkdirSync(outputDir, { recursive: true });

const headerTemplate = readFileSync(
  path.join(templatesRoot, 'RCTAppDependencyProviderH.template'),
  'utf8'
);
writeFileSync(path.join(outputDir, 'RCTAppDependencyProvider.h'), headerTemplate);

const implementationTemplate = readFileSync(
  path.join(templatesRoot, 'RCTAppDependencyProviderMM.template'),
  'utf8'
);
writeFileSync(
  path.join(outputDir, 'RCTAppDependencyProvider.mm'),
  implementationTemplate
);

const podspecTemplate = readFileSync(
  path.join(templatesRoot, 'ReactAppDependencyProvider.podspec.template'),
  'utf8'
)
  .replace(/{react-native-version}/, reactNativePackageJson.version)
  .replace(/{react-native-licence}/, reactNativePackageJson.license);

writeFileSync(
  path.join(outputDir, 'ReactAppDependencyProvider.podspec'),
  podspecTemplate
);
