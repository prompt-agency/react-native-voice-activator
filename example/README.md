# Example App

This example remains the primary runtime validation surface for the React Native
library path.

It also carries the Expo config and prebuild compatibility contract used by
Story 4.2:

- `example/src/App.tsx` exercises the same public lifecycle API used by bare
  React Native consumers
- `example/app.json` registers the `react-native-voice-activator` config plugin
- `example/package.json` exposes:
  - `expo start --dev-client`
  - `expo run:ios`
  - `expo run:android`
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
- the same runtime contract is documented for both bare React Native and Expo
- Expo CLI can resolve the example app config through `expo config --type prebuild --json`
- Expo CLI can generate iOS and Android native projects from a temporary copy of the example app through `expo prebuild --clean --no-install`

## What It Does Not Prove

- CI does not execute a full Expo runtime session
- the example uses a local plugin path (`../app.plugin.js`) for monorepo validation instead of the published package name
- Expo Go support does not exist
- production readiness on your target Expo SDK/device matrix is still your own
  validation responsibility

## Current App Config Contract

See [`app.json`](./app.json). The example keeps the plugin registration visible
so the config-plugin and runtime contract can be validated together.
