import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const fixturesDir = join(root, 'tests/fixtures/reliability');
const requiredFixtureFiles = [
  'reference-device-matrix.json',
  'quiet-acceptance-set.json',
  'noisy-acceptance-set.json',
  'endurance-plan.json',
  'latest-results.json',
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

const errors = [];

for (const fixtureFile of requiredFixtureFiles) {
  const fullPath = join(fixturesDir, fixtureFile);
  if (!existsSync(fullPath)) {
    errors.push(`Missing reliability fixture: tests/fixtures/reliability/${fixtureFile}`);
  }
}

if (errors.length === 0) {
  const deviceMatrix = readJson(
    'tests/fixtures/reliability/reference-device-matrix.json'
  );
  const quietSet = readJson(
    'tests/fixtures/reliability/quiet-acceptance-set.json'
  );
  const noisySet = readJson(
    'tests/fixtures/reliability/noisy-acceptance-set.json'
  );
  const endurancePlan = readJson(
    'tests/fixtures/reliability/endurance-plan.json'
  );
  const latestResults = readJson(
    'tests/fixtures/reliability/latest-results.json'
  );

  if (!Array.isArray(deviceMatrix.referenceDevices) || deviceMatrix.referenceDevices.length < 2) {
    errors.push('Reference-device matrix must define at least two reference devices.');
  }

  if (quietSet.scenario !== 'quiet-acceptance') {
    errors.push('Quiet acceptance set must use scenario "quiet-acceptance".');
  }

  if (noisySet.scenario !== 'noisy-acceptance') {
    errors.push('Noisy acceptance set must use scenario "noisy-acceptance".');
  }

  if (endurancePlan.requiredDurationMinutes !== 30) {
    errors.push('Endurance plan must require 30 minutes.');
  }

  const requiredResultFields = [
    'scenario',
    'deviceId',
    'latencyMsP95',
    'falseTriggerCount',
    'interruptionCount',
    'unsupportedTransitionCount',
    'teardownIssueCount',
    'unrecoverableFailureCount',
    'notes',
  ];

  for (const field of requiredResultFields) {
    if (!endurancePlan.resultFields.includes(field)) {
      errors.push(`Endurance plan must include result field "${field}".`);
    }
  }

  const physicalReferenceRuns = latestResults.results.filter((result) => {
    return result.deviceId === 'ios-physical-primary' || result.deviceId === 'android-physical-primary';
  });

  if (physicalReferenceRuns.length === 0) {
    errors.push('Latest reliability results must include physical-device reference entries for iOS and Android.');
  }

  const compileResult = latestResults.results.find((result) => {
    return result.scenario === 'android-native-compile';
  });

  if (!compileResult || compileResult.status !== 'passed') {
    errors.push('Latest reliability results must include the Android compile-only evidence path.');
  }

  for (const result of latestResults.results) {
    for (const field of requiredResultFields) {
      if (!(field in result)) {
        errors.push(`Latest reliability result for scenario "${result.scenario}" is missing "${field}".`);
      }
    }

    if (result.status === 'passed' && result.evidenceType !== 'compile-only') {
      const measuredFields = [
        'latencyMsP95',
        'falseTriggerCount',
        'interruptionCount',
        'unsupportedTransitionCount',
        'teardownIssueCount',
        'unrecoverableFailureCount',
      ];

      for (const field of measuredFields) {
        if (result[field] === null || result[field] === undefined) {
          errors.push(
            `Passed reliability result for scenario "${result.scenario}" must include measured "${field}".`
          );
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Reliability evaluation evidence checks passed.');
}
