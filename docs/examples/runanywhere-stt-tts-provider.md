# RunAnywhere Built-In STT/TTS Provider

The package owns the full RunAnywhere lifecycle — SDK initialization, model
registry, download, and path resolution all happen inside `initialize()`. Pass
a `modelId` and optionally receive download progress:

```ts
import { initialize } from 'react-native-voice-activator';

await initialize({
  builtInSTT: { modelId: 'whisper-tiny-en' },
  builtInTTS: { modelId: 'piper-en-lessac' },
  onBuiltInProgress: ({ message, progress }) => {
    // optional: show a download progress UI
    console.log(message, progress);
  },
  autoSpeak: true,
});
```

## Prerequisites

Install the optional peer dependencies that the built-in STT/TTS path requires:

```bash
yarn add @runanywhere/core @runanywhere/onnx \
  react-native-audio-recorder-player react-native-nitro-modules
```

`react-native-fs` is not required by this package's built-in STT/TTS bridge.
You may still encounter it as an optional peer from the upstream RunAnywhere
SDK when using broader download or storage flows.

## Available model IDs

| ID | Modality | Size |
|---|---|---|
| `whisper-tiny-en` | STT | ~75 MB |
| `piper-en-lessac` | TTS | ~65 MB |

Models are downloaded once and cached locally by the RunAnywhere runtime.

## Application-owned providers (alternative)

If you want to own transcription or speech yourself, pass a provider object
instead of `builtInSTT` / `builtInTTS`:

```ts
import {
  initialize,
  type SpeechToTextProvider,
  type TextToSpeechProvider,
} from 'react-native-voice-activator';

// Your own adapter — implement the two-method interface
const sttProvider: SpeechToTextProvider = {
  name: 'my-stt',
  async transcribe() { /* ... */ },
  async cancel() { /* ... */ },
};

const ttsProvider: TextToSpeechProvider = {
  name: 'my-tts',
  async speak(text, options) { /* ... */ },
  async stop() { /* ... */ },
};

await initialize({ sttProvider, ttsProvider, autoSpeak: true });
```

See `docs/examples/expo-speech-recognition-stt-provider.md` and
`docs/examples/expo-speech-tts-provider.md` for concrete application-owned
adapter examples.
