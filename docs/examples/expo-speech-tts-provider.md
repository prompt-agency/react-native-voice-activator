# Expo Speech TTS Provider

This reference adapter shows how an Expo app can wrap `expo-speech` behind the
public `TextToSpeechProvider` interface.

Use this in the host app only. Do not move it into the library package core.

## Integration Notes

- keep `expo-speech` installed in the consuming app, not in
  `react-native-voice-activator`
- pass the adapter through `initialize({ ttsProvider, autoSpeak: true })`
- Expo Go remains unsupported for this package runtime even though `expo-speech`
  itself can run in Expo environments

## Reference Adapter

```ts
import * as Speech from 'expo-speech';
import type {
  TextToSpeechProvider,
  TTSOptions,
} from 'react-native-voice-activator';

export class ExpoSpeechTtsProvider implements TextToSpeechProvider {
  readonly name = 'expo-speech';

  async speak(text: string, options?: TTSOptions): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      Speech.speak(text, {
        language: options?.language,
        pitch: options?.pitch,
        rate: options?.rate,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => reject(new Error('expo-speech failed to speak text')),
      });
    });
  }

  async stop(): Promise<void> {
    Speech.stop();
  }
}
```

## Usage

```ts
import { initialize } from 'react-native-voice-activator';

await initialize({
  ttsProvider: new ExpoSpeechTtsProvider(),
  autoSpeak: true,
});
```

## Real Constraints

- `expo-speech` configuration belongs to the app, not to the package
- language, pitch, and rate support depend on the underlying platform voices
- if the host app needs stronger playback-state guarantees, extend the adapter in
  app code rather than changing the package runtime
