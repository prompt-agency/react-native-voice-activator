# Getting Started

Use the path-specific setup guide that matches your app:

- Bare React Native: [`./bare-react-native-setup.md`](./bare-react-native-setup.md)
- Expo: [`./expo-setup.md`](./expo-setup.md)

## Public API

Both integration paths use the same public runtime API:

- `initialize`
- `startDetection`
- `stopDetection`
- `getStatus`
- `dispose`
- `addWakeWordListener`

The most important public events are:

- `stateChanged`
- `error`
- `wakeWordDetected`
- `audioRouteChanged`

The example app exposes those runtime diagnostics directly so evaluators can see:

- the current `getStatus()` snapshot
- the latest structured error
- recent runtime events
- the normalized error categories used by the package contract

The example app also includes optional downstream extension examples showing how:

- `wakeWordDetected` can trigger an application-owned STT handoff
- a TTS response step can run after detection or transcript handling
- those speech flows remain outside the package runtime and use public APIs only

## Built-In Engine Defaults

- the default built-in engine is native-managed Sherpa-ONNX
- the default path uses package-owned bundled native assets and requires no
  engine credential or vendor account provisioning
- if your app intentionally ships custom Sherpa assets, the public override
  points are `engineConfig.assetKeys.modelAssetKey` and
  `engineConfig.assetKeys.keywordAssetKey`
- Expo and bare React Native consumers use the same public configuration shape;
  Expo just layers the package config plugin and prebuild flow on top of it

## Current Support Boundary

- Bare React Native is the primary runtime validation path.
- Expo support currently proves config-plugin resolution and prebuild generation.
- Expo Go is unsupported.
- iOS background continuation requires the audio background mode and does not
  survive force-quit.
- Android background continuation requires a visible activity context,
  microphone permission, and a foreground-service notification.
- structured failures are normalized into `permission`, `lifecycle`,
  `configuration`, `engine`, `platform`, and `internal`

## Next Docs

- Background behavior: [`./background-behavior.md`](./background-behavior.md)
- Reliability validation: [`./reliability-validation.md`](./reliability-validation.md)
- Troubleshooting: [`./troubleshooting.md`](./troubleshooting.md)
