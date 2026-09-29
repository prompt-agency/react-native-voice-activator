# Expo Setup

Setup guide for `react-native-voice-activator` in an Expo project.

**Expo Go is NOT supported.** You must generate native projects using `expo prebuild` or EAS Build. This guide covers config-plugin and prebuild setup for Expo managed and bare workflow projects.

## Supported Versions

Requires Expo SDK `57+` and React Native `0.86+`. The support matrix source in this repo is `scripts/release-support-matrix.ts`.

| | Required |
|---|---|
| Expo SDK | `57+` |
| React Native | `0.86+` |
| iOS | `13+` |
| Android | API `26+` |

## Step 1 — Install the Package

```sh
npm install react-native-voice-activator
# or
yarn add react-native-voice-activator
```

## Step 2 — Add the Config Plugin

Add the plugin to `app.json` (or `app.config.js`):

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

The `microphonePermissionText` string is shown to users in the iOS microphone permission prompt.

## Step 3 — Run Prebuild

```sh
npx expo prebuild
```

This generates your `ios/` and `android/` native project folders and applies the config plugin.

**What the plugin configures automatically:**

| Platform | Configuration applied |
|---|---|
| iOS | `NSMicrophoneUsageDescription`, `UIBackgroundModes: ["audio"]` |
| Android | `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE` permissions, `WakeWordForegroundService` manifest entry |
| Both | Sherpa-ONNX asset manifests inside the generated native projects |

## Step 4 — Install iOS Pods

```sh
cd ios && pod install
```

## Step 5 — Build and Run

Once prebuild is complete, start a development server or run on a device:

```sh
expo start
# or build and run directly:
npx expo run:ios
# or
npx expo run:android
```

The Expo integration uses the same public runtime API used by bare React Native consumers — `initialize`, `startDetection`, `stopDetection`, `addWakeWordListener`, `getStatus`, and `dispose`.

## Step 6 — Request Android Microphone Permission at Runtime

The plugin adds the `RECORD_AUDIO` permission to `AndroidManifest.xml`, but Android requires you to request it at runtime before calling `startDetection()`:

```typescript
import { PermissionsAndroid, Platform } from 'react-native';

async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone Permission',
      message: 'This app needs microphone access for wake word detection.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    }
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}
```

Call this before `startDetection()`.

## What Is Automatic vs Manual

**Automatic through the Expo config plugin:**

- iOS microphone usage description
- iOS audio background mode
- Android microphone and foreground-service permissions
- Android foreground service manifest entry
- Sherpa-ONNX asset manifest generation and verification

**Manual in your app:**

- Running `expo prebuild` when native dependencies change
- Running `pod install` after prebuild
- Requesting `RECORD_AUDIO` at runtime on Android
- Validating behavior on your target device and OS matrix
- Installing optional STT/TTS peer dependencies and re-running prebuild and `pod install`

## Optional Peer Dependencies

Install only what your chosen adapters need. After adding any native peer, re-run `expo prebuild` and `pod install`.

| Peer | Required for |
|---|---|
| `whisper.rn` | `WhisperRNSTTAdapter` |
| `@dr.pogodin/react-native-fs` | `WhisperRNSTTAdapter` model caching |
| `react-native-audio-recorder-player` | `WhisperRNSTTAdapter` on iOS |
| `react-native-nitro-modules@0.31.10` | `react-native-audio-recorder-player` (it is a Nitro module) |
| `onnxruntime-react-native` | `CustomTTSAdapter` |

Pin `react-native-nitro-modules` to `0.31.10` specifically. It must satisfy this package's peer
range `>=0.31.3 <0.32.0`, but the recorder's own peer range is `*`, so a plain install can resolve
a newer Nitro (0.32+) whose API the recorder's v4.5.0 pre-generated bindings do not compile
against (`Unresolved reference 'updateNative'`).

After installing:

```sh
npx expo prebuild
cd ios && pod install
```

Android recording uses the package's own native capture, so no additional audio module is required.

## Built-In Sherpa Asset Model

The default wake word engine is bundled with the package — no API key, no vendor account, no separate model download. The supported public override points are `engineConfig.assetKeys.modelAssetKey` (the main acoustic model) and `engineConfig.assetKeys.keywordAssetKey` (the keyword detection file). For available keyword asset keys and selection syntax, see [Built-In Wake Words](../README.md#built-in-wake-words).

## Troubleshooting

### "Expo Go is not supported" / module not found

Expo Go cannot load custom native modules. Run `npx expo prebuild`, then `npx expo run:ios` or `npx expo run:android`.

### Plugin changes not reflected after prebuild

If you changed the plugin config or added native dependencies, regenerate from scratch:

```sh
npx expo prebuild --clean
cd ios && pod install
```

### `permission` error at runtime on Android

The plugin adds the manifest entry, but you must still call `PermissionsAndroid.request(RECORD_AUDIO)` at runtime. See [Step 6](#step-6--request-android-microphone-permission-at-runtime).

### `platform` error on Android

Detection must start from a visible activity. Move `startDetection()` to your main screen's component mount or a button press handler — not a background service.

### `platform` error on iOS after backgrounding

The plugin adds `UIBackgroundModes: ["audio"]` automatically. If you see this error, confirm your `ios/` folder was generated with the plugin active by running `expo prebuild` again.

### iOS build: duplicate ONNX symbol errors

Adding `onnxruntime-react-native` (for `CustomTTSAdapter`) introduces a second ONNX Runtime that conflicts with this package's bundled Sherpa ORT. See the [iOS ONNX Conflict Resolution guide](ios-onnx-conflict-resolution.md).

### `WakeWordForegroundService` crash on Android

Confirm `expo prebuild` ran successfully with the plugin enabled. The foreground service manifest entry is required for Android background detection and is added by the plugin during prebuild.

### iOS launch failure: "UIScene life cycle is required for apps built with this SDK"

Symptom, on launch rather than at build time:

```
Application failed to launch: UIScene life cycle is required for apps built with this SDK.
```

This is an Xcode 26+ / iOS SDK 26+ requirement and is not specific to this package. Any app built with that SDK must adopt the scene-based life cycle. Expo SDK 57 ships the scene delegate (`ExpoAppSceneDelegate`, Objective-C name `EXExpoAppSceneDelegate`) but `expo prebuild` on SDK 57 still generates the pre-scene `AppDelegate.swift` and no scene manifest, so you have to opt in yourself.

Two things are needed, and both must survive `expo prebuild --clean`:

1. Register the scene delegate in `app.json` under `expo.ios.infoPlist`:

```json
"UIApplicationSceneManifest": {
  "UIApplicationSupportsMultipleScenes": false,
  "UISceneConfigurations": {
    "UIWindowSceneSessionRoleApplication": [
      {
        "UISceneConfigurationName": "Default Configuration",
        "UISceneDelegateClassName": "EXExpoAppSceneDelegate"
      }
    ]
  }
}
```

2. Patch the generated `AppDelegate.swift` with a local config plugin, because `ExpoAppSceneDelegate` casts the app delegate to `ExpoReactNativeFactoryProvider` and calls `fatalError` if that fails. The plugin must declare the conformance (`class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {`) and remove the `#if os(iOS) || os(tvOS)` block that creates its own `UIWindow` and calls `factory.startReactNative(...)`, since the scene delegate now does both. The `RCTReactNativeFactory` must still be created and assigned to `reactNativeFactory`.

`example/plugins/with-ui-scene-lifecycle.js` in this repository is a working reference implementation.

### iOS pod install fails after adding a new peer

Run `pod repo update` then `pod install` again. If the error persists, try `npx expo prebuild --clean` followed by `pod install`.

For a complete error category reference, see [docs/troubleshooting.md](troubleshooting.md).

## CI Validation

The package ships a validation command that executes in CI against the example app. It uses the local plugin path (`../app.plugin.js`) registered in `example/app.json` and runs `expo prebuild --clean --no-install` against a temporary copy of the example app to verify asset manifest generation and plugin resolution.

You should still validate your own Expo-generated native app against your target device matrix and native toolchain. CI validation confirms plugin resolution; it does not substitute for device testing.

## Explicit Limitations

- `expo prebuild` must be re-run after changing native dependencies.
- iOS background detection depends on the app declaring the audio background mode and remaining alive — force-quit and cold relaunch are not supported.
- Android background detection depends on a visible activity context for start, microphone permission, and foreground-service ownership.
- OEM battery management can constrain Android background behavior beyond what this package controls.
