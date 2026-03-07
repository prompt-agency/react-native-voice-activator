# react-native-voice-activator

React Native and Expo wake word runtime library.

Current implementation status:

- the public lifecycle API is implemented
- typed runtime state and detection events are implemented
- real engine-backed local wake word detection is implemented through the built-in Porcupine adapter
- a supported foreground runtime flow exists
- iOS background continuation is supported only when the app declares the audio background mode and remains alive
- Android background continuation is supported only when detection starts from a visible app context with microphone permission and the package can hold an active foreground-service notification

The current runtime is useful for validating app integration, lifecycle handling, engine-backed detection, and the constrained iOS background continuation model.

## Installation

```sh
npm install react-native-voice-activator
```

## Quickstart

```ts
import {
  addWakeWordListener,
  dispose,
  getStatus,
  initialize,
  startDetection,
  stopDetection,
} from 'react-native-voice-activator';

async function runQuickstart() {
  const stateSubscription = addWakeWordListener('stateChanged', (event) => {
    console.log('state changed:', event.state);
  });

  const detectionSubscription = addWakeWordListener(
    'wakeWordDetected',
    (event) => {
      console.log('detection event:', event.detectedPhrase, event.detectedAt);
    }
  );

  const status = getStatus();

  if (status.state === 'unsupported') {
    console.log(status.reason);
    stateSubscription.remove();
    detectionSubscription.remove();
    return;
  }

  try {
    await initialize();
    await startDetection();
    await stopDetection();
    await dispose();
  } finally {
    stateSubscription.remove();
    detectionSubscription.remove();
  }
}

runQuickstart().catch((error) => {
  console.error('quickstart failed:', error);
});
```

## What This Quickstart Proves Today

- your app can import the public package API
- lifecycle methods work through the current supported foreground runtime path
- `stateChanged` and `wakeWordDetected` events are wired correctly
- `getStatus()` reflects runtime state transitions

## Current Limitations

- iOS background continuation still depends on the host app staying alive after explicit activation
- iOS background continuation only works in apps that declare the audio background mode and keep the app alive; force-quit and cold relaunch are still unsupported
- Android background continuation requires a visible app context for start, microphone permission, and an active foreground-service notification.
- Android background behavior can still be constrained by OEM battery management and unsupported hidden-start scenarios.
- Expo automation and production detection quality hardening are later stories

## Compatibility Notes

- use the package through the public API exported from `src/index.ts`
- check `getStatus()` before assuming lifecycle methods are available in your environment
- if `getStatus().state === 'unsupported'`, the runtime is not available and lifecycle methods will reject with a consistent error message
- today, the supported validation path is the repo example app and equivalent bare React Native consumers using the current library scaffold
- supported iOS background continuation requires `UIBackgroundModes` to include `audio`; without it, the runtime will surface an explicit `unsupported` state after the app backgrounds
- supported Android background continuation requires `RECORD_AUDIO`, foreground-service permissions, and a start from a visible activity context; otherwise the runtime surfaces an explicit `unsupported` or `permission` failure
- this quickstart is not a claim of production-ready engine detection or Expo-ready runtime support yet

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
