#!/usr/bin/env node
// The vendored xcframeworks under ios/Vendor ship their own ONNX Runtime
// headers. An `ios/**` glob in source_files/private_header_files sweeps them
// in, and CocoaPods then copies ORT 1.17 headers into
// Pods/Headers/Private/VoiceActivator where they shadow the real
// onnxruntime-c pod headers for every other target in the consumer's app.
//
// This is a TEXTUAL check against the podspec source, not a Ruby-semantic
// one, so it only catches the literal `"ios/**"` spelling. It is defeated by
// anything that produces the same glob without that exact substring:
// string interpolation (`"#{base}/**/*.h"`), `%w[]` array syntax
// (`%w[ios/** foo]`), or other Ruby string construction. It is also
// defeated structurally: the regex that captures an assignment's value stops
// at the first `#`, so a comment placed between the continuation lines of a
// multi-line `s.source_files = "a",\n  # note\n  "ios/**"` assignment would
// truncate the capture before the offending glob and let it through silently.
// Treat a pass from this script as "no obvious glob", not as a guarantee.
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

  // Deliberately unconditional: any "Vendor" reference here is worth
  // flagging regardless of whether the word "exclude" also appears nearby.
  // The excludes that actually matter live in a separate s.exclude_files
  // field, outside the value this script inspects, so a stray "exclude" in
  // this field's own text is not evidence the reference is safe.
  if (/Vendor/.test(value)) {
    errors.push(`podspec: s.${field} references ios/Vendor directly`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log('Podspec source globs do not leak vendored headers.');
