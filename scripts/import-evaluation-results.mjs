#!/usr/bin/env node
/**
 * Imports a wake-word accuracy run exported from the example app's Accuracy tab.
 *
 *   node scripts/import-evaluation-results.mjs ~/Downloads/wake-word-evaluation-*.json
 *
 * Writes tests/fixtures/reliability/wake-word-accuracy.json.
 *
 * Deliberately a separate file from latest-results.json. That schema models
 * latency percentiles and false-trigger counts for scenario runs; detection rate
 * and false-accepts-per-hour are different measurements, and putting them in
 * fields that mean something else would produce exactly the kind of number that
 * reads as evidence without being it.
 *
 * Refuses a run with less negative audio than docs/reliability-validation.md
 * requires, unless --allow-short is passed. False accepts per hour computed over
 * ten minutes is not a rate, it is an extrapolation, and publishing it would be
 * the thing this project is trying not to do.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests', 'fixtures', 'reliability', 'wake-word-accuracy.json');
// Matches the "Corpus requirements" table in docs/reliability-validation.md.
const MIN_NEGATIVE_HOURS = 2;

const args = process.argv.slice(2);
const allowShort = args.includes('--allow-short');
const inputPath = args.find((a) => !a.startsWith('--'));

if (!inputPath) {
  console.error('Usage: node scripts/import-evaluation-results.mjs <exported.json> [--allow-short]');
  process.exit(1);
}

let run;
try {
  run = JSON.parse(await readFile(inputPath, 'utf8'));
} catch (cause) {
  console.error(`Could not read ${inputPath}: ${cause.message}`);
  process.exit(1);
}

const errors = [];

if (run.schema !== 'wake-word-evaluation/1') {
  errors.push(`Unexpected schema "${run.schema}"; expected "wake-word-evaluation/1".`);
}
if (!Array.isArray(run.sweep) || run.sweep.length === 0) {
  errors.push('The run carries no sweep results.');
}
if (typeof run.device !== 'string' || run.device.trim() === '') {
  errors.push('The run has no device label. A result that does not say what it ran on is not reproducible.');
}
if (typeof run.wakePhrase !== 'string' || run.wakePhrase.trim() === '') {
  errors.push('The run has no wake phrase.');
}

const negativeHours = run.corpus?.negativeHours ?? 0;
if (negativeHours < MIN_NEGATIVE_HOURS && !allowShort) {
  errors.push(
    `Only ${negativeHours.toFixed(2)} h of negative audio. False accepts per hour ` +
      `needs at least ${MIN_NEGATIVE_HOURS} h to be a rate rather than an extrapolation. ` +
      'Record more negatives, or pass --allow-short to import it as indicative only.'
  );
}

if (errors.length > 0) {
  console.error('Import refused:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const record = {
  schema: 'wake-word-accuracy/1',
  importedAt: new Date().toISOString().slice(0, 10),
  recordedAt: run.recordedAt ?? null,
  device: run.device,
  platform: run.platform ?? null,
  platformVersion: run.platformVersion ?? null,
  wakePhrase: run.wakePhrase,
  corpus: run.corpus,
  indicativeOnly: negativeHours < MIN_NEGATIVE_HOURS,
  falseAcceptBudgetPerHour: run.falseAcceptBudgetPerHour ?? null,
  operatingPoint: run.operatingPoint ?? null,
  sweep: run.sweep,
};

await writeFile(OUT, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

const best = run.operatingPoint;
console.log(`Wrote ${OUT.replace(ROOT + '/', '')}`);
console.log(`  device:        ${record.device}`);
console.log(`  wake phrase:   ${record.wakePhrase}`);
console.log(`  corpus:        ${run.corpus?.positives ?? 0} positives, ${negativeHours.toFixed(2)} h negatives`);
console.log(
  best
    ? `  operating pt:  sensitivity ${best.sensitivity}, ` +
        `${(best.detectionRate * 100).toFixed(1)}% detection at ${best.falseAcceptsPerHour.toFixed(2)} FA/hr`
    : '  operating pt:  none within budget'
);
if (record.indicativeOnly) {
  console.log('  NOTE: imported as indicative only; the negative corpus is under an hour.');
}
