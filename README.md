# react-native-voice-activator

React Native and Expo wake word runtime library.

Current implementation status:

- the public lifecycle API is implemented
- typed runtime state and detection events are implemented
- real engine-backed local wake word detection is implemented through the built-in native-managed engine path
- a supported foreground runtime flow exists
- iOS background continuation is supported only when the app declares the audio background mode and remains alive
- Android background continuation is supported only when detection starts from a visible app context with microphone permission and the package can hold an active foreground-service notification

The current runtime is useful for validating app integration, lifecycle handling, engine-backed detection, and the constrained iOS background continuation model.

The example app also exposes evaluator-facing runtime diagnostics:

- current normalized runtime status from `getStatus()`
- latest structured error from `getStatus().lastError`
- recent runtime events including `stateChanged`, `error`, `interruption`, and `audioRouteChanged`
- the normalized error-category surface: `permission`, `lifecycle`, `configuration`, `engine`, `platform`, and `internal`

The example app also includes optional downstream STT/TTS extension examples:

- wake-word detection can trigger an application-owned STT handoff through `wakeWordDetected`
- a downstream TTS response can be wired after detection or transcript handling
- the package provides optional built-in STT/TTS via RunAnywhere ONNX when configured with `builtInSTT` / `builtInTTS`; user-owned providers via `sttProvider` / `ttsProvider` remain supported for custom implementations
- concrete reference adapter examples now live under `docs/examples/` and stay outside package core

## Wake-to-Transcribe-to-Speak Flow

The current evaluator path for a broader assistant experience is:

1. the package-owned native wake-word runtime detects a phrase and emits `wakeWordDetected`
2. the optional JS provider orchestration path can call an application-owned `sttProvider`
3. the runtime can optionally call an application-owned `ttsProvider` after a successful transcription when both `sttProvider` and `autoSpeak: true` are configured

This flow is demonstrated through the public API and typed events. The package owns the wake-word runtime; STT and TTS remain opt-in integrations. STT and TTS stay opt-in, application-owned — the package itself does not own transcription or synthesis. Custom providers stay application-owned and are documented in `docs/examples/`, while built-in RunAnywhere adapters are available as an explicit opt-in exception. STT/TTS examples in the repo are illustrative downstream integrations, not built-in package runtime features, with the exception of the opt-in built-in RunAnywhere path. The example app shows the real wake-word runtime plus separate simulated provider previews that use the same app-owned adapter shape.

The bundled Sherpa keyword set currently includes `HELLO WORLD`, `HI GOOGLE`,
`HEY SIRI`, `ALEXA`, `LOVE AND PEACE`, `PLAY MUSIC`, `GO HOME`, `HAPPY NEW
YEAR`, and `MERRY CHRISTMAS`. The example app now exposes those as preset
keyword selections by passing `engineConfig.assetKeys.keywordAssetKey` through
the existing `initialize()` API.

## Reliability evaluation artifacts

The current evaluation harness for quiet/noisy and endurance validation is tracked in:

- `tests/fixtures/reliability/reference-device-matrix.json`
- `tests/fixtures/reliability/quiet-acceptance-set.json`
- `tests/fixtures/reliability/noisy-acceptance-set.json`
- `tests/fixtures/reliability/endurance-plan.json`
- `tests/fixtures/reliability/latest-results.json`

Today those artifacts prove:

- the evaluation contract and fixture manifests exist
- Android native compile evidence is recorded
- physical-device quiet/noisy and 30-minute endurance runs are still pending and must not be overstated
- there is not yet an automated runner that executes those scenarios end-to-end
- completed physical-device runs must replace placeholder null metrics in `latest-results.json` with measured values

## Installation

```sh
npm install react-native-voice-activator
```

## Quickstart

```ts
import {
  addWakeWordListener,
  dispose,
  getStatus,
  initialize,
  startDetection,
  stopDetection,
} from 'react-native-voice-activator';

async function runQuickstart() {
  const stateSubscription = addWakeWordListener('stateChanged', (event) => {
    console.log('state changed:', event.state);
  });

  const detectionSubscription = addWakeWordListener(
    'wakeWordDetected',
    (event) => {
      console.log('detection event:', event.detectedPhrase, event.detectedAt);
    }
  );

  const status = getStatus();

  if (status.state === 'unsupported') {
    console.log(status.reason);
    stateSubscription.remove();
    detectionSubscription.remove();
    return;
  }

  try {
    await initialize();
    await startDetection();
    await stopDetection();
    await dispose();
  } finally {
    stateSubscription.remove();
    detectionSubscription.remove();
  }
}

runQuickstart().catch((error) => {
  console.error('quickstart failed:', error);
});
```

## What This Quickstart Proves Today

- your app can import the public package API
- lifecycle methods work through the current supported foreground runtime path
- `stateChanged` and `wakeWordDetected` events are wired correctly
- `getStatus()` reflects runtime state transitions
- downstream STT/TTS integrations can be layered on top of the public event contract without modifying package internals
- The package owns the wake-word runtime; STT and TTS stay opt-in, application-owned: the package itself does not own transcription or synthesis

## Built-In RunAnywhere STT/TTS Provider

Install the optional speech dependencies:

```sh
npm install @runanywhere/core @runanywhere/onnx react-native-nitro-modules react-native-audio-recorder-player react-native-fs
```

Use them through `initialize()`:

```ts
await initialize({
  builtInSTT: { modelId: 'whisper-tiny-en' },
  builtInTTS: { modelId: 'piper-en-lessac' },
  onBuiltInProgress: ({ message, progress }) => {
    console.log(message, progress); // optional download progress UI
  },
  autoSpeak: true,
});
```

Supported model IDs: `whisper-tiny-en` (STT, ~75 MB) and `piper-en-lessac` (TTS, ~65 MB). The package handles SDK initialization, model registry, download, and path resolution inside `initialize()` — no manual model management is required.

Notes:

- explicit `sttProvider` / `ttsProvider` always override `builtInSTT` / `builtInTTS`
- `TTSOptions.language` is not supported by the RunAnywhere adapters
- adapter initialization failures surface `builtin_provider_init_failed`
- `react-native-audio-recorder-player` currently works for the built-in STT path, but the package is deprecated upstream; treat it as a compatibility dependency and expect this package to migrate away from it in a future release rather than building new app-level abstractions around that recorder API
- `react-native-fs` is required by the built-in TTS path to locate the `.onnx` file inside the extracted Piper archive; it is not needed for STT only
- `@runanywhere/core` also declares optional peers such as `react-native-fs`, `react-native-blob-util`, `react-native-device-info`, and `react-native-zip-archive`; `react-native-blob-util`, `react-native-device-info`, and `react-native-zip-archive` are relevant for broader RunAnywhere model download, storage, or device-info flows and are not required for the built-in STT/TTS path
- **iOS ONNX compatibility**: this package bundles `sherpa-onnxruntime.xcframework` by default; when using `@runanywhere/onnx` for `builtInSTT`/`builtInTTS`, set `ENV['RUNANYWHERE_ONNX_COMPAT'] = '1'` at the top of your `ios/Podfile` target block before running `pod install` — this excludes the bundled ORT and lets the wake-word engine share RunAnywhere's ONNX Runtime (same ORT 1.17.1, no duplicate symbols, no error -401); see `docs/ios-onnx-conflict-resolution.md` for details
- this repo typechecks against local RunAnywhere shim types because the vendor packages publish React Native source files as their `types` entry; CI counterbalances that with `yarn verify:runanywhere-contract`, which checks the installed vendor source surface still matches the built-in adapter contract this package expects
- setup docs contain additional native/prebuild requirements for bare React Native and Expo consumers

## Built-In Model Configuration

The built-in default engine is the package-owned native-managed Sherpa-ONNX path.

- the default path uses bundled native Sherpa model assets and requires no
  vendor credential
- the supported public override points remain
  `engineConfig.assetKeys.modelAssetKey` and
  `engineConfig.assetKeys.keywordAssetKey`
- custom asset keys are for host apps that intentionally ship their own Sherpa
  model bundle and keyword file through the same native asset ownership model
- Expo consumers still configure those assets through the same config-plugin and
  prebuild path; the package does not support JS-owned runtime model download

## Current Limitations

- iOS background continuation still depends on the host app staying alive after explicit activation
- iOS background continuation only works in apps that declare the audio background mode and keep the app alive; force-quit and cold relaunch are still unsupported
- Android background continuation requires a visible app context for start, microphone permission, and an active foreground-service notification.
- Android background behavior can still be constrained by OEM battery management and unsupported hidden-start scenarios.
- Expo automation and production detection quality hardening are later stories
- STT/TTS examples in the repo now cover both built-in RunAnywhere adapters in `src/providers/runanywhere/` and illustrative downstream application-owned adapters in `docs/examples/`
- `builtInSTT` / `builtInTTS` work on iOS when `RUNANYWHERE_ONNX_COMPAT=1` is set in the Podfile — this routes the wake-word engine's ONNX Runtime dependency through RunAnywhere's framework, eliminating the duplicate symbol conflict; see `docs/ios-onnx-conflict-resolution.md`

## Compatibility Notes

- current support matrix: React Native `0.83+`, Expo SDK `55+`
- use the package through the public API exported from `src/index.ts`
- choose the path-specific setup guide that matches your app:
  - bare React Native: `docs/bare-react-native-setup.md`
  - Expo: `docs/expo-setup.md`
- check `getStatus()` before assuming lifecycle methods are available in your environment
- if `getStatus().state === 'unsupported'`, the runtime is not available and lifecycle methods will reject with a consistent error message
- today, the supported validation path is the repo example app and equivalent bare React Native consumers using the current library scaffold
- supported iOS background continuation requires `UIBackgroundModes` to include `audio`; without it, the runtime will surface an explicit `unsupported` state after the app backgrounds
- supported Android background continuation requires `RECORD_AUDIO`, foreground-service permissions, and a start from a visible activity context; otherwise the runtime surfaces an explicit `unsupported` or `permission` failure
- Expo config and prebuild compatibility are validated through docs, contract checks, the Expo-capable example package scripts in `example/package.json`, an Expo CLI config resolution check against the example app, and Expo prebuild generation against a temporary copy of the example app.
- Expo Go is NOT supported.
- this quickstart is not a claim of full Expo runtime CI execution or production-ready device coverage yet

## Setup Guides

- Bare React Native setup: `docs/bare-react-native-setup.md`
- Expo setup: `docs/expo-setup.md`

Both guides identify:

- what is automated
- what still requires developer action
- what platform limitations still apply
- what the repository actually validates today

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
