import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('documentation and example contract', () => {
  const root = process.cwd();
  const supportMatrixSource = readFileSync(
    join(root, 'scripts/release-support-matrix.ts'),
    'utf8'
  );
  const reactNativeSupport =
    supportMatrixSource.match(/reactNative:\s*'([^']+)'/)?.[1] ?? '0.83+';
  const expoSupport =
    supportMatrixSource.match(/expo:\s*'([^']+)'/)?.[1] ?? 'SDK 55+';

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
      'The example app also exposes evaluator-facing runtime diagnostics'
    );
    expect(readme).toContain(
      'current normalized runtime status from `getStatus()`'
    );
    expect(readme).toContain(
      'recent runtime events including `stateChanged`, `error`, `interruption`, and `audioRouteChanged`'
    );
    expect(readme).toContain(
      'normalized error-category surface: `permission`, `lifecycle`, `configuration`, `engine`, `platform`, and `internal`'
    );
    expect(readme).toContain(
      'supported iOS background continuation requires `UIBackgroundModes` to include `audio`'
    );
    expect(readme).toContain(
      'Android background continuation requires a visible app context for start, microphone permission, and an active foreground-service notification.'
    );
    expect(readme).toContain('optional downstream STT/TTS extension examples');
    expect(readme).toContain(
      'the package itself does not own transcription or synthesis'
    );
    expect(readme).toContain(
      'downstream STT/TTS integrations can be layered on top of the public event contract without modifying package internals'
    );
    expect(readme).toContain(
      'STT/TTS examples in the repo are illustrative downstream integrations, not built-in package runtime features'
    );
    expect(readme).toContain(`React Native \`${reactNativeSupport}\``);
    expect(readme).toContain(`Expo SDK \`${expoSupport.replace('SDK ', '')}\``);
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
      'current runtime diagnostics, recent runtime events, and normalized error categories'
    );
    expect(exampleReadme).toContain('../docs/bare-react-native-setup.md');
    expect(exampleReadme).toContain('../docs/expo-setup.md');
    expect(exampleReadme).toContain('../scripts/release-support-matrix.ts');
    expect(exampleReadme).toContain(
      'Expo CLI can resolve the example app config through `expo config --type prebuild --json`'
    );
    expect(exampleReadme).toContain(
      'Expo CLI can generate iOS and Android native projects from a temporary copy of the example app through `expo prebuild --clean --no-install`'
    );
    expect(exampleReadme).toContain('local plugin path (`../app.plugin.js`)');
    expect(exampleAppConfig).toContain('../app.plugin.js');
    expect(exampleAppConfig).toContain('voice-activator-example');
    expect(examplePackage).toContain('"expo": "^55.0.0"');
    expect(examplePackage).toContain('"expo-dev-client": "^6.0.0"');
    expect(examplePackage).toContain('"start": "expo start --dev-client"');
    expect(examplePackage).toContain('"ios": "expo run:ios"');
    expect(examplePackage).toContain('"android": "expo run:android"');
  });

  it('documents dedicated bare React Native and Expo setup guides with aligned support boundaries', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const bareSetup = readFileSync(
      join(root, 'docs/bare-react-native-setup.md'),
      'utf8'
    );
    const expoSetup = readFileSync(join(root, 'docs/expo-setup.md'), 'utf8');

    expect(readme).toContain('docs/bare-react-native-setup.md');
    expect(readme).toContain('docs/expo-setup.md');
    expect(readme).toContain('what is automated');
    expect(bareSetup).toContain('What Is Automatic vs Manual');
    expect(bareSetup).toContain(`React Native \`${reactNativeSupport}\``);
    expect(bareSetup).toContain('scripts/release-support-matrix.ts');
    expect(expoSetup).toContain('What Is Automatic vs Manual');
    expect(expoSetup).toContain('Expo Go is NOT supported.');
    expect(expoSetup).toContain('scripts/release-support-matrix.ts');
    expect(expoSetup).toContain(
      `Expo SDK \`${expoSupport.replace('SDK ', '')}\``
    );
  });

  it('replaces bootstrap placeholders in adjacent setup docs', () => {
    const gettingStarted = readFileSync(
      join(root, 'docs/getting-started.md'),
      'utf8'
    );
    const normalizedGettingStarted = gettingStarted.replace(/\s+/g, ' ');
    const troubleshooting = readFileSync(
      join(root, 'docs/troubleshooting.md'),
      'utf8'
    );

    expect(gettingStarted).not.toContain(
      'Placeholder created during Story 1.1 bootstrap.'
    );
    expect(gettingStarted).toContain('Bare React Native');
    expect(gettingStarted).toContain('Expo');
    expect(gettingStarted).toContain('stateChanged');
    expect(gettingStarted).toContain('error');
    expect(gettingStarted).toContain('wakeWordDetected');
    expect(gettingStarted).toContain('audioRouteChanged');
    expect(gettingStarted).toContain('current `getStatus()` snapshot');
    expect(gettingStarted).toContain('recent runtime events');
    expect(gettingStarted).toContain('normalized error categories');
    expect(gettingStarted).toContain('application-owned STT handoff');
    expect(gettingStarted).toContain(
      'TTS response step can run after detection or transcript handling'
    );
    expect(gettingStarted).toContain(
      'those speech flows remain outside the package runtime and use public APIs only'
    );
    expect(normalizedGettingStarted).toContain(
      'permission`, `lifecycle`, `configuration`, `engine`, `platform`, and `internal`'
    );
    expect(troubleshooting).not.toContain(
      'Placeholder created during Story 1.1 bootstrap.'
    );
    expect(troubleshooting).toContain('permission');
    expect(troubleshooting).toContain('platform');
    expect(troubleshooting).toContain(
      "addWakeWordListener('stateChanged', ...)"
    );
    expect(troubleshooting).toContain("addWakeWordListener('error', ...)");
    expect(troubleshooting).toContain('current runtime status');
    expect(troubleshooting).toContain('latest structured error');
    expect(troubleshooting).toContain('recent runtime events');
    expect(troubleshooting).toContain('normalized error categories');
    expect(troubleshooting).toContain('## Troubleshooting by Error Category');
    expect(troubleshooting).toContain('### `permission`');
    expect(troubleshooting).toContain('### `lifecycle`');
    expect(troubleshooting).toContain('### `configuration`');
    expect(troubleshooting).toContain('### `engine`');
    expect(troubleshooting).toContain('### `platform`');
    expect(troubleshooting).toContain('### `internal`');
    expect(troubleshooting).toContain('Expo Go is unsupported');
    expect(troubleshooting).toContain('primary runtime validation path today');
    expect(troubleshooting).toContain(
      'optional STT/TTS extension-point examples'
    );
    expect(troubleshooting).toContain(
      'downstream application integrations only'
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
    expect(exampleApp).toContain('interruption');
    expect(exampleApp).toContain('audioRouteChanged');
    expect(exampleApp).toContain('syncDiagnosticsFromStatus');
    expect(exampleApp).toContain('getStatus().lastError');
    expect(exampleApp).not.toContain('setLastError(null);');
    expect(exampleApp).toContain('void runSttExtensionFromDetection(event)');
    expect(exampleApp).toContain('setSttTranscript(null);');
    expect(exampleApp).toContain('setTtsResponse(null);');
    expect(exampleApp).toContain('Recent runtime events');
    expect(exampleApp).toContain('Normalized error categories');
    expect(exampleApp).toContain('Current runtime diagnostics');
    expect(exampleApp).toContain('Optional STT/TTS extension examples');
    expect(exampleApp).toContain('Run STT handoff example');
    expect(exampleApp).toContain('Run TTS response example');
    expect(exampleApp).toContain('wakeWordDetected');
    expect(exampleApp).toContain('application-level extension examples');
    expect(normalizedExampleApp).toContain(
      'iOS background continuation still requires the audio background mode and does not survive force-quit.'
    );
    expect(normalizedExampleApp).toContain(
      'Android background continuation requires a visible app context'
    );
  });
});
