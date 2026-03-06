# react-native-voice-activator

React Native and Expo wake word detection library

This repository is currently at Story `1.2` contract-definition state. The public TypeScript API exists, but the real native wake word runtime is still being implemented in later stories.

## Installation


```sh
npm install react-native-voice-activator
```


## Usage


```ts
import {
  addWakeWordListener,
  getStatus,
  initialize,
  startDetection,
  stopDetection,
  dispose,
} from 'react-native-voice-activator';

const status = getStatus();
const subscription = addWakeWordListener('stateChanged', (event) => {
  console.log('state changed', event.state);
});

if (status.canStart) {
  await initialize();
  await startDetection();
  await stopDetection();
  await dispose();
}

subscription.remove();
```

At this stage the package exposes the intended lifecycle contract, but `getStatus()` may report `unsupported` until later native runtime stories land. In that state, lifecycle methods reject with a consistent bootstrap-stage error and listeners remain safe to register or remove.


## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
