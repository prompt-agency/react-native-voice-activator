# Expo Speech Recognition STT Provider

This reference adapter shows how an Expo-oriented app can wrap an
`expo-speech-recognition` style integration behind the public
`SpeechToTextProvider` interface without moving vendor wiring into the package.

Use this in the host app only. Do not move it into the library package core.

## Integration Notes

- keep the speech-recognition library installed in the consuming app, not in
  `react-native-voice-activator`
- pass the adapter through `initialize({ sttProvider })`
- build a small app-owned bridge around the exact vendor version you install
- recognition setup, permissions, locale handling, and network/offline behavior
  remain vendor- and app-specific concerns

## Reference Adapter

```ts
import type {
  SpeechToTextProvider,
  TranscriptionResult,
} from 'react-native-voice-activator';

type ExpoSpeechRecognitionBridge = {
  startSingleUtterance(): Promise<{
    transcript: string;
    confidence?: number;
    durationMs?: number;
  }>;
  cancel(): Promise<void>;
};

export class ExpoSpeechRecognitionSttProvider
  implements SpeechToTextProvider
{
  readonly name = 'expo-speech-recognition';

  constructor(private readonly bridge: ExpoSpeechRecognitionBridge) {}

  async transcribe(): Promise<TranscriptionResult> {
    const result = await this.bridge.startSingleUtterance();

    return {
      text: result.transcript,
      confidence: result.confidence,
      durationMs: result.durationMs,
      provider: this.name,
    };
  }

  async cancel(): Promise<void> {
    await this.bridge.cancel();
  }
}
```

Implement the bridge in your app against the exact vendor version you ship. For
example, your bridge can own:

- permission requests
- listener registration and cleanup
- the package-specific start/stop calls
- conversion from vendor result events into a single resolved transcript

## Usage

```ts
import { initialize } from 'react-native-voice-activator';

await initialize({
  sttProvider: new ExpoSpeechRecognitionSttProvider(),
});
```

## Real Constraints

- recognition availability differs across platforms and OS versions
- cloud-backed recognition is not equivalent to on-device offline STT
- the host app must own microphone permission flow and any vendor-specific setup
- this repo does not validate the vendor package API for you; it only locks the
  adapter boundary shown above
- if your app needs an offline path, prefer an on-device adapter such as the
  architecture-approved Sherpa or ONNX-based options in app-owned code
