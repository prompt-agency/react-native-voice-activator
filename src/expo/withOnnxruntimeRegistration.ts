import { withMainApplication } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

const PACKAGE_CLASS = 'ai.onnxruntime.reactnative.OnnxruntimePackage';
const KOTLIN_IMPORT = `import ${PACKAGE_CLASS}`;
const JAVA_IMPORT = `import ${PACKAGE_CLASS};`;
const KOTLIN_ADD = 'add(OnnxruntimePackage())';
const JAVA_ADD = 'packages.add(new OnnxruntimePackage());';

const EXPLANATION = [
  '// Added by react-native-voice-activator.',
  '// onnxruntime-react-native still ships a legacy `unimodule.json` and no',
  '// `expo-module.config.json`, so Expo autolinking claims it (resolving it',
  '// with zero modules to register) while also excluding it from the',
  '// generated PackageList. Its .so files and classes are packaged but',
  '// OnnxruntimePackage is never instantiated, leaving',
  '// NativeModules.Onnxruntime null and every ONNX call failing with',
  '// "Cannot read property \'install\' of null". Silero VAD and any',
  '// ONNX-backed provider depend on this registration.',
].join('\n');

/** True when the file already registers the package, in any form. */
function alreadyRegistered(contents: string): boolean {
  return contents.includes('OnnxruntimePackage');
}

function indentOf(line: string): string {
  return /^(\s*)/.exec(line)?.[1] ?? '';
}

function addImport(contents: string, importLine: string): string {
  if (contents.includes(importLine)) return contents;
  const lines = contents.split('\n');
  // Place it after the final existing import so ordering stays conventional
  // regardless of which template the app was generated from.
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith('import ')) lastImport = i;
  }
  if (lastImport === -1) {
    // No imports at all (unusual) — fall back to after the package decl.
    const pkg = lines.findIndex((l) => l.startsWith('package '));
    lines.splice(pkg + 1, 0, '', importLine);
    return lines.join('\n');
  }
  lines.splice(lastImport + 1, 0, importLine);
  return lines.join('\n');
}

function registerKotlin(contents: string): string {
  let next = addImport(contents, KOTLIN_IMPORT);

  // Preferred anchor: the template's `.packages.apply { ... }` block.
  const applyAnchor = /PackageList\(this\)\.packages\.apply\s*\{/;
  const applyMatch = applyAnchor.exec(next);
  if (applyMatch) {
    const insertAt = applyMatch.index + applyMatch[0].length;
    const lineStart = next.lastIndexOf('\n', applyMatch.index) + 1;
    const indent = indentOf(next.slice(lineStart, applyMatch.index)) + '  ';
    const block =
      '\n' +
      EXPLANATION.split('\n')
        .map((l) => indent + l)
        .join('\n') +
      `\n${indent}${KOTLIN_ADD}`;
    return next.slice(0, insertAt) + block + next.slice(insertAt);
  }

  // Fallback: a bare `PackageList(this).packages` with no apply block.
  const bareAnchor = /PackageList\(this\)\.packages(?!\s*\.apply)/;
  const bareMatch = bareAnchor.exec(next);
  if (bareMatch) {
    next = next.replace(
      bareAnchor,
      `PackageList(this).packages.apply { ${KOTLIN_ADD} }`
    );
  }
  return next;
}

function registerJava(contents: string): string {
  const next = addImport(contents, JAVA_IMPORT);
  const anchor = /(\n(\s*)return packages;)/;
  const match = anchor.exec(next);
  if (!match) return next;
  const indent = match[2] ?? '    ';
  const block =
    '\n' +
    EXPLANATION.split('\n')
      .map((l) => indent + l)
      .join('\n') +
    `\n${indent}${JAVA_ADD}\n`;
  return next.replace(anchor, `${block}${match[1]}`);
}

/**
 * Registers onnxruntime-react-native's ReactPackage in the consuming app's
 * MainApplication, which Expo autolinking otherwise silently omits.
 *
 * Idempotent: a file that already mentions OnnxruntimePackage is left alone,
 * so repeated prebuilds and manually-registered apps are both safe.
 *
 * Only needed for the Expo/prebuild workflow. Bare React Native apps get the
 * package through normal RN CLI autolinking.
 */
export const withOnnxruntimeRegistration: ConfigPlugin = (config) => {
  return withMainApplication(config, (mainApplicationConfig) => {
    const { modResults } = mainApplicationConfig;
    if (alreadyRegistered(modResults.contents)) {
      return mainApplicationConfig;
    }

    modResults.contents =
      modResults.language === 'java'
        ? registerJava(modResults.contents)
        : registerKotlin(modResults.contents);

    return mainApplicationConfig;
  });
};
