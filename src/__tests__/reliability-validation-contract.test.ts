import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('reliability validation contract', () => {
  const root = process.cwd();

  it('keeps reliability fixtures and latest results aligned with the Story 3.4 contract', () => {
    const referenceDeviceMatrix = JSON.parse(
      readFileSync(
        join(root, 'tests/fixtures/reliability/reference-device-matrix.json'),
        'utf8'
      )
    );
    const quietAcceptanceSet = JSON.parse(
      readFileSync(
        join(root, 'tests/fixtures/reliability/quiet-acceptance-set.json'),
        'utf8'
      )
    );
    const noisyAcceptanceSet = JSON.parse(
      readFileSync(
        join(root, 'tests/fixtures/reliability/noisy-acceptance-set.json'),
        'utf8'
      )
    );
    const endurancePlan = JSON.parse(
      readFileSync(
        join(root, 'tests/fixtures/reliability/endurance-plan.json'),
        'utf8'
      )
    );
    const latestResults = JSON.parse(
      readFileSync(
        join(root, 'tests/fixtures/reliability/latest-results.json'),
        'utf8'
      )
    );

    expect(referenceDeviceMatrix.referenceDevices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ios-host-deterministic',
          validationStatus: 'validated',
        }),
        expect.objectContaining({
          id: 'android-host-deterministic',
          validationStatus: 'validated',
        }),
        expect.objectContaining({
          id: 'ios-physical-primary',
          validationStatus: expect.stringMatching(
            /^(pending-device-run|validated)$/
          ),
        }),
        expect.objectContaining({
          id: 'android-physical-primary',
          validationStatus: expect.stringMatching(
            /^(pending-device-run|validated)$/
          ),
        }),
      ])
    );
    expect(quietAcceptanceSet.scenario).toBe('quiet-acceptance');
    expect(quietAcceptanceSet.fixtures[0].playbackSource).toBe(
      'deterministic-host-fixture'
    );
    expect(noisyAcceptanceSet.scenario).toBe('noisy-acceptance');
    expect(noisyAcceptanceSet.fixtures[0].playbackSource).toBe(
      'deterministic-host-fixture'
    );
    expect(endurancePlan.requiredDurationMinutes).toBe(30);
    expect(endurancePlan.deterministicFixturePath).toBe(
      'tests/fixtures/reliability/scenarios/endurance-30m.json'
    );
    expect(endurancePlan.resultFields).toEqual(
      expect.arrayContaining([
        'scenario',
        'deviceId',
        'latencyMsP95',
        'falseTriggerCount',
        'interruptionCount',
        'unsupportedTransitionCount',
        'teardownIssueCount',
        'unrecoverableFailureCount',
        'notes',
      ])
    );
    expect(latestResults.summary.status).toBe(
      'deterministic-validation-complete-pending-physical-device-validation'
    );
    expect(latestResults.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scenario: 'quiet-acceptance',
          deviceId: 'ios-host-deterministic',
          status: 'passed',
          evidenceType: 'deterministic-fixture-run',
          latencyMsP95: expect.any(Number),
          falseTriggerCount: expect.any(Number),
          interruptionCount: expect.any(Number),
          unsupportedTransitionCount: expect.any(Number),
          teardownIssueCount: expect.any(Number),
          unrecoverableFailureCount: expect.any(Number),
        }),
        expect.objectContaining({
          scenario: 'endurance-30m',
          deviceId: 'android-host-deterministic',
          status: 'passed',
          evidenceType: 'deterministic-fixture-run',
          latencyMsP95: expect.any(Number),
          falseTriggerCount: expect.any(Number),
          interruptionCount: expect.any(Number),
          unsupportedTransitionCount: expect.any(Number),
          teardownIssueCount: expect.any(Number),
          unrecoverableFailureCount: expect.any(Number),
        }),
        expect.objectContaining({
          scenario: 'android-native-compile',
          status: 'passed',
          evidenceType: 'compile-only',
        }),
        expect.objectContaining({
          scenario: 'endurance-30m',
          deviceId: 'ios-physical-primary',
          status: expect.stringMatching(/^(pending|passed|failed)$/),
          latencyMsP95: null,
          falseTriggerCount: null,
          interruptionCount: null,
          unsupportedTransitionCount: null,
          teardownIssueCount: null,
          unrecoverableFailureCount: null,
        }),
      ])
    );
  });

  it('documents the reliability validation contract truthfully', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const reliabilityDoc = readFileSync(
      join(root, 'docs/reliability-validation.md'),
      'utf8'
    );

    expect(readme).toContain('Reliability evaluation artifacts');
    expect(readme).toContain('tests/fixtures/reliability/latest-results.json');
    expect(reliabilityDoc).toContain(
      'compile-only validation is not the same as device validation'
    );
    expect(reliabilityDoc).toContain(
      'The repo now has an automated deterministic host-side runner'
    );
    expect(reliabilityDoc).toContain(
      'The PRD requires a 30-minute continuous detection endurance test'
    );
    expect(reliabilityDoc).toContain(
      'deterministic host-side validation is not the same as acoustic device validation'
    );
    expect(reliabilityDoc).toContain(
      'A passed physical-device run must replace those null placeholders with measured values'
    );

    // The sweep path carried its own keywordsAreRawText flag, and setting it made
    // sherpa-onnx exit(-1) on a pre-tokenized file. The field is gone from
    // WakeWordEvaluationCorpus, so an example using it would not compile, and would
    // document the crash this branch removed. See issue #31.
    expect(reliabilityDoc).not.toContain('keywordsAreRawText');
  });
});
