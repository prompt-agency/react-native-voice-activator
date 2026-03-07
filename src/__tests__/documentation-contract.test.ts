import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('documentation and example contract', () => {
  const root = process.cwd();

  it('keeps the README quickstart aligned with the current public API and limitation note', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');

    expect(readme).toContain('addWakeWordListener');
    expect(readme).toContain('async function runQuickstart()');
    expect(readme).toContain('initialize');
    expect(readme).toContain('startDetection');
    expect(readme).toContain('stopDetection');
    expect(readme).toContain('dispose');
    expect(readme).toContain(
      'real engine-backed local wake word detection is implemented through the built-in Porcupine adapter'
    );
    expect(readme).toContain('Reliability evaluation artifacts');
    expect(readme).toContain('tests/fixtures/reliability/latest-results.json');
    expect(readme).toContain(
      'supported iOS background continuation requires `UIBackgroundModes` to include `audio`'
    );
    expect(readme).toContain(
      'Android background continuation requires a visible app context for start, microphone permission, and an active foreground-service notification.'
    );
    expect(readme).not.toContain('\nawait initialize();\n');
  });

  it('documents the current background behavior contract truthfully', () => {
    const backgroundBehavior = readFileSync(
      join(root, 'docs/background-behavior.md'),
      'utf8'
    );

    expect(backgroundBehavior).toContain('force-quit continuation');
    expect(backgroundBehavior).toContain('background_audio_mode_required');
    expect(backgroundBehavior).toContain(
      'event-driven consumers do not need to poll `getStatus()`'
    );
    expect(backgroundBehavior).toContain('visible activity context');
    expect(backgroundBehavior).toContain(
      'foreground_service_visible_context_required'
    );
    expect(backgroundBehavior).toContain('audioRouteChanged');
    expect(backgroundBehavior).toContain('interrupted');
    expect(backgroundBehavior).not.toContain(
      'Placeholder created during Story 1.1 bootstrap.'
    );
  });

  it('documents the current reliability validation contract truthfully', () => {
    const reliabilityValidation = readFileSync(
      join(root, 'docs/reliability-validation.md'),
      'utf8'
    );

    expect(reliabilityValidation).toContain(
      'tests/fixtures/reliability/reference-device-matrix.json'
    );
    expect(reliabilityValidation).toContain(
      'tests/fixtures/reliability/latest-results.json'
    );
    expect(reliabilityValidation).toContain(
      'The PRD requires a 30-minute continuous detection endurance test'
    );
    expect(reliabilityValidation).toContain(
      'compile-only validation is not the same as device validation'
    );
  });

  it('keeps the example app aligned with the public runtime flow and limitation note', () => {
    const exampleApp = readFileSync(join(root, 'example/src/App.tsx'), 'utf8');
    const normalizedExampleApp = exampleApp.replace(/\s+/g, ' ');

    expect(exampleApp).toContain('addWakeWordListener');
    expect(exampleApp).toContain('getStatus');
    expect(exampleApp).toContain('initialize');
    expect(exampleApp).toContain('startDetection');
    expect(exampleApp).toContain('stopDetection');
    expect(exampleApp).toContain('dispose');
    expect(exampleApp).toContain(
      'iOS background continuation still requires the audio'
    );
    expect(exampleApp).toContain(
      'background mode and does not survive force-quit.'
    );
    expect(normalizedExampleApp).toContain(
      'Android background continuation requires a visible app context'
    );
  });
});
