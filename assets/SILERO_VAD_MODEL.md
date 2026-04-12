# Silero VAD ONNX (bundled)

The library ships **Silero VAD** (`silero_vad.onnx`, MIT) pinned to [snakers4/silero-vad](https://github.com/snakers4/silero-vad) tag **v5.1.2**.

## How it is installed

`yarn prepare` runs `scripts/fetch-silero-vad-model.mjs`, which downloads the file (SHA-256 verified) into:

- `ios/Assets/silero_vad.onnx` — bundled via `VoiceActivator.podspec` (`ios/Assets/**/*`)
- `android/src/main/assets/silero_vad.onnx` — resolved as `asset://silero_vad.onnx` by ORT

Set `SKIP_SILERO_VAD_FETCH=1` to skip the download when those paths already contain the pinned file.

## Overrides

Pass a custom path to `SileroVADEngine.loadModel(path)` for a different ONNX, as long as tensor names match the upstream Silero VAD v5 ONNX API (`input`, `sr`, `h`, `c` → `output`, `hn`, `cn`).
