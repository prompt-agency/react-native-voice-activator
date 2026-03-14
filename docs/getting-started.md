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

The example app exposes those runtime diagnostics directly so evaluators can see:

- the current `getStatus()` snapshot
- the latest structured error
- recent runtime events
- the normalized error categories used by the package contract

The example app also includes optional downstream extension examples showing how:

- `wakeWordDetected` can trigger an application-owned STT handoff
- a TTS response step can run after detection or transcript handling
- those speech flows can stay outside the package runtime through custom providers, or opt into the built-in RunAnywhere path when `builtInSTT` / `builtInTTS` are configured
- with custom providers, those speech flows remain outside the package runtime and use public APIs only
- concrete adapter examples live in `docs/examples/` and remain application-owned

## Wake-to-Transcribe-to-Speak Guide

Use the current provider pattern in this order:

1. call `initialize()` with no providers to validate the baseline wake-word runtime first
2. add `sttProvider` when your app is ready to turn `wakeWordDetected` into an application-owned transcript step
3. add `ttsProvider` and `autoSpeak: true` only when your app is ready to play an optional speech response after a successful `sttProvider` transcription

That wake -> transcribe -> optional speak flow is the supported extension model.
The package owns step 1. Your app can own steps 2 and 3 through custom providers, or opt into the built-in RunAnywhere adapters as an exception to the default provider pattern.

## Conversation Session (Recommended for Assistant Apps)

For apps that need a multi-turn voice assistant experience, the conversation session
manages the complete wake-word → listen → transcribe → AI → speak → re-listen loop:

```typescript
await initialize({
  builtInSTT: { modelId: 'whisper-tiny-en' },
  builtInTTS: { modelId: 'piper-en-lessac' },
  session: {
    aiHandler: async (transcript) => {
      const response = await myBackend.chat(transcript);
      return response.text;
    },
    reListenMode: 'auto',    // keep listening after each turn
    silenceTimeoutMs: 10000, // end session after 10s of silence
  },
});
```

Once configured, a session starts automatically every time the wake word is detected.
Your app only provides the AI handler — the package owns the loop.

See [`./conversation-session.md`](./conversation-session.md) for the full API reference,
barge-in behavior, manual mode, and lifecycle controls.

## Built-In Engine Defaults

- the default built-in engine is native-managed Sherpa-ONNX
- the default path uses package-owned bundled native assets and requires no
  engine credential or vendor account provisioning
- if your app intentionally ships custom Sherpa assets, the public override
  points are `engineConfig.assetKeys.modelAssetKey` and
  `engineConfig.assetKeys.keywordAssetKey`
- the example app ships bundled keyword presets for `HELLO WORLD`, `HI GOOGLE`,
  `HEY SIRI`, `ALEXA`, `LOVE AND PEACE`, `PLAY MUSIC`, `GO HOME`, `HAPPY NEW
  YEAR`, and `MERRY CHRISTMAS`, and applies them through
  `engineConfig.assetKeys.keywordAssetKey`
- Expo and bare React Native consumers use the same public configuration shape;
  Expo just layers the package config plugin and prebuild flow on top of it

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
