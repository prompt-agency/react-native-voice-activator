#!/usr/bin/env node
// The vendored xcframeworks under ios/Vendor ship their own ONNX Runtime
// headers. An `ios/**` glob in source_files/private_header_files sweeps them
// in, and CocoaPods then copies ORT 1.17 headers into
// Pods/Headers/Private/VoiceActivator where they shadow the real
// onnxruntime-c pod headers for every other target in the consumer's app.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const podspec = readFileSync(join(repoRoot, 'VoiceActivator.podspec'), 'utf8');

const errors = [];

for (const field of ['source_files', 'private_header_files']) {
  // Capture the whole assignment, including continuation lines.
  const match = podspec.match(
    new RegExp(`s\\.${field}\\s*=([\\s\\S]*?)(?=\\n\\s*(?:s\\.|#|$))`)
  );

  if (!match) {
    errors.push(`podspec: could not find s.${field}`);
    continue;
  }

  const value = match[1];

  if (/["']ios\/\*\*/.test(value)) {
    errors.push(
      `podspec: s.${field} uses an "ios/**" glob, which sweeps in ` +
        'ios/Vendor xcframework headers (ORT 1.17) and shadows the ' +
        'onnxruntime-c pod headers. Enumerate our own source dirs instead.'
    );
  }

  if (/Vendor/.test(value) && !/exclude/.test(value)) {
    errors.push(`podspec: s.${field} references ios/Vendor directly`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log('Podspec source globs do not leak vendored headers.');
