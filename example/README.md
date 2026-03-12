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
- those STT/TTS flows are application-level examples only and do not make the package own transcription or synthesis

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
