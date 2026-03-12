# RunAnywhere STT/TTS Provider

Use `builtInSTT` and `builtInTTS` with real local model paths, or follow the
official RunAnywhere pattern used by the example app:

1. initialize `@runanywhere/core` in `SDKEnvironment.Development`
2. call `ONNX.register()`
3. register Whisper/Piper model URLs with `ONNX.addModel(...)`
4. download them through `RunAnywhere.downloadModel(...)`
5. resolve `localPath` through `RunAnywhere.getModelInfo(...)`
6. pass those local paths into `initialize({ builtInSTT, builtInTTS })`

The example app wires this flow through `RUNANYWHERE_CONFIG` in
`example/src/reference-provider-adapters.ts` and prepares the models on demand
during Initialize.
