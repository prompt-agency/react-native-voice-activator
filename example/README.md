# Example App

This example remains the primary runtime validation surface for the React Native
library path.

It also carries the Expo config and prebuild compatibility contract used by
the current Expo integration path:

- `example/src/App.tsx` exercises the same public lifecycle API used by bare
  React Native consumers
- `example/app.json` registers the local plugin path (`../app.plugin.js`) used
  for monorepo validation
- `example/package.json` exposes:
  - `expo start`
  - `expo run:ios`
  - `expo run:android`
  - `expo prebuild`
- CI executes Expo config resolution against this example app
- CI executes Expo prebuild generation against a temporary copy of this example app
- Expo Go is explicitly unsupported

## What This Example Proves

- the package public API can be consumed without Expo-specific runtime methods
- the example keeps using:
  - `initialize`
  - `startDetection`
  - `stopDetection`
  - `getStatus`
  - `dispose`
  - `addWakeWordListener`
- the repo contains an Expo-capable app config surface for the plugin
- Expo example config: app.json registers the local plugin path used by the
  example app
- the same runtime contract is documented for both bare React Native and Expo
- Expo CLI can resolve the example app config through `expo config --type prebuild --json`
- Expo CLI can generate iOS and Android native projects from a temporary copy of the example app through `expo prebuild --clean --no-install`
- Expo prebuild generates a Sherpa asset manifest in each native project and
  validates that the package-owned Sherpa native asset bundle resolves from the
  generated example app
- the example app exposes current runtime diagnostics, recent runtime events, and normalized error categories for evaluator troubleshooting
- runtime behavior and troubleshooting guidance are still sourced from the package-level docs, not from this example alone
- the example also shows optional STT/TTS extension points layered on top of the public wake-word event contract
- the demo STT/TTS flows remain application-level examples only; WhisperRNSTTAdapter is used for the example STT path
- concrete reference provider adapters are documented in `../docs/examples/`

## Provider Pattern Evaluation Flow

Use the example in this order:

1. initialize and validate the package-owned wake-word runtime
2. choose a bundled keyword preset and re-run Initialize when you want to apply a different `keywordAssetKey`
3. observe the package runtime diagnostics, including `wakeWordDetected` and any provider lifecycle events produced by the configured app-owned providers
4. use the STT/TTS preview buttons to inspect separate simulated host-provider bridges that follow the same application-owned provider pattern documented in `../docs/examples/`
5. to evaluate on-device TTS via `CustomTTSAdapter`, supply a Piper ONNX model file and a phonemize callback — see `../docs/examples/custom-tts-provider.md`

The wake step is real package behavior. The STT/TTS preview path demonstrates
how a consumer app can compose transcription and speech on top of the public
runtime contract using WhisperRNSTTAdapter for STT and a separate simulated
host-provider bridge for TTS.

The bundled example presets currently cover `HELLO WORLD`, `HI GOOGLE`,
`HEY SIRI`, `ALEXA`, `LOVE AND PEACE`, `PLAY MUSIC`, `GO HOME`, `HAPPY NEW
YEAR`, and `MERRY CHRISTMAS`. They map to pre-bundled keyword files and do not
let users type arbitrary custom phrases in the UI.

## What It Does Not Prove

- CI does not execute a full Expo runtime session
- the example uses a local plugin path (`../app.plugin.js`) for monorepo validation instead of the published package name
- Expo Go support does not exist
- production readiness on your target Expo SDK/device matrix is still your own
  validation responsibility

## Current App Config Contract

See [`app.json`](./app.json). The example keeps the plugin registration visible
so the config-plugin and runtime contract can be validated together.

## Setup Surface Relationship

- For bare React Native setup, see [`../docs/bare-react-native-setup.md`](../docs/bare-react-native-setup.md)
- For Expo setup, see [`../docs/expo-setup.md`](../docs/expo-setup.md)
- For the current support matrix, see `../scripts/release-support-matrix.ts`
