# Expo Setup

`react-native-voice-activator` supports Expo as a config-plugin and prebuild
integration path layered through the config plugin.

Expo Go is NOT supported.

## Supported Expo Path

The supported Expo path today is:

1. Expo SDK `55+`
2. a development build, not Expo Go
3. the package plugin enabled in app config
4. the example app exposes real Expo development-build commands:
   - `expo start --dev-client`
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

## What Is Automatic vs Manual

Automatic through the Expo config plugin:

- iOS microphone permission text
- iOS `UIBackgroundModes: ["audio"]`
- Android microphone and foreground-service permissions
- Android `WakeWordForegroundService` manifest entry

Manual in your app:

- use a development build instead of Expo Go
- run Expo config/prebuild as part of native project generation
- validate runtime behavior on your target devices after prebuild
- validate iOS and Android background constraints in your own app context

## Runtime Contract

Expo development builds use the same public package contract as bare React
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
- contract checks that keep docs, app config, and package wiring aligned
- an Expo CLI `config --type prebuild --json` validation command that executes in CI against the example app
- an Expo CLI `prebuild --clean --no-install` validation command that executes in CI against a temporary copy of the example app

The example app uses a local plugin path (`../app.plugin.js`) for monorepo
validation. Published consumers should continue to register the plugin as
`react-native-voice-activator`.

The repository does not currently boot a full Expo runtime session in CI.

That means this repo validates Expo plugin resolution, Expo config resolution,
Expo prebuild generation, and the documented package integration surface, but
you must still validate your own Expo dev build on the target SDK, device matrix,
and native toolchain before treating it as production-ready.

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
- This story proves Expo config and prebuild compatibility, not full Expo runtime parity on all devices.
- iOS background continuation still depends on the app declaring the audio
  background mode and staying alive after explicit activation.
- Android background continuation still depends on visible-context start,
  microphone permission, foreground-service ownership, and OEM policy.
