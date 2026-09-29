---
layout: home

hero:
  name: react-native-voice-activator
  text: On-device wake word detection for React Native and Expo
  tagline: Say a trigger phrase, the package handles listening, transcription, and speech output, you decide what happens with the transcript in between.
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
  - title: On-device wake word detection
    details: Any phrase you like — wakePhrase 'hey acme' and you are done. No training, no cloud, no API key. Models download once, then run locally.
  - title: Managed conversation sessions
    details: The package drives the full wake, listen, AI, speak, re-listen loop for you.
  - title: Barge-in
    details: Say the wake word while the AI is speaking to interrupt TTS and start a new turn.
  - title: React hooks
    details: useWakeWord() and useVoiceSession() for reactive component updates.
  - title: Expo config plugin
    details: Automatic native configuration, permissions, background modes, manifest entries.
  - title: Extensible providers
    details: Inject your own STT and TTS providers. Built-in adapters (WhisperRNSTTAdapter, CustomTTSAdapter) are opt-in.
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
