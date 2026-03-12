# Bare React Native Setup

`react-native-voice-activator` supports bare React Native as the primary runtime
integration path.

## Supported Bare React Native Path

The supported bare React Native path today is:

1. React Native `0.83+`
2. iOS and Android native projects generated and maintained by React Native CLI
3. the package installed from npm/yarn/pnpm/bun
4. the same public runtime API used everywhere else:
   - `initialize`
   - `startDetection`
   - `stopDetection`
   - `getStatus`
   - `dispose`
   - typed listeners through `addWakeWordListener`

Bare React Native remains the primary runtime validation surface for the library.

## Install

Choose one package manager:

```sh
npm install react-native-voice-activator
```

```sh
yarn add react-native-voice-activator
```

```sh
pnpm add react-native-voice-activator
```

```sh
bun add react-native-voice-activator
```

Then install iOS pods in your app:

```sh
cd ios && bundle exec pod install
```

The monorepo example app uses the same command inside `example/ios/`, but
consumer apps should run `pod install` inside their own `ios/` directory.

## What Is Automatic vs Manual

Automatic through the package:

- native module registration
- iOS and Android runtime/state/event contract
- built-in native-managed engine wiring
- Android native module and foreground-service runtime implementation

Manual in your app:

- grant microphone permission at runtime
- validate iOS background behavior on your actual app target
- validate Android foreground-service behavior on your device/OEM matrix
- keep your native toolchain compatible with the supported React Native line

## iOS Requirements

Required for basic use:

- microphone permission
- CocoaPods installation

Required for supported iOS background continuation:

- `UIBackgroundModes` must include `audio`
- the host app must remain alive after explicit activation

Not supported:

- force-quit continuation
- cold relaunch background recovery

If the app backgrounds without the required audio background mode, the runtime
surfaces an explicit `unsupported` state with a platform error instead of
pretending detection continues.

## Android Requirements

Required for basic use:

- microphone permission
- a supported visible activity context when starting detection

Required for supported Android background continuation:

- foreground-service ownership
- an active notification while runtime ownership is held
- runtime start from a visible app context

Not supported:

- hidden/background start without visible context
- OEM-specific battery-management guarantees

If runtime ownership or service start cannot be established, the runtime
surfaces an explicit platform error such as
`foreground_service_visible_context_required`.

## Runtime Contract

Bare React Native uses the standard package API:

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

The package does not expose a second native-only API for bare React Native
consumers.

## Built-In Sherpa Asset Model

The default engine path is credential-free and package-owned.

- default detection uses the bundled native Sherpa asset set shipped with the
  package
- no separate vendor credential setup exists on the supported default path
- host apps that intentionally ship custom Sherpa assets can use
  `engineConfig.assetKeys.modelAssetKey` and
  `engineConfig.assetKeys.keywordAssetKey`
- custom assets should still be packaged as native app assets; the package does
  not support JS-side model download or JS-owned inference

## Current Validation Boundary

The repository currently proves bare React Native support through:

- the example app runtime path
- package typecheck, lint, and Jest coverage
- native iOS/Android runtime implementation in the library
- Android native compile verification
- iOS native code and bridge review, with some device-level validation still
  pending

The repository does not currently prove full device-matrix coverage for your
app. You still need to validate:

- iOS background continuation on your target devices
- Android foreground-service behavior on your OEM/device matrix
- real quiet/noisy/endurance runs for your deployment context

## Release Support Matrix

Current support claims are anchored to:

- React Native `0.83+`
- Expo SDK `55+`
- iOS and Android only

The support matrix source in this repo is
`scripts/release-support-matrix.ts`. Setup docs and README should stay aligned
with that file.
