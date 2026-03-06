# react-native-voice-activator

React Native and Expo wake word runtime library.

Current Epic 1 status:

- the public lifecycle API is implemented
- typed runtime state and detection events are implemented
- a supported foreground runtime flow exists
- real built-in wake word detection is not finished yet

Real engine-backed local wake word detection lands in Epic 2 integration work. The current foreground flow is still useful for validating app integration, lifecycle handling, and event wiring.

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

- Epic 1 does not yet provide real built-in wake word detection
- the current foreground flow should be treated as integration and lifecycle validation
- native runtime hardening and real engine-backed detection are part of Epic 2
- background behavior, Expo automation, and production detection quality are later stories

## Compatibility Notes

- use the package through the public API exported from `src/index.ts`
- check `getStatus()` before assuming lifecycle methods are available in your environment
- if `getStatus().state === 'unsupported'`, the runtime is not available and lifecycle methods will reject with a consistent error message
- today, the supported validation path is the repo example app and equivalent bare React Native consumers using the current library scaffold
- this quickstart is not a claim of production-ready engine detection or Expo-ready runtime support yet

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
