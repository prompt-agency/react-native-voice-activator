# Platform-Conditional STT Provider

Use this pattern when targeting **both iOS and Android** but want platform-optimized
transcription: Apple's on-device recognition on iOS, whisper.rn offline inference on
Android.

Use this in the host app only. Do not move it into the library package core.

## When to Use

- You want best-in-class iOS accuracy without shipping a 75 MB model on iOS
- You still need fully offline transcription on Android
- You are comfortable that iOS results come from Apple's speech servers (network-dependent)

## Pattern

```ts
import { Platform } from 'react-native';
import { initialize } from 'react-native-voice-activator';
import { WhisperRNSTTAdapter } from 'react-native-voice-activator/whisper-rn';

// iOS path — app-owned adapter wrapping expo-speech-recognition
// See: docs/examples/expo-speech-recognition-stt-provider.md
import { ExpoSpeechRecognitionSttProvider } from './ExpoSpeechRecognitionSttProvider';

// Android path — on-device whisper.rn
// See: docs/examples/whisper-stt-provider.md
const whisperAdapter = new WhisperRNSTTAdapter({
  modelUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  language: 'en',
});

await initialize({
  sttProvider:
    Platform.OS === 'ios'
      ? new ExpoSpeechRecognitionSttProvider(bridge)
      : whisperAdapter,
});
```

## iOS: Required Permission

When using `expo-speech-recognition` (or any `SFSpeechRecognizer`-based adapter) on
iOS you must add `NSSpeechRecognitionUsageDescription` to your `Info.plist` in addition
to the standard microphone permission:

**Bare React Native** — `ios/<App>/Info.plist`:

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>This app uses speech recognition to transcribe what you say.</string>
<key>NSMicrophoneUsageDescription</key>
<string>This app uses the microphone to detect wake words.</string>
```

**Expo** — `app.json` / `app.config.js`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSSpeechRecognitionUsageDescription": "This app uses speech recognition to transcribe what you say."
      }
    }
  }
}
```

## Tradeoffs

| | iOS (expo-speech-recognition) | Android (whisper.rn) |
|---|---|---|
| **Accuracy** | Apple models, high accuracy | Good; depends on model size |
| **Latency** | Fast (Apple Neural Engine) | Slower; CPU-bound on older devices |
| **Network** | Required (cloud-backed by default) | Not required (fully offline) |
| **Model download** | None | ~75 MB (tiny.en) to ~1.5 GB (large) |
| **Extra permission** | `NSSpeechRecognitionUsageDescription` | None beyond microphone |
| **Language support** | Apple's supported locales | 100+ via Whisper model choice |

## Real Constraints

- iOS recognition requires network; the adapter should handle the offline fallback if
  your app must work without connectivity on iOS
- `expo-speech-recognition` handles Android too (Google Speech), but that path is also
  cloud-backed — the pattern above deliberately uses whisper.rn on Android for offline
  support
- vendor setup, permission requests, and locale configuration are app-owned concerns;
  see the individual adapter docs for each platform path
