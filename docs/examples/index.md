# Provider Adapter Examples

These examples demonstrate how to keep STT and TTS integrations outside the
package core while still using the public provider interfaces:

- `SpeechToTextProvider`
- `TextToSpeechProvider`
- `initialize({ sttProvider, ttsProvider, autoSpeak })`

Architecture rule: reference adapters live in `docs/examples/` and app-level code only. User-owned custom adapters belong in application code, not in the library package. They do not belong in `src/`, `src/internal/`, or the mandatory package runtime.

## Model training (custom wake word)

To train a **Sherpa-ONNX KWS** bundle and keyword file for `engineConfig.assetKeys`, see [`../model-training/wake-word-training.md`](../model-training/wake-word-training.md). Training is offline; the package loads ONNX + `keywords.txt` only.

## Model training (custom TTS voice)

To train or fine-tune a **Piper** voice and export **`.onnx`** for `CustomTTSConfig.modelPath`, see [`../model-training/tts-voice-cloning.md`](../model-training/tts-voice-cloning.md). Training is offline; the app supplies a local model file and a matching `phonemize` implementation.

## Current Reference Adapters

- [`whisper-stt-provider.md`](./whisper-stt-provider.md)
- [`expo-speech-tts-provider.md`](./expo-speech-tts-provider.md)
- [`expo-speech-recognition-stt-provider.md`](./expo-speech-recognition-stt-provider.md)
- [`custom-tts-provider.md`](./custom-tts-provider.md)

## What These Examples Prove

- provider vendors remain application-owned
- the package public API stays engine-neutral and vendor-neutral by default
- consumers can compose wake word detection with STT/TTS without reaching into
  private runtime internals

## Recommended Evaluation Flow

1. validate the package-owned wake-word runtime first
2. layer in an application-owned STT adapter for the transcribe step
3. layer in an application-owned TTS adapter for the optional speak step

The example app shows the real wake-word runtime, links back to these adapter
docs, and includes separate simulated host-provider previews for the optional
transcribe and speak steps.

It also exposes a bundled keyword selector that applies preset
`engineConfig.assetKeys.keywordAssetKey` values for the shipped Sherpa phrases,
rather than generating or editing custom keyword files at runtime.

## What These Examples Do Not Prove

- this repo does not automate real vendor audio capture, recognition, or speech
  playback
- Expo Go is still unsupported for this package runtime
- vendor install steps, permissions, and compatibility constraints must still be
  validated in the host app that adopts these adapters
