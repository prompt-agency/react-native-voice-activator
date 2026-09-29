---
layout: home

hero:
  name: react-native-voice-activator
  text: The on-device wake word for React Native voice agents
  tagline: Listen for your phrase entirely on the device, then hand a hot mic to ElevenLabs, LiveKit or OpenAI Realtime. Or run the whole turn offline and never touch a network.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Conversation Session API
      link: /conversation-session
    - theme: alt
      text: View on GitHub
      link: https://github.com/prompt-agency/react-native-voice-activator

features:
  - title: Any phrase, no training
    details: wakePhrase 'hey acme' and you are done. No console, no dataset, no model to build. No cloud, no API key, no per-use cost.
  - title: The part voice agents are missing
    details: Every speech-to-speech platform assumes the mic is already open. LiveKit ships on-device wake word for Python, Rust and Swift, not React Native. Deepgram says it does not do wake word at all.
  - title: Use it as a mic gate
    details: addWakeWordListener fires, you hand the hot mic to whatever voice stack you already run. The handoff is where this package's job ends.
  - title: Or let it drive the turn
    details: Opt in to STT and TTS providers and it runs the full listen, transcribe, your AI, speak loop with barge-in. Worth it offline; redundant when your vendor does turn detection server-side.
  - title: React hooks and an Expo plugin
    details: useWakeWord() and useVoiceSession(), plus automatic native configuration, permissions, background modes and manifest entries.
  - title: New Architecture only
    details: React Native 0.86+ and Expo SDK 57+, built as a TurboModule. No old-architecture bridge, which is where most wake-word packages are stuck.
---

## What It Does

```mermaid
flowchart LR
    A["Wake Word\nDetected"] --> B["STT\nListen"]
    B --> C["AI Handler\nYour logic"]
    C --> D["TTS\nSpeak"]
    D --> E{"reListenMode"}
    E -->|auto| B
    E -->|manual| F["Wait for\nlisten()"]
```

## Quick Install

```sh
npm install react-native-voice-activator
```

Continue with [Getting Started](/getting-started) for platform setup (bare React Native or Expo), then [Conversation Session](/conversation-session) for the full session API. Upgrading from an earlier release? See [Upgrading](/upgrading).

> **Supports:** React Native `0.86+` &middot; Expo SDK `57+` &middot; iOS &middot; Android
> **Expo Go is NOT supported.** Use `expo prebuild` or EAS Build.

---

Built by [Prompt Digital Agency](https://prompt-digital.agency/) &middot; [hello@prompt-digital.agency](mailto:hello@prompt-digital.agency)
