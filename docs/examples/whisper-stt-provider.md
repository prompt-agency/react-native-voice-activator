# WhisperRN On-Device STT Provider

`WhisperRNSTTAdapter` wraps [whisper.rn](https://github.com/mybigday/whisper.rn) (a React Native binding for whisper.cpp) to provide fully on-device speech-to-text on both iOS and Android. The `ggml-tiny.en.bin` model (~75 MB) is downloaded once and cached locally — no cloud API required.

## Prerequisites

Install the peer dependencies that `WhisperRNSTTAdapter` requires:

```bash
# All platforms
yarn add whisper.rn react-native-fs

# iOS only
yarn add react-native-audio-recorder-player

# Android only
```

## iOS Setup

Add a microphone usage description to `ios/<App>/Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Microphone access is required for voice input.</string>
```

No additional native setup required — `react-native-audio-recorder-player` handles AVFoundation audio session configuration automatically.

## Android Setup

Add microphone permissions to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

Request the `RECORD_AUDIO` permission at runtime before calling `transcribe()`:

```typescript
import { PermissionsAndroid, Platform } from 'react-native';

async function ensureRecordPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    { title: 'Microphone', message: 'Required for voice input.', buttonPositive: 'Allow', buttonNegative: 'Cancel' }
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
```

### Android Architecture Note

Android recording uses the package's own native capture — no additional audio
module and no Old Architecture interop is required.


## Usage

```typescript
import {
  WhisperRNSTTAdapter,
  type WhisperRNSTTConfig,
} from 'react-native-voice-activator';

const config: WhisperRNSTTConfig = {
  modelId: 'whisper-tiny-en',
  maxRecordingMs: 10_000, // optional, default 10 000 ms
};

const sttAdapter = new WhisperRNSTTAdapter(config);

// One-time initialization — downloads ~75 MB on first run, then uses cache
await sttAdapter.initialize((update) => {
  if (update.progress != null) {
    console.log(`${update.message} (${update.progress}%)`);
  } else {
    console.log(update.message);
  }
});

// Transcribe once
const result = await sttAdapter.transcribe();
console.log(result.text);    // 'hello world'
console.log(result.provider); // 'whisper-rn'

// Cancel an in-progress transcription
await sttAdapter.cancel(); // safe to call even if not recording

// Release native resources when done
await sttAdapter.dispose();
```

## Session Integration

Pass the adapter to `initialize()` for full wake-word + STT session integration:

```typescript
import { initialize } from 'react-native-voice-activator';
import { WhisperRNSTTAdapter } from 'react-native-voice-activator';

const sttAdapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });

// Pre-initialize so the first transcription starts immediately
await sttAdapter.initialize();

await initialize({
  engineConfig: {
    assetKeys: { keywordAssetKey: 'keywords.txt' },
  },
  sttProvider: sttAdapter,
  autoSpeak: false,
});
```

## Available Model IDs

| ID | File | Size | Language |
|---|---|---|---|
| `whisper-tiny-en` | `ggml-tiny.en.bin` | ~75 MB | English |

The model is downloaded from `https://huggingface.co/ggerganov/whisper.cpp` and cached in `DocumentDirectory/whisper-rn/`.

## Platform Behaviour

| | iOS | Android |
|---|---|---|
| Recording library | `react-native-audio-recorder-player` | none — the package's native capture |
| Audio capture | AVFoundation WAV file | Raw PCM chunks → WAV (assembled in JS) |
| Path passed to whisper.rn | `file:///path/recording.wav` | `/path/recording.wav` (no `file://`) |
| Temp file cleanup | `RNFS.unlink()` in `finally` | `RNFS.unlink()` in `finally` |
| Architecture requirement | New Architecture OK | Old Architecture bridge required |
| Min OS | iOS 13+ | API 26+ |

## Troubleshooting

**Empty transcription result on Android**
The model must come from the `ggerganov/whisper.cpp` HuggingFace repository. Self-converted or third-party GGML models silently produce empty output. `WhisperRNSTTAdapter` uses the correct URL automatically — verify you haven't overridden the model source.

**`transcribe()` returns empty string on iOS**
Confirm `NSMicrophoneUsageDescription` is present in Info.plist and the microphone permission was granted. The adapter configures the audio session automatically (16kHz mono WAV, measurement mode).

**Android: no audio frames arrive**
Recording goes through the package's own native capture, so confirm `RECORD_AUDIO` is granted at runtime and that the native module loaded (`getStatus().state` must not be `'unsupported'`).

**`Cannot find module 'whisper.rn'`**
Install the peer dep: `yarn add whisper.rn`. If you are running Jest tests, ensure `moduleNameMapper` maps `whisper.rn` to a stub (see `package.json` in this repo for the pattern).

**`WhisperRNSTTAdapter: call initialize() first`**
`transcribe()` or `cancel()` was called before `initialize()` resolved. Always `await adapter.initialize()` before use.
