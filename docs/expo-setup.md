# Expo Setup

`react-native-voice-activator` supports Expo as a config-plugin and prebuild
integration path layered through the config plugin.

Expo Go is NOT supported.

## Supported Expo Path

The supported Expo path today is:

1. Expo SDK `55+`
2. config resolution plus native project generation through Expo prebuild, not Expo Go
3. the package plugin enabled in app config
4. the example app exposes the same Expo-facing commands consumers use to generate native projects:
   - `expo start`
   - `expo run:ios`
   - `expo run:android`
   - `expo prebuild`
5. the same public runtime API used by bare React Native consumers:
   - `initialize`
   - `startDetection`
   - `stopDetection`
   - `getStatus`
   - `dispose`
   - typed listeners through `addWakeWordListener`

Expo consumers do not get a separate runtime API, separate state vocabulary, or
Expo-only lifecycle methods.

## App Config

Add the plugin to your Expo app config:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-voice-activator",
        {
          "microphonePermissionText": "This app uses the microphone to detect wake words."
        }
      ]
    ]
  }
}
```

The plugin applies the current native requirements:

- iOS microphone usage description
- iOS `UIBackgroundModes: ["audio"]`
- Android microphone and foreground-service permissions
- Android `WakeWordForegroundService` manifest entry
- generated Sherpa asset manifests inside the Expo-generated `ios/` and
  `android/` native project folders
- Expo prebuild-time verification that the package-owned Sherpa native asset
  bundle and selected model-file variants are present for both iOS and Android

## What Is Automatic vs Manual

Automatic through the Expo config plugin:

- iOS microphone permission text
- iOS `UIBackgroundModes: ["audio"]`
- Android microphone and foreground-service permissions
- Android `WakeWordForegroundService` manifest entry
- generated Sherpa asset manifest files that record the package-owned asset
  bundle resolved during Expo prebuild for each native platform
- fail-fast verification that the bundled Sherpa model files still exist under
  the package-owned native asset roots used by the podspec and Android Gradle

Manual in your app:

- generate and run native projects instead of using Expo Go
- run Expo config/prebuild as part of native project generation
- keep your installed package contents intact so Expo prebuild can resolve the
  bundled Sherpa native assets
- validate runtime behavior on your target devices after prebuild
- validate iOS and Android background constraints in your own app context
- add optional native dependencies only for the STT/TTS adapters you actually
  wire in (for example `whisper.rn` and `react-native-fs` for
  `WhisperRNSTTAdapter`, or `onnxruntime-react-native` for `CustomTTSAdapter`)
- expect some vendor stacks to declare additional optional peers (for example
  `react-native-device-info`) that your app only needs when you adopt those
  broader SDK flows
- run `expo prebuild` again after changing native dependencies so generated
  `ios/` / `android/` projects stay in sync

## Built-In Sherpa Asset Model

- the default engine remains credential-free and uses the package-owned bundled
  native Sherpa asset set
- no separate engine credential or vendor account provisioning is required for
  the built-in engine path
- apps that intentionally ship custom Sherpa assets can still use
  `engineConfig.assetKeys.modelAssetKey` and
  `engineConfig.assetKeys.keywordAssetKey`
- Expo does not introduce a separate asset runtime; the config plugin and
  prebuild flow align generated native projects with the same package-owned
  native asset model used by bare React Native
- optional STT/TTS adapters add their own dependencies and model management;
  the default wake-word path remains the bundled Sherpa engine only
- the current built-in STT path still depends on the deprecated upstream
  `react-native-audio-recorder-player` package for recorder I/O when using
  `WhisperRNSTTAdapter`; treat that as an implementation detail that may change
  in a future package release

## Public API Contract

Expo-generated native apps use the same public package contract as bare React
Native consumers.

```ts
import {
  addWakeWordListener,
  dispose,
  getStatus,
  initialize,
  startDetection,
  stopDetection,
} from 'react-native-voice-activator';
```

## Current Validation Boundary

The repository currently proves Expo config and prebuild compatibility through:

- config-plugin integration tests
- example `app.json` plugin registration
- example runtime usage of the same public lifecycle API
- Expo config-plugin tests that verify Sherpa asset-manifest generation and
  accepted model-file variants against package-owned native bundle roots
- contract checks that keep docs, app config, and package wiring aligned
- an Expo CLI `config --type prebuild --json` validation command that executes in CI against the example app
- an Expo CLI `prebuild --clean --no-install` validation command that executes
  in CI against a temporary copy of the example app and confirms the generated
  native projects contain Sherpa asset manifests that resolve to real package
  assets

The example app uses a local plugin path (`../app.plugin.js`) for monorepo
validation. Published consumers should continue to register the plugin as
`react-native-voice-activator`.

The repository does not currently boot a full Expo runtime session in CI.

That means this repo validates Expo plugin resolution, Expo config resolution,
Expo prebuild generation, and the documented package integration surface, but
you must still validate your own Expo-generated native app on the target SDK,
device matrix, and native toolchain before treating it as production-ready.

## Release Support Matrix

Current support claims are anchored to:

- Expo SDK `55+`
- React Native `0.83+`
- iOS and Android only

The support matrix source in this repo is
`scripts/release-support-matrix.ts`. Expo setup docs, README, and example docs
should stay aligned with that file.

## Explicit Limitations

- Expo Go is NOT supported.
- The current CI path executes Expo config resolution and Expo prebuild generation, not a full Expo runtime session.
- This repository currently proves Expo config and prebuild compatibility, not full Expo runtime parity on all devices.
- if you enable optional native STT/TTS stacks, validate Expo prebuild and
  runtime behavior in your own generated native app
- iOS background continuation still depends on the app declaring the audio
  background mode and staying alive after explicit activation.
- Android background continuation still depends on visible-context start,
  microphone permission, foreground-service ownership, and OEM policy.
