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

  it('documents the Expo config and prebuild compatibility contract truthfully', () => {
    const expoSetup = readFileSync(join(root, 'docs/expo-setup.md'), 'utf8');
    const exampleReadme = readFileSync(join(root, 'example/README.md'), 'utf8');
    const exampleAppConfig = readFileSync(
      join(root, 'example/app.json'),
      'utf8'
    );
    const examplePackage = readFileSync(
      join(root, 'example/package.json'),
      'utf8'
    );

    expect(expoSetup).toContain('Expo Go is NOT supported.');
    expect(expoSetup).toContain('development build');
    expect(expoSetup).toContain('expo start --dev-client');
    expect(expoSetup).toContain('expo run:ios');
    expect(expoSetup).toContain('expo run:android');
    expect(expoSetup).toContain(
      'same public runtime API used by bare React Native consumers'
    );
    expect(expoSetup).toContain(
      'validation command that executes in CI against the example app'
    );
    expect(expoSetup).toContain('prebuild --clean --no-install');
    expect(expoSetup).toContain('local plugin path (`../app.plugin.js`)');
    expect(expoSetup).toContain('still validate your own Expo dev build');
    expect(expoSetup).toContain('device matrix');
    expect(expoSetup).toContain('native toolchain');
    expect(exampleReadme).toContain(
      'Expo config and prebuild compatibility contract'
    );
    expect(exampleReadme).toContain('expo start --dev-client');
    expect(exampleReadme).toContain('expo run:ios');
    expect(exampleReadme).toContain('expo run:android');
    expect(exampleReadme).toContain(
      'CI executes Expo config resolution against this example app'
    );
    expect(exampleReadme).toContain(
      'CI executes Expo prebuild generation against a temporary copy of this example app'
    );
    expect(exampleReadme).toContain(
      'Expo CLI can resolve the example app config through `expo config --type prebuild --json`'
    );
    expect(exampleReadme).toContain(
      'Expo CLI can generate iOS and Android native projects from a temporary copy of the example app through `expo prebuild --clean --no-install`'
    );
    expect(exampleAppConfig).toContain('../app.plugin.js');
    expect(exampleAppConfig).toContain('voice-activator-example');
    expect(examplePackage).toContain('"expo": "^55.0.0"');
    expect(examplePackage).toContain('"expo-dev-client": "^6.0.0"');
    expect(examplePackage).toContain('"start": "expo start --dev-client"');
    expect(examplePackage).toContain('"ios": "expo run:ios"');
    expect(examplePackage).toContain('"android": "expo run:android"');
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
