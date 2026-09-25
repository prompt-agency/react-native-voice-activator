import { existsSync, readFileSync } from 'node:fs';
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
      'real engine-backed local wake word detection is implemented through the built-in native-managed engine path'
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
    expect(readme).toContain('CustomTTSAdapter');
    expect(readme).toContain('onnxruntime-react-native');
    expect(readme).toContain('## Optional: Text-to-Speech');
    expect(readme).toContain('## Wake-to-Transcribe-to-Speak Flow');
    expect(readme).toContain(
      'STT and TTS providers are **opt-in but package-driven**. You supply the provider; the package calls it.'
    );
    expect(readme).toContain(
      'If you pass no `sttProvider`, the package emits `wakeWordDetected` and stops there'
    );
    expect(readme).toContain(
      'the package takes over the flow and drives it for you'
    );
    // Guard against the old, inaccurate framing coming back.
    expect(readme).not.toContain(
      'the package itself does not own transcription or synthesis'
    );
    expect(readme).not.toContain(
      'those speech flows remain outside the package runtime'
    );
    expect(readme).toContain('## Built-In Model Configuration');
    expect(readme).toContain('The supported public override points remain');
    expect(readme).toContain('engineConfig.assetKeys.modelAssetKey');
    expect(readme).toContain('engineConfig.assetKeys.keywordAssetKey');
    expect(readme).not.toContain('provide an AccessKey');
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
    expect(expoSetup).toContain('config-plugin and prebuild');
    expect(expoSetup).toContain('expo start');
    expect(expoSetup).toContain('expo run:ios');
    expect(expoSetup).toContain('expo run:android');
    expect(expoSetup).toContain(
      'same public runtime API used by bare React Native consumers'
    );
    expect(expoSetup).toContain(
      'Sherpa-ONNX asset manifests inside the generated native projects'
    );
    expect(expoSetup).toContain(
      'validation command that executes in CI against the example app'
    );
    expect(expoSetup).toContain('prebuild --clean --no-install');
    expect(expoSetup).toContain('local plugin path (`../app.plugin.js`)');
    expect(expoSetup).toContain(
      'still validate your own Expo-generated native app'
    );
    expect(expoSetup).toContain('device matrix');
    expect(expoSetup).toContain('native toolchain');
    expect(exampleReadme).toContain(
      'Expo config and prebuild compatibility contract'
    );
    expect(exampleReadme).toContain('expo start');
    expect(exampleReadme).toContain('expo run:ios');
    expect(exampleReadme).toContain('expo run:android');
    expect(exampleReadme).toContain('expo prebuild');
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
    expect(exampleReadme).toContain(
      'Expo prebuild generates a Sherpa asset manifest in each native project and'
    );
    expect(exampleReadme).toContain('local plugin path (`../app.plugin.js`)');
    expect(exampleAppConfig).toContain('../app.plugin.js');
    expect(exampleAppConfig).toContain('voice-activator-example');
    expect(examplePackage).toContain('"expo": "^55.0.0"');
    expect(examplePackage).toContain('"expo-dev-client"');
    expect(examplePackage).toContain('"start": "expo start"');
    expect(examplePackage).toContain(
      '"prebuild": "CI=1 expo prebuild --clean"'
    );
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
    expect(readme).toContain('automatic native configuration');
    expect(bareSetup).toContain('What Is Automatic vs Manual');
    expect(bareSetup).toContain(`React Native \`${reactNativeSupport}\``);
    expect(bareSetup).toContain('scripts/release-support-matrix.ts');
    expect(bareSetup).toContain('react-native-fs');
    expect(bareSetup).toContain('react-native-audio-recorder-player');
    expect(expoSetup).toContain('What Is Automatic vs Manual');
    expect(expoSetup).toContain('Expo Go is NOT supported.');
    expect(expoSetup).toContain('scripts/release-support-matrix.ts');
    expect(expoSetup).toContain(
      `Expo SDK \`${expoSupport.replace('SDK ', '')}\``
    );
  });

  it('keeps the bundled Sherpa native integration assets wired through package-owned paths', () => {
    const podspec = readFileSync(join(root, 'VoiceActivator.podspec'), 'utf8');
    const androidBuildGradle = readFileSync(
      join(root, 'android/build.gradle'),
      'utf8'
    );
    const iosAssetLoader = readFileSync(
      join(root, 'ios/Engines/SherpaOnnx/SherpaOnnxAssetLoader.mm'),
      'utf8'
    );
    const androidAssetLoader = readFileSync(
      join(
        root,
        'android/src/main/java/com/voiceactivator/Engines/SherpaOnnx/SherpaOnnxAssetLoader.kt'
      ),
      'utf8'
    );
    const androidRuntimeCoordinator = readFileSync(
      join(
        root,
        'android/src/main/java/com/voiceactivator/Runtime/WakeWordRuntimeCoordinator.kt'
      ),
      'utf8'
    );
    const publicRuntime = readFileSync(
      join(root, 'src/public/voice-activator.ts'),
      'utf8'
    );

    expect(podspec).toContain(
      's.vendored_frameworks = "ios/Vendor/SherpaOnnx/*.xcframework"'
    );
    expect(podspec).toContain('s.resources = "ios/Assets/**/*"');
    expect(androidBuildGradle).toContain(
      'implementation files("libs/sherpa-onnx-static-link-onnxruntime-1.12.29.aar")'
    );
    expect(androidBuildGradle).toContain(
      'assets.srcDirs += ["src/main/assets"]'
    );
    expect(iosAssetLoader).toContain('pathForResource:assetName');
    expect(iosAssetLoader).not.toContain(
      '@"ios/Assets/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"'
    );
    expect(androidAssetLoader).toContain('modelAssetKey');
    expect(androidAssetLoader).toContain('keywordAssetKey');
    expect(androidRuntimeCoordinator).toContain(
      'detector?.ensureInitialized()'
    );
    expect(publicRuntime).toContain('createNativeManagedEngineRuntime()');
    expect(
      existsSync(
        join(
          root,
          'ios/Assets/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01/README.md'
        )
      )
    ).toBe(true);
    expect(
      existsSync(
        join(
          root,
          'android/src/main/assets/voice-activator-sherpa-onnx/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01/README.md'
        )
      )
    ).toBe(true);
    expect(
      existsSync(
        join(root, 'ios/Vendor/SherpaOnnx/sherpa-onnx.xcframework/Info.plist')
      )
    ).toBe(true);
    expect(
      existsSync(
        join(
          root,
          'ios/Vendor/SherpaOnnx/sherpa-onnxruntime.xcframework/Info.plist'
        )
      )
    ).toBe(true);
    expect(
      existsSync(
        join(
          root,
          'android/libs/sherpa-onnx-static-link-onnxruntime-1.12.29.aar'
        )
      )
    ).toBe(true);
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
    expect(gettingStarted).toContain('Wake-to-Transcribe-to-Speak Guide');
    expect(gettingStarted).toContain(
      'That wake -> transcribe -> optional speak flow is the supported extension model.'
    );
    expect(gettingStarted).toContain(
      'Your app can own steps 2 and 3 through custom providers'
    );
    expect(gettingStarted).toContain('Built-In Engine Defaults');
    expect(gettingStarted).toContain('native-managed Sherpa-ONNX');
    expect(gettingStarted).toContain('engineConfig.assetKeys.modelAssetKey');
    expect(gettingStarted).toContain('engineConfig.assetKeys.keywordAssetKey');
    expect(gettingStarted).toContain('HELLO WORLD');
    expect(gettingStarted).toContain('MERRY CHRISTMAS');
    expect(gettingStarted).not.toContain('provide an AccessKey');
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
      'app-level handoff code separately from the package runtime itself'
    );
    expect(troubleshooting).toContain(
      'Troubleshoot the Provider Pattern Separately'
    );
    expect(troubleshooting).toContain(
      'The example app previews that provider pattern with simulated host implementations.'
    );
    expect(troubleshooting).toContain('optional STT/TTS provider adapters');
  });

  it('keeps the example app aligned with the public runtime flow and limitation note', () => {
    // The example app is split across App.tsx and three screen files.
    // Combine them all for contract assertions.
    const exampleApp = readFileSync(join(root, 'example/src/App.tsx'), 'utf8');
    const wakeWordScreen = readFileSync(
      join(root, 'example/src/screens/WakeWordScreen.tsx'),
      'utf8'
    );
    const sessionScreen = readFileSync(
      join(root, 'example/src/screens/SessionScreen.tsx'),
      'utf8'
    );
    const manualScreen = readFileSync(
      join(root, 'example/src/screens/ManualScreen.tsx'),
      'utf8'
    );
    const allSource = [
      exampleApp,
      wakeWordScreen,
      sessionScreen,
      manualScreen,
    ].join('\n');
    const normalizedAllSource = allSource.replace(/\s+/g, ' ');

    // App.tsx wires the three screens
    expect(exampleApp).toContain('WakeWordScreen');
    expect(exampleApp).toContain('SessionScreen');
    expect(exampleApp).toContain('ManualScreen');

    // Wake word runtime — covered by WakeWordScreen
    expect(allSource).toContain('addWakeWordListener');
    expect(allSource).toContain('getStatus');
    expect(allSource).toContain('initialize');
    expect(allSource).toContain('startDetection');
    expect(allSource).toContain('stopDetection');
    expect(allSource).toContain('dispose');
    expect(allSource).toContain('interruption');
    expect(allSource).toContain('audioRouteChanged');
    expect(allSource).toContain('wakeWordDetected');
    expect(allSource).not.toContain('setLastError(null);');
    expect(allSource).toContain('autoSpeak: true');
    expect(allSource).toContain('WhisperRNSTTAdapter');
    expect(allSource).toContain('engineConfig');
    expect(allSource).toContain('keywordAssetKey');
    expect(allSource).toContain('All bundled phrases');
    expect(allSource).toContain('HELLO WORLD');
    expect(allSource).toContain('Bundled keyword presets');
    expect(allSource).toContain('Keyword detection status');
    expect(allSource).toContain(
      'Keyword selection changed. Run Initialize again before Start detection'
    );
    expect(allSource).toContain('Recent runtime events');

    // Background behavior notes
    expect(normalizedAllSource).toContain(
      'iOS background continuation still requires the audio'
    );
    expect(normalizedAllSource).toContain(
      'Android background continuation requires a visible app context'
    );

    // Conversation session — covered by SessionScreen
    expect(allSource).toContain('useVoiceSession');
    expect(allSource).toContain('aiHandler');
    expect(allSource).toContain('reListenMode');

    // Direct STT/TTS — covered by ManualScreen
    expect(allSource).toContain('WhisperRNSTTAdapter');
    expect(allSource).toContain('transcribe');
  });

  it('ships reference provider adapters outside package core', () => {
    const examplesIndex = readFileSync(
      join(root, 'docs/examples/index.md'),
      'utf8'
    );
    const expoSpeechTts = readFileSync(
      join(root, 'docs/examples/expo-speech-tts-provider.md'),
      'utf8'
    );
    const expoSpeechRecognitionStt = readFileSync(
      join(root, 'docs/examples/expo-speech-recognition-stt-provider.md'),
      'utf8'
    );
    const exampleReadme = readFileSync(join(root, 'example/README.md'), 'utf8');

    expect(examplesIndex).toContain('SpeechToTextProvider');
    expect(examplesIndex).toContain('TextToSpeechProvider');
    expect(examplesIndex).toContain('expo-speech-tts-provider.md');
    expect(examplesIndex).toContain('expo-speech-recognition-stt-provider.md');
    expect(examplesIndex).toContain('custom-tts-provider.md');
    expect(examplesIndex).toContain('Recommended Evaluation Flow');
    expect(examplesIndex).toContain('real wake-word runtime');
    expect(examplesIndex).toContain(
      'separate simulated host-provider previews'
    );

    expect(expoSpeechTts).toContain('expo-speech');
    expect(expoSpeechTts).toContain('TextToSpeechProvider');
    expect(expoSpeechTts).toContain(
      'initialize({ ttsProvider, autoSpeak: true })'
    );
    expect(expoSpeechTts).toContain(
      'Do not move it into the library package core.'
    );

    expect(expoSpeechRecognitionStt).toContain('expo-speech-recognition');
    expect(expoSpeechRecognitionStt).toContain('SpeechToTextProvider');
    expect(expoSpeechRecognitionStt).toContain('initialize({ sttProvider })');
    expect(expoSpeechRecognitionStt).toContain(
      'Do not move it into the library package core.'
    );
    expect(expoSpeechRecognitionStt).toContain(
      'Implement the bridge in your app against the exact vendor version you ship.'
    );
    expect(expoSpeechRecognitionStt).not.toContain(
      'ExpoSpeechRecognitionModule.addListener'
    );

    expect(exampleReadme).toContain('../docs/examples/');
    expect(exampleReadme).toContain('Provider Pattern Evaluation Flow');
    expect(exampleReadme).toContain('The wake step is real package behavior.');
    expect(exampleReadme).toContain('separate simulated host-provider bridges');
    expect(exampleReadme).toContain('WhisperRNSTTAdapter');
    expect(exampleReadme).toContain('choose a bundled keyword preset');
    expect(exampleReadme).toContain('They map to pre-bundled keyword files');
  });

  it('replaces placeholder and migration-era documentation with Sherpa-era guidance', () => {
    const migration = readFileSync(join(root, 'docs/migration.md'), 'utf8');
    const androidBatteryOptimization = readFileSync(
      join(root, 'docs/android-battery-optimization.md'),
      'utf8'
    );
    const appStoreSubmission = readFileSync(
      join(root, 'docs/app-store-submission.md'),
      'utf8'
    );
    const exampleReadme = readFileSync(join(root, 'example/README.md'), 'utf8');
    const bareSetup = readFileSync(
      join(root, 'docs/bare-react-native-setup.md'),
      'utf8'
    );
    const expoSetup = readFileSync(join(root, 'docs/expo-setup.md'), 'utf8');

    expect(migration).not.toContain(
      'Placeholder created during Story 1.1 bootstrap.'
    );
    expect(migration).toContain('credential-era built-in engine path');
    expect(migration).toContain('native-managed Sherpa-ONNX');
    expect(migration).toContain('engineConfig.assetKeys.modelAssetKey');
    expect(migration).toContain('engineConfig.assetKeys.keywordAssetKey');
    expect(migration).toContain('credential-style default-engine setup step');

    expect(androidBatteryOptimization).not.toContain(
      'Placeholder created during Story 1.1 bootstrap.'
    );
    expect(androidBatteryOptimization).toContain(
      'foreground-service ownership'
    );
    expect(androidBatteryOptimization).toContain(
      'foreground_service_visible_context_required'
    );
    expect(androidBatteryOptimization).toContain('OEM battery management');

    expect(appStoreSubmission).not.toContain(
      'Placeholder created during Story 1.1 bootstrap.'
    );
    expect(appStoreSubmission).toContain('NSMicrophoneUsageDescription');
    expect(appStoreSubmission).toContain('UIBackgroundModes');
    expect(appStoreSubmission).toContain('on-device-first baseline detection');
    expect(appStoreSubmission).toContain('always-on after force-quit');

    expect(exampleReadme).not.toContain('Story 4.2:');
    expect(exampleReadme).toContain('the current Expo integration path');

    expect(bareSetup).toContain('Built-In Sherpa Asset Model');
    expect(bareSetup).toContain('engineConfig.assetKeys.modelAssetKey');
    expect(bareSetup).toContain('engineConfig.assetKeys.keywordAssetKey');
    expect(bareSetup).not.toContain('provide an AccessKey');

    expect(expoSetup).toContain('Built-In Sherpa Asset Model');
    expect(expoSetup).toContain('engineConfig.assetKeys.modelAssetKey');
    expect(expoSetup).toContain('engineConfig.assetKeys.keywordAssetKey');
    expect(expoSetup).not.toContain('provide an AccessKey');
  });
});
