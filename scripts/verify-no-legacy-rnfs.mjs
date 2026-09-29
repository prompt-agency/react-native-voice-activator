#!/usr/bin/env node
// This branch replaced the legacy `react-native-fs` with the maintained fork
// `@dr.pogodin/react-native-fs` everywhere. The legacy package is not in any
// manifest and its native module is not linked, so any remaining import of it
// resolves at the JS layer (because a parent checkout's node_modules can still
// have it) but throws at the first native call, on a real device or a clean
// clone.
//
// This is a TEXTUAL check, not a module-resolution one, so it matches the
// literal specifier `react-native-fs` in any of the forms our code could use:
// `from 'react-native-fs'`, `import('react-native-fs')`,
// `require('react-native-fs')`, and the `typeof import('react-native-fs')`
// type position. It deliberately does NOT match `@dr.pogodin/react-native-fs`,
// which is the supported package: the pattern below requires the opening
// quote to sit immediately before the literal text `react-native-fs`, and in
// the scoped specifier the quote is immediately followed by `@dr.pogodin/`
// instead, so it never lines up with the match start.
//
// One legitimate exception: src/__tests__/whisper-rn-stt-adapter.test.ts
// registers `jest.mock('react-native-fs', ..., { virtual: true })` whose
// entire purpose is to prove our code never reaches that specifier. That
// call site is excluded by looking for `jest.mock(` on the same line as the
// specifier or on one of the few lines immediately above it (the call is
// written across multiple lines: `jest.mock(\n  'react-native-fs',\n  ...`),
// rather than by excluding the whole file, so a *different*, non-mock
// reference added later to the same file would still be caught.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function dirname(path) {
  return path.slice(0, path.lastIndexOf('/'));
}

const SCAN_ROOTS = ['src', 'example/src'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// Documentation is scanned too, and with a LOOSER pattern than the code above.
// A doc does not have to quote the specifier to send a reader to the wrong
// package: `react-native-fs is not installed; it is required for the download`
// in troubleshooting.md survived the code-only version of this check and told
// people to install the package that does not work. Prose is the failure mode
// here, so the prose is what gets matched.
const DOC_ROOTS = ['docs', 'README.md'];
const DOC_EXTENSIONS = new Set(['.md']);

// The one file whose subject IS the legacy package: the upgrade note that tells
// existing users to migrate off it necessarily names it. Excluded wholesale,
// because every mention in it is deliberate.
const DOC_EXCEPTIONS = new Set(['docs/upgrading.md']);

// Matches a quoted `react-native-fs` specifier, with nothing between the
// quote and the literal text. This is what keeps the scoped
// `@dr.pogodin/react-native-fs` out of the match set: its quote is followed
// by `@dr.pogodin/`, not by `react-native-fs` directly.
const LEGACY_SPECIFIER = /(['"])react-native-fs\1/g;

// The prose form: the bare package name wherever it is NOT the tail of the
// scoped name. The lookbehind is what distinguishes
// `@dr.pogodin/react-native-fs` (supported) from `react-native-fs` (legacy),
// and the trailing boundary keeps it from firing inside longer identifiers.
const LEGACY_PROSE = /(?<!@dr\.pogodin\/)\breact-native-fs\b/g;

function walk(dir, files, extensions = SCAN_EXTENSIONS) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, files, extensions);
    } else if (extensions.has(extname(entry))) {
      files.push(full);
    }
  }
}

const violations = [];

for (const root of SCAN_ROOTS) {
  const absoluteRoot = join(repoRoot, root);
  let rootStats;
  try {
    rootStats = statSync(absoluteRoot);
  } catch {
    continue; // e.g. example/src may not exist in every checkout state
  }
  if (!rootStats.isDirectory()) continue;

  const files = [];
  walk(absoluteRoot, files);

  for (const file of files) {
    const relativePath = file.slice(repoRoot.length + 1);
    const contents = readFileSync(file, 'utf8');
    const lines = contents.split('\n');

    const JEST_MOCK_LOOKBACK = 3;

    lines.forEach((line, index) => {
      LEGACY_SPECIFIER.lastIndex = 0;
      if (!LEGACY_SPECIFIER.test(line)) return;

      // The one legitimate occurrence: a jest.mock() call site that proves
      // our code never reaches the legacy specifier at runtime. The call may
      // be written across multiple lines, e.g.
      //   jest.mock(
      //     'react-native-fs',
      //     ...
      //   );
      // so look a few lines back for the `jest.mock(` that opens it.
      const windowStart = Math.max(0, index - JEST_MOCK_LOOKBACK);
      const precedingLines = lines.slice(windowStart, index + 1);
      if (precedingLines.some((l) => l.includes('jest.mock('))) return;

      violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    });
  }
}

for (const root of DOC_ROOTS) {
  const absoluteRoot = join(repoRoot, root);
  let rootStats;
  try {
    rootStats = statSync(absoluteRoot);
  } catch {
    continue;
  }

  const files = [];
  if (rootStats.isDirectory()) {
    walk(absoluteRoot, files, DOC_EXTENSIONS);
  } else {
    files.push(absoluteRoot);
  }

  for (const file of files) {
    const relativePath = file.slice(repoRoot.length + 1);
    if (DOC_EXCEPTIONS.has(relativePath)) continue;

    const contents = readFileSync(file, 'utf8');
    contents.split('\n').forEach((line, index) => {
      LEGACY_PROSE.lastIndex = 0;
      if (!LEGACY_PROSE.test(line)) return;
      violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    });
  }
}

if (violations.length > 0) {
  console.error(
    'Found imports of the legacy `react-native-fs` package. This library uses ' +
      '`@dr.pogodin/react-native-fs` instead; the legacy package has no linked ' +
      'native module and will throw at the first call on device. In docs, the ' +
      'bare name sends readers to install the wrong package.'
  );
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log(
  'No legacy react-native-fs imports or documentation references found.'
);
