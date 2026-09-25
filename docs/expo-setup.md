# Expo Setup

Setup guide for `react-native-voice-activator` in an Expo project.

**Expo Go is NOT supported.** You must generate native projects using `expo prebuild` or EAS Build. This guide covers config-plugin and prebuild setup for Expo managed and bare workflow projects.

## Supported Versions

Requires Expo SDK `55+` and React Native `0.83+`. The support matrix source in this repo is `scripts/release-support-matrix.ts`.

| | Required |
|---|---|
| Expo SDK | `55+` |
| React Native | `0.83+` |
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
| `react-native-fs` | `WhisperRNSTTAdapter` model caching |
| `react-native-audio-recorder-player` | `WhisperRNSTTAdapter` on iOS |
| `@fugood/react-native-audio-pcm-stream` | `WhisperRNSTTAdapter` on Android |
| `onnxruntime-react-native` | `CustomTTSAdapter` |

After installing:

```sh
npx expo prebuild
cd ios && pod install
```

> [!WARNING]
> **Android STT is currently blocked on supported versions.** `@fugood/react-native-audio-pcm-stream` uses the Old Architecture `RCTEventEmitter` bridge. Expo SDK 55 removed the `newArchEnabled` option entirely (SDK 54 was the last one to support the Legacy Architecture), so it cannot be disabled here. `WhisperRNSTTAdapter` works on iOS but not on Android on SDK 55+.

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
