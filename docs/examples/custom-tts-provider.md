# Custom TTS Provider (CustomTTSAdapter)

`CustomTTSAdapter` is the built-in on-device TTS adapter that runs Piper TTS ONNX
models through `onnxruntime-react-native`. It implements `TextToSpeechProvider`
and can be passed directly to `initialize({ ttsProvider })`.

Do not move it into the library package core. Phonemize logic is model-specific
and belongs in your application.

## Install

```sh
npm install onnxruntime-react-native
```

## Implement a `phonemize` callback

Piper TTS ONNX models require espeak-ng phoneme IDs as `BigInt64Array`. You
must supply a `phonemize` callback that converts input text to the correct IDs
for your model. Options:

- Use `piper-phonemize` (a JS/WASM port of espeak-ng) if available for your
  target platform.
- Implement a lookup table for a fixed vocabulary.
- Call a server-side phonemizer if on-device phonemization is not required.

```typescript
const phonemize = async (text: string): Promise<BigInt64Array> => {
  // Example: call your phonemizer here
  const ids = await myPhonemizer.textToIds(text);
  return new BigInt64Array(ids);
};
```

## Wire the adapter

```typescript
import {
  initialize,
  startDetection,
  CustomTTSAdapter,
  WhisperRNSTTAdapter,
} from 'react-native-voice-activator';

const ttsProvider = new CustomTTSAdapter({
  modelPath: '/path/to/voice.onnx', // absolute local path after model download
  phonemize,
  sampleRate: 22050, // default — omit for standard Piper models
  // speakerId: 0,   // only needed for multi-speaker Piper models
});

await initialize({
  sttProvider: new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' }),
  ttsProvider,
  autoSpeak: true,
});
await startDetection();
```

## Model sourcing

`CustomTTSAdapter` does not download models. You must bundle or download the
`.onnx` model file yourself and pass its absolute local path as `modelPath`.

- Download Piper voice models from the official Piper releases page.
- For voice cloning, follow `docs/model-training/tts-voice-cloning.md` (Story 13-2).
- Store the model in the app's document directory or bundle it as a native asset.

## Stop / barge-in

`adapter.stop()` cancels any in-progress synthesis. The adapter sets a
cancellation flag that is checked at every async checkpoint inside `speak()`,
so the native audio ring buffer is flushed promptly.
