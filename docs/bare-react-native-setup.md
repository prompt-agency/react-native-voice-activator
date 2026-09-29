# Bare React Native Setup

Setup guide for `react-native-voice-activator` in a bare React Native project — one created with `npx react-native init` or the React Native Community CLI.

## Supported Versions

Requires React Native `0.86+`, iOS `13+`, and Android API `26+`. The support boundary is tracked in `scripts/release-support-matrix.ts`.

| | Required |
|---|---|
| React Native | `0.86+` |
| iOS | `13+` |
| Android | API `26+` |

## Step 1 — Install the Package

Choose one package manager:

```sh
npm install react-native-voice-activator
yarn add react-native-voice-activator
pnpm add react-native-voice-activator
bun add react-native-voice-activator
```

## Step 2 — iOS: Run CocoaPods

```sh
cd ios && pod install
```

This links the Sherpa-ONNX wake word engine and all required iOS native libraries. Re-run this command whenever you add or remove native peer dependencies.

## Step 3 — iOS: Add Microphone Permission

Add `NSMicrophoneUsageDescription` to `ios/<YourApp>/Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app uses the microphone to detect wake words.</string>
```

Without this key, your app crashes on iOS 13+ when microphone access is requested.

## Step 4 — iOS: Add Audio Background Mode (Recommended)

Required if you want wake word detection to continue after the app moves to the background:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

Without this, the runtime transitions to `unsupported` with a `platform` error when the app backgrounds. Detection resumes normally when the app returns to the foreground.

## Step 5 — Android: Request Runtime Permission

Android requires `RECORD_AUDIO` to be requested at runtime before calling `startDetection()`. Add this to your app's startup flow:

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

// Call before startDetection()
const granted = await requestMicrophonePermission();
if (!granted) {
  console.error('Microphone permission denied');
  return;
}
```

## What Is Automatic vs Manual

**Automatic through the package:**

- Native module registration (iOS and Android)
- Wake word engine wiring and lifecycle
- Runtime state and event emission
- Android foreground service management
- `onnxruntime-react-native` registration, via standard React Native CLI
  autolinking. No `MainApplication` edit is needed in a bare app. (Expo
  projects do need help here, which the config plugin applies automatically —
  see [Expo Setup](expo-setup.md). The cause is a stale `unimodule.json` in
  `onnxruntime-react-native` that makes Expo autolinking claim the package
  without registering it.)

**Manual in your app:**

- iOS `NSMicrophoneUsageDescription` in `Info.plist`
- iOS `UIBackgroundModes` in `Info.plist` (for background continuation)
- Android `RECORD_AUDIO` runtime permission request
- Running `cd ios && pod install` after adding native peer dependencies

## Optional Peer Dependencies

Install only what your chosen adapters need. After adding any native peer, re-run `pod install`.

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

See [docs/examples/](examples/) for per-adapter setup guides.

Android recording uses the package's own native capture, so no additional audio module is required.

## Built-In Sherpa Asset Model

The default wake word engine is bundled with the package — no API key, no vendor account, no separate model download. The supported public override points are `engineConfig.assetKeys.modelAssetKey` (the main acoustic model) and `engineConfig.assetKeys.keywordAssetKey` (the keyword detection file). For available keyword asset keys and selection syntax, see [Built-In Wake Words](../README.md#built-in-wake-words).

## Troubleshooting

### `permission` error on start

- Grant microphone permission before calling `startDetection()`.
- On iOS, confirm `NSMicrophoneUsageDescription` is in `Info.plist`.
- On Android, confirm `PermissionsAndroid.request(RECORD_AUDIO)` was called and the user accepted.

### `platform` error on Android

Detection must start from a visible activity (`foreground_service_visible_context_required`). Background and headless starts are not supported. Move your `startDetection()` call to your main screen's component mount or a button press handler.

### `platform` error on iOS after backgrounding

The app must declare `UIBackgroundModes: ["audio"]`. Add it to `Info.plist` and rebuild.

### iOS build: duplicate ONNX symbol errors

You have two ONNX Runtime copies in your binary — typically this package's bundled Sherpa ORT plus `onnxruntime-react-native`. See the [iOS ONNX Conflict Resolution guide](ios-onnx-conflict-resolution.md).

### iOS launch failure: "UIScene life cycle is required for apps built with this SDK"

Symptom, on launch rather than at build time:

```
Application failed to launch: UIScene life cycle is required for apps built with this SDK.
```

This is an Xcode 26+ / iOS SDK 26+ requirement and is not specific to this package. Any app built with that SDK must adopt the scene-based life cycle: add a `UIApplicationSceneManifest` to `Info.plist` naming a `UISceneDelegateClassName`, and move window creation and React Native startup out of `AppDelegate` and into that scene delegate. Follow Apple's "Transitioning to the UIKit scene-based life cycle" together with your React Native version's own scene guidance; the exact delegate class depends on your app template.

For an Expo-managed app, see the equivalent entry in [Expo Setup](expo-setup.md#ios-launch-failure-uiscene-life-cycle-is-required-for-apps-built-with-this-sdk), which has the concrete `app.json` and config-plugin recipe.

### `engine` error at startup

- Check `getStatus().lastError.code` and `lastError.message` for the specific failure.
- If you are not overriding `engineConfig.assetKeys`, the default bundled path should not fail unless the native binary is incomplete.
- If you are supplying custom asset keys, verify those file paths exist in your app bundle.

### `lifecycle` error

Always call `initialize()` before `startDetection()`. Do not call `startDetection()` while the runtime is already in `running` state — call `stopDetection()` first.

### Android build failure

- Confirm Android NDK is installed: Android Studio → SDK Manager → SDK Tools → NDK (Side by side).
- Clean the build: `cd android && ./gradlew clean`.
- **First Android build downloads a ~28 MB Sherpa-ONNX AAR.** It is fetched at
  build time rather than shipped in the npm package, verified against a pinned
  SHA-256, and cached in `node_modules/react-native-voice-activator/android/libs/`.
  Subsequent builds reuse it. On a machine without network access, pass
  `-PVoiceActivator_sherpaAarPath=/path/to/the.aar`.
- **The ONNX models are downloaded at runtime, not at build time.** Call
  `prepareModels()` once before `initialize()`; see
  [Models Are Downloaded On Demand](../README.md#models-are-downloaded-on-demand).

For a complete error category reference, see [docs/troubleshooting.md](troubleshooting.md).

## Validation Checklist

Validate on your own app:

- iOS background continuation on your target devices
- Android foreground-service behavior on your OEM and device matrix
- Real-environment detection quality for your deployment context
