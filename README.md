# react-native-voice-activator

React Native and Expo voice conversation platform. Provides wake word detection and a managed multi-turn conversation session — say the wake word, speak to your AI, hear the response — with barge-in interruption, configurable lifecycle controls, and React hooks.

Current implementation status:

- the public lifecycle API is implemented
- typed runtime state and detection events are implemented
- real engine-backed local wake word detection is implemented through the built-in native-managed engine path
- a supported foreground runtime flow exists
- iOS background continuation is supported only when the app declares the audio background mode and remains alive
- Android background continuation is supported only when detection starts from a visible app context with microphone permission and the package can hold an active foreground-service notification

The current runtime is useful for validating app integration, lifecycle handling, engine-backed detection, and the constrained iOS background continuation model.

The example app also exposes evaluator-facing runtime diagnostics:

- current normalized runtime status from `getStatus()`
- latest structured error from `getStatus().lastError`
- recent runtime events including `stateChanged`, `error`, `interruption`, and `audioRouteChanged`
- the normalized error-category surface: `permission`, `lifecycle`, `configuration`, `engine`, `platform`, and `internal`

The example app also includes optional downstream STT/TTS extension examples:

- wake-word detection can trigger an application-owned STT handoff through `wakeWordDetected`
- a downstream TTS response can be wired after detection or transcript handling
- user-owned STT/TTS providers can be injected via `sttProvider` / `ttsProvider`; `CustomTTSAdapter` is the built-in on-device TTS option when you supply an ONNX model
- concrete reference adapter examples now live under `docs/examples/` and stay outside package core

## Conversation Session

The headline capability is the managed conversation loop — configure once, and the package drives the full experience:

```typescript
import {
  initialize,
  startDetection,
  useVoiceSession,
  WhisperRNSTTAdapter,
  CustomTTSAdapter,
} from 'react-native-voice-activator';

// Configure the session
await initialize({
  sttProvider: new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' }),
  ttsProvider: new CustomTTSAdapter({ modelPath: '/path/to/voice.onnx', phonemize }),
  session: {
    aiHandler: async (transcript) => myAI.chat(transcript),
    reListenMode: 'auto',
    silenceTimeoutMs: 8000,
  },
});
await startDetection();

// React hook for session state
function Assistant() {
  const { sessionState, lastTranscript, lastSpeechText, turnCount } = useVoiceSession();
  // sessionState: 'idle' | 'listening' | 'transcribing' | 'waiting' | 'speaking' | null
}
```

**The loop:** say wake word → session starts → STT listens → AI handler called → TTS speaks → re-listen (auto mode).
**Barge-in:** say the wake word while the AI is speaking to interrupt and start a new turn immediately.

See [`docs/conversation-session.md`](docs/conversation-session.md) for the full API reference.

## Wake-to-Transcribe-to-Speak Flow

The current evaluator path for a broader assistant experience is:

1. the package-owned native wake-word runtime detects a phrase and emits `wakeWordDetected`
2. the optional JS provider orchestration path can call an application-owned `sttProvider`
3. the runtime can optionally call an application-owned `ttsProvider` after a successful transcription when both `sttProvider` and `autoSpeak: true` are configured

This flow is demonstrated through the public API and typed events. The package owns the wake-word runtime; STT and TTS remain opt-in integrations. STT and TTS stay opt-in, application-owned — the package itself does not own transcription or synthesis. Custom providers are documented in `docs/examples/`. The example app shows the real wake-word runtime plus separate simulated provider previews that use the same app-owned adapter shape.

The bundled Sherpa keyword set currently includes `HELLO WORLD`, `HI GOOGLE`,
`HEY SIRI`, `ALEXA`, `LOVE AND PEACE`, `PLAY MUSIC`, `GO HOME`, `HAPPY NEW
YEAR`, and `MERRY CHRISTMAS`. The example app now exposes those as preset
keyword selections by passing `engineConfig.assetKeys.keywordAssetKey` through
the existing `initialize()` API.

## Reliability evaluation artifacts

The current evaluation harness for quiet/noisy and endurance validation is tracked in:

- `tests/fixtures/reliability/reference-device-matrix.json`
- `tests/fixtures/reliability/quiet-acceptance-set.json`
- `tests/fixtures/reliability/noisy-acceptance-set.json`
- `tests/fixtures/reliability/endurance-plan.json`
- `tests/fixtures/reliability/latest-results.json`

Today those artifacts prove:

- the evaluation contract and fixture manifests exist
- Android native compile evidence is recorded
- physical-device quiet/noisy and 30-minute endurance runs are still pending and must not be overstated
- there is not yet an automated runner that executes those scenarios end-to-end
- completed physical-device runs must replace placeholder null metrics in `latest-results.json` with measured values

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
// Session APIs: addSessionListener, getSession, useVoiceSession — see ## Conversation Session above

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
- downstream STT/TTS integrations can be layered on top of the public event contract without modifying package internals
- The package owns the wake-word runtime; STT and TTS stay opt-in, application-owned: the package itself does not own transcription or synthesis

## Custom TTS Provider

Install the ONNX inference dependency:

```sh
npm install onnxruntime-react-native
```

Use `CustomTTSAdapter` through `initialize()`:

```ts
import { CustomTTSAdapter, WhisperRNSTTAdapter } from 'react-native-voice-activator';

// Supply a phonemize callback that converts text to espeak-ng phoneme IDs
// (Piper TTS models use espeak-ng IDs — implement this using piper-phonemize or your own lookup table)
const phonemize = async (text: string): Promise<BigInt64Array> => {
  // return your phoneme IDs here
};

await initialize({
  sttProvider: new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' }),
  ttsProvider: new CustomTTSAdapter({
    modelPath: '/path/to/voice.onnx',
    phonemize,
  }),
  autoSpeak: true,
});
```

Notes:

- `CustomTTSAdapter` requires an ONNX model file bundled or downloaded by the host app
- `phonemize` is required — phoneme tables are model-specific; see `docs/examples/custom-tts-provider.md`
- `sampleRate` defaults to 22050 Hz (Piper standard); pass `sampleRate: 16000` for 16 kHz models
- `speakerId` is optional — used for multi-speaker Piper models
- setup docs contain additional native/prebuild requirements for bare React Native and Expo consumers

## Built-In Model Configuration

The built-in default engine is the package-owned native-managed Sherpa-ONNX path.

- the default path uses bundled native Sherpa model assets and requires no
  vendor credential
- the supported public override points remain
  `engineConfig.assetKeys.modelAssetKey` and
  `engineConfig.assetKeys.keywordAssetKey`
- custom asset keys are for host apps that intentionally ship their own Sherpa
  model bundle and keyword file through the same native asset ownership model
- Expo consumers still configure those assets through the same config-plugin and
  prebuild path; the package does not support JS-owned runtime model download

## Current Limitations

- iOS background continuation still depends on the host app staying alive after explicit activation
- iOS background continuation only works in apps that declare the audio background mode and keep the app alive; force-quit and cold relaunch are still unsupported
- Android background continuation requires a visible app context for start, microphone permission, and an active foreground-service notification.
- Android background behavior can still be constrained by OEM battery management and unsupported hidden-start scenarios.
- Expo automation and production detection quality hardening are later stories
- STT/TTS examples in the repo are illustrative downstream integrations, not built-in package runtime features — see `docs/examples/` for `CustomTTSAdapter` and `WhisperRNSTTAdapter` usage guides

## Compatibility Notes

- current support matrix: React Native `0.83+`, Expo SDK `55+`
- use the package through the public API exported from `src/index.ts`
- choose the path-specific setup guide that matches your app:
  - bare React Native: `docs/bare-react-native-setup.md`
  - Expo: `docs/expo-setup.md`
- check `getStatus()` before assuming lifecycle methods are available in your environment
- if `getStatus().state === 'unsupported'`, the runtime is not available and lifecycle methods will reject with a consistent error message
- today, the supported validation path is the repo example app and equivalent bare React Native consumers using the current library scaffold
- supported iOS background continuation requires `UIBackgroundModes` to include `audio`; without it, the runtime will surface an explicit `unsupported` state after the app backgrounds
- supported Android background continuation requires `RECORD_AUDIO`, foreground-service permissions, and a start from a visible activity context; otherwise the runtime surfaces an explicit `unsupported` or `permission` failure
- Expo config and prebuild compatibility are validated through docs, contract checks, the Expo-capable example package scripts in `example/package.json`, an Expo CLI config resolution check against the example app, and Expo prebuild generation against a temporary copy of the example app.
- Expo Go is NOT supported.
- this quickstart is not a claim of full Expo runtime CI execution or production-ready device coverage yet

## Setup Guides

- Bare React Native setup: `docs/bare-react-native-setup.md`
- Expo setup: `docs/expo-setup.md`

Both guides identify:

- what is automated
- what still requires developer action
- what platform limitations still apply
- what the repository actually validates today

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
