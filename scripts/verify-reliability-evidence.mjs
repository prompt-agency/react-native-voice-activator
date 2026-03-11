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
  'scenarios/quiet-primary-wake-word.json',
  'scenarios/noisy-primary-wake-word.json',
  'scenarios/endurance-30m.json',
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

  const referenceDevices = deviceMatrix.referenceDevices ?? [];
  const requiredReferenceDeviceIds = [
    'ios-host-deterministic',
    'android-host-deterministic',
    'ios-physical-primary',
    'android-physical-primary',
    'android-build-host',
  ];

  for (const deviceId of requiredReferenceDeviceIds) {
    if (!referenceDevices.some((device) => device.id === deviceId)) {
      errors.push(`Reference-device matrix must define "${deviceId}".`);
    }
  }

  if (quietSet.scenario !== 'quiet-acceptance') {
    errors.push('Quiet acceptance set must use scenario "quiet-acceptance".');
  }

  if (quietSet.fixtures?.[0]?.playbackSource !== 'deterministic-host-fixture') {
    errors.push('Quiet acceptance set must reference the deterministic host fixture.');
  }

  if (noisySet.scenario !== 'noisy-acceptance') {
    errors.push('Noisy acceptance set must use scenario "noisy-acceptance".');
  }

  if (noisySet.fixtures?.[0]?.playbackSource !== 'deterministic-host-fixture') {
    errors.push('Noisy acceptance set must reference the deterministic host fixture.');
  }

  if (endurancePlan.requiredDurationMinutes !== 30) {
    errors.push('Endurance plan must require 30 minutes.');
  }

  if (
    endurancePlan.deterministicFixturePath !==
    'tests/fixtures/reliability/scenarios/endurance-30m.json'
  ) {
    errors.push('Endurance plan must reference the deterministic endurance fixture.');
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

  const results = latestResults.results ?? [];
  const physicalReferenceRuns = results.filter((result) => {
    return (
      result.deviceId === 'ios-physical-primary' ||
      result.deviceId === 'android-physical-primary'
    );
  });

  if (physicalReferenceRuns.length === 0) {
    errors.push('Latest reliability results must include physical-device reference entries for iOS and Android.');
  }

  const compileResult = results.find((result) => {
    return result.scenario === 'android-native-compile';
  });

  if (!compileResult || compileResult.status !== 'passed') {
    errors.push('Latest reliability results must include the Android compile-only evidence path.');
  }

  const expectedScenarioPairs = referenceDevices.flatMap((device) => {
    return (device.requiredScenarios ?? []).map((scenario) => {
      return `${device.id}::${scenario}`;
    });
  });

  for (const scenarioPair of expectedScenarioPairs) {
    const [deviceId, scenario] = scenarioPair.split('::');
    if (!results.some((result) => result.deviceId === deviceId && result.scenario === scenario)) {
      errors.push(`Latest reliability results must include "${scenario}" for "${deviceId}".`);
    }
  }

  for (const result of results) {
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

  if (
    latestResults.summary?.status !==
    'deterministic-validation-complete-pending-physical-device-validation'
  ) {
    errors.push(
      'Latest reliability summary must describe deterministic validation as complete while physical-device validation remains pending.'
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Reliability evaluation evidence checks passed.');
}
