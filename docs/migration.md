# Migration

This guide covers migration from the earlier credential-era built-in engine path
to the current Sherpa-ONNX default engine.

## Who Should Use This Guide

Use this guide if your app integrated an earlier version of
`react-native-voice-activator` that assumed:

- a vendor-backed built-in engine
- a credential-style default-engine setup step
- a JS-era expectation that the package might silently fall back when native
  runtime support was unavailable

## What Changed

The current built-in engine path is:

- native-managed Sherpa-ONNX
- credential-free by default
- package-owned for bundled model assets
- surfaced through the same public lifecycle API

The public lifecycle methods did not change:

- `initialize`
- `startDetection`
- `stopDetection`
- `getStatus`
- `dispose`
- `addWakeWordListener`

## Configuration Changes

Removed from the supported default path:

- vendor credential setup for the built-in engine
- any requirement to provide a separate built-in-engine credential before initialization

Preserved in the public config surface:

- `engineConfig.assetKeys.modelAssetKey`
- `engineConfig.assetKeys.keywordAssetKey`
- `engineConfig.sensitivity`

Those asset-key fields are for apps that intentionally ship custom Sherpa model
assets. The default path continues to use the bundled native Sherpa assets that
ship with the package.

## What You Need To Update

1. Remove any built-in-engine credential setup from your app initialization
   path.
2. Keep using the same public API methods and event names.
3. If you previously documented or exposed a default-engine credential setup
   step in your app, remove it from your integration flow.
4. If you want custom keyword/model assets, move to the native asset-key
   configuration path instead of trying to load models dynamically from JS.
5. Re-validate your app against the current support boundary:
   - bare React Native remains the primary runtime validation path
   - Expo support remains config-plugin + prebuild based
   - Expo Go is unsupported

## Bare React Native vs Expo

- Bare React Native setup: [`./bare-react-native-setup.md`](./bare-react-native-setup.md)
- Expo setup: [`./expo-setup.md`](./expo-setup.md)

Both paths use the same public runtime contract. Expo adds config-plugin and
prebuild requirements; it does not add a separate runtime API.

## Validation Expectations After Migration

After migrating, validate:

- runtime startup and shutdown with `getStatus()`
- background-behavior expectations on your target devices
- your own custom asset packaging if you override the bundled defaults

Do not assume migration alone proves:

- full Expo runtime parity in CI
- physical-device noisy-environment performance
- production readiness on your target device matrix
