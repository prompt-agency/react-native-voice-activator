# Getting Started

Use the path-specific setup guide that matches your app:

- Bare React Native: [`./bare-react-native-setup.md`](./bare-react-native-setup.md)
- Expo: [`./expo-setup.md`](./expo-setup.md)

## Public API

Both integration paths use the same public runtime API:

- `initialize`
- `startDetection`
- `stopDetection`
- `getStatus`
- `dispose`
- `addWakeWordListener`

The most important public events are:

- `stateChanged`
- `error`
- `wakeWordDetected`
- `audioRouteChanged`

## Current Support Boundary

- Bare React Native is the primary runtime validation path.
- Expo support currently proves config-plugin resolution and prebuild generation.
- Expo Go is unsupported.
- iOS background continuation requires the audio background mode and does not
  survive force-quit.
- Android background continuation requires a visible activity context,
  microphone permission, and a foreground-service notification.
- structured failures are normalized into `permission`, `lifecycle`,
  `configuration`, `engine`, `platform`, and `internal`

## Next Docs

- Background behavior: [`./background-behavior.md`](./background-behavior.md)
- Reliability validation: [`./reliability-validation.md`](./reliability-validation.md)
- Troubleshooting: [`./troubleshooting.md`](./troubleshooting.md)
