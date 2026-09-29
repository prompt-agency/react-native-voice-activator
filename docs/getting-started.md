# Getting Started

This guide takes you from zero to your first wake word detection. By the end, your app fires an event when it hears a trigger phrase.

## Prerequisites

Confirm your environment before installing:

| Requirement | How to check |
|---|---|
| React Native `0.86+` | `npx react-native --version` |
| Node.js `20.19.4+`, `22.13+`, `24.3+`, or `25+` (React Native 0.86's `engines` field; Node 21.x and 23.x are not supported) | `node --version` |
| iOS: Xcode `15+` | Xcode → About Xcode |
| iOS: CocoaPods installed | `pod --version` |
| Android: Android Studio | NDK and SDK must be installed via SDK Manager |
| Expo SDK `57+` | *(Expo users only)* `npx expo --version` |

**Expo Go is not supported.** You must generate native projects with `expo prebuild` or EAS Build.

## Choose Your Path

- **Bare React Native** — your project uses `npx react-native init` or the React Native Community CLI. Follow the steps below, then the [Bare React Native Setup guide](bare-react-native-setup.md) for platform-specific detail.
- **Expo** — your project uses `npx create-expo-app` or has an `app.json`. Follow the steps below, then the [Expo Setup guide](expo-setup.md) for plugin and prebuild detail.

Both paths use the same runtime API once setup is complete.

## Step 1 — Install the Package

```sh
npm install react-native-voice-activator
# or
yarn add react-native-voice-activator
```

## Step 2 — Configure Native Projects

**Bare React Native — iOS:**

```sh
cd ios && pod install
```

No manual Android linking is required for React Native `0.60+`.

**Expo:**

Add the config plugin to `app.json`:

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

Generate native projects and install iOS pods:

```sh
npx expo prebuild
cd ios && pod install
```

## Step 3 — iOS: Add Microphone Permission

`NSMicrophoneUsageDescription` must be present in `Info.plist`. The Expo plugin adds this automatically from `microphonePermissionText`. Bare React Native users add it manually:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app uses the microphone to detect wake words.</string>
```

Android microphone permission is requested at runtime in the Step 6 code. If it is denied, `getStatus().lastError.category` will be `'permission'`.

## Step 4 — Download the Models

The ONNX models are not shipped in the npm package; they are downloaded once
(~7.8 MB) into your app's own storage and verified against a pinned SHA-256
manifest.

```typescript
import { prepareModels, getModelStatus } from 'react-native-voice-activator';

if (!(await getModelStatus()).ready) {
  await prepareModels({
    onProgress: ({ percent }) => console.log(`Models ${percent}%`),
  });
}
```

`prepareModels()` is idempotent, so calling it on every launch is fine — once the
bundle is complete it only re-verifies checksums.

`initialize()` deliberately does **not** download for you. With the models absent
it rejects with a non-recoverable `models_not_prepared` error, so a large network
transfer is always something your app chose. To skip the download entirely, ship
a model bundle in your app and pass
`engineConfig.assetKeys.modelAssetKey` instead.

## Step 5 — Pick a Wake Phrase

Any English phrase, no training required:

```typescript
await initialize({ wakePhrase: 'hey acme' });
```

Two or more words, at least 6 letters, A-Z and spaces only. See
[Wake Words](../README.md#wake-words) for the full rules and the pre-tokenized
presets.

## Step 6 — Your First Detection

Copy this into your app and run it. Say **"Hello World"** — you should see the detection event in your console.

```typescript
import { Platform } from 'react-native';
import { PermissionsAndroid } from 'react-native';
import {
  initialize,
  startDetection,
  stopDetection,
  addWakeWordListener,
  getStatus,
  dispose,
} from 'react-native-voice-activator';

async function firstDetectionTest() {
  // Android: request microphone permission before starting
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'Required for wake word detection.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      console.error('Microphone permission denied');
      return;
    }
  }

  // Check runtime availability
  const status = getStatus();
  console.log('Runtime state:', status.state);

  if (status.state === 'unsupported') {
    console.error('Wake word runtime not available:', status.reason);
    return;
  }

  // Subscribe to events
  const sub1 = addWakeWordListener('stateChanged', (e) =>
    console.log('State changed to:', e.state)
  );
  const sub2 = addWakeWordListener('wakeWordDetected', (e) =>
    console.log('Detected:', e.detectedPhrase)
  );

  try {
    await initialize();
    console.log('Engine loaded — say "Hello World"...');

    await startDetection();
    // Wait 30 seconds then clean up
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    await stopDetection();
    await dispose();
  } finally {
    sub1.remove();
    sub2.remove();
  }
}

firstDetectionTest().catch(console.error);
```

**Expected console output:**

```
Runtime state: idle
State changed to: initializing
State changed to: running
Detected: Hello World      ← fires when you say the phrase
State changed to: idle
```

## Common First-Time Issues

### Nothing happens after `startDetection()`

- On a real device, confirm the microphone permission prompt appeared and was accepted. If you tapped Deny, go to device Settings and grant it manually.
- On iOS Simulator, audio input is unreliable for wake word detection. Always test on a physical device for accurate results.

### `state === 'unsupported'` immediately

- **Android:** detection must start from a visible activity. Calling `startDetection()` from a headless or background context is not supported — move the call to your main screen's component mount.
- **iOS after backgrounding:** the app must declare `UIBackgroundModes: ["audio"]`. The Expo plugin adds this automatically; bare React Native users must add it to `Info.plist`.

### iOS build fails after `pod install`

- If you see "duplicate symbol" linker errors, you have two ONNX Runtime copies in your binary. See the [iOS ONNX Conflict Resolution guide](ios-onnx-conflict-resolution.md).
- If pods fail to resolve, run `pod repo update` then `pod install` again.

### Android build failure

- Confirm the Android NDK is installed: Android Studio → SDK Manager → SDK Tools → NDK (Side by side).
- Clean the build cache: `cd android && ./gradlew clean`, then rebuild.

## Runtime Event Monitoring

The package emits events you can observe with `addWakeWordListener`:

- `stateChanged` — runtime lifecycle transitions (`idle`, `initializing`, `running`, etc.)
- `wakeWordDetected` — fired when a keyword is recognized
- `error` — structured error with category and `recoverable` flag
- `audioRouteChanged` — fires when the audio route changes (headphones plugged in, etc.)
- `interruption` — fires when the audio session is interrupted by a system event

For diagnostics, `getStatus()` returns a snapshot of the runtime: `state`, `isAvailable`, `isListening`, `canStart`, an optional `reason`, and `lastError`. Error categories are normalized error categories from the fixed set above. It does not carry an event history — subscribe to the events above if you need one (the example app's screens do exactly that). Error categories are `permission`, `lifecycle`, `configuration`, `engine`, `platform`, and `internal`.

### What `recoverable` means

`recoverable: true` means retrying the same call with the same options may succeed. `recoverable: false` means it will not, and the app has to change something first:

| Error | `recoverable` | What to do |
|---|---|---|
| `runtime_unavailable` (`platform`) | `false` | The native module is missing from the build. Rebuild with `pod install` / `expo prebuild`; retrying at runtime cannot help. |
| any `configuration` error | `false` | A model asset, keyword path or bundle is missing or unreadable. Fix the options and call `initialize()` again. |
| `stt_timeout`, `tts_timeout` | `true` | The provider hung and was abandoned. The next wake word will try again. Raise `providerTimeoutMs` if the provider is merely slow. |
| `ai_handler_timeout` (session) | `true` | Your `aiHandler` hung. Bounded by `aiHandlerTimeoutMs`. |
| `stt_transcribe_failed`, `tts_speak_failed` | `true` | A transient provider failure. |

A permission denial surfaces as `category: 'permission'` — request the permission, then retry.

## Built-In Engine Defaults

Real engine-backed local wake word detection runs through the built-in native-managed Sherpa-ONNX engine. No API key or vendor account is needed.

The supported public override points are `engineConfig.assetKeys.modelAssetKey` (the main acoustic model) and `engineConfig.assetKeys.keywordAssetKey` (the keyword detection file):

`modelAssetKey` is used verbatim, and the bundled model lives at a different
root on each platform, so the correct value is platform specific. Import it
rather than writing it out:

```typescript
import { initialize, BUNDLED_MODEL_ASSET_KEY } from 'react-native-voice-activator';

await initialize({
  engineConfig: {
    assetKeys: {
      modelAssetKey: BUNDLED_MODEL_ASSET_KEY,
      keywordAssetKey: 'keywords-hello-world.txt',
    },
  },
});
```

Each native loader falls back to its own default root only when the key is
omitted entirely, never when it is present but wrong, so hardcoding a root that
suits one platform fails on the other. Android reports `Missing bundled
Sherpa-ONNX asset for encoder in model root`; iOS currently tolerates it,
because the podspec also copies these files flat into the app bundle and the
loader then finds them by filename. That asymmetry is why the constant is
exported: the mistake passes an iOS device test and fails on Android.

Bundled keyword files include `HELLO WORLD`, `MERRY CHRISTMAS`, and more — see [Built-In Wake Words](../README.md#built-in-wake-words).

## Wake-to-Transcribe-to-Speak Guide

You supply the STT and TTS providers; the package calls them. Pass an `sttProvider` to `initialize()` and the package drives the flow:

1. `wakeWordDetected` fires
2. The package calls `sttProvider.transcribe()` and emits `transcriptionStarted`, then `transcriptionResult`
3. If `autoSpeak: true`, the package calls `ttsProvider.speak()` and emits `speechStarted`, then `speechCompleted`

Pass no `sttProvider` and the package stops after step 1, leaving everything after the event to your app. The provider *implementations* are yours; the orchestration between them is the package's.

See [docs/examples/](examples/) for implementation patterns.

## Next Steps

Detection is working. Here is where to go next:

| Goal | Guide |
|---|---|
| Transcribe what the user says after the wake word | [WhisperRN STT Provider](examples/whisper-stt-provider.md) |
| Use iOS native accuracy with offline Android fallback | [Platform-Conditional STT](examples/platform-conditional-stt.md) |
| Make your app speak responses back | [Custom TTS Provider](examples/custom-tts-provider.md) |
| Build a full multi-turn voice assistant | [Conversation Session](conversation-session.md) |
| Understand background detection limits | [Background Behavior](background-behavior.md) |
| Debug runtime errors by category | [Troubleshooting](troubleshooting.md) |
| Train your own custom wake word | [Wake Word Training](model-training/wake-word-training.md) |
| Set up for bare React Native in detail | [Bare React Native Setup](bare-react-native-setup.md) |
| Set up for Expo in detail | [Expo Setup](expo-setup.md) |
