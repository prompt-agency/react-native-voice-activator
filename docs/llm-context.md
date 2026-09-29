# react-native-voice-activator: LLM/AI Assistant Context

> This page exists to orient AI assistants and developers in one read. Start here, then follow the linked docs for depth.
>
> Full README: [README.md](../README.md) | All docs: [Documentation table](#documentation)

---

## What This Package Does

On-device wake word detection and managed multi-turn voice conversation sessions for React Native and Expo. Say a trigger phrase and the package drives the full loop: listen for speech, transcribe it, call your AI handler, speak the response, then listen again. No cloud required for wake word detection. Speech-to-text and text-to-speech are opt-in, provider-injected, and run on-device.

**Supports:** React Native `0.86+` · Expo SDK `57+` · iOS 13+ · Android API 26+. Expo Go is NOT supported -- use `expo prebuild` or EAS Build.

---

## Architecture

```
Public API          src/public/          Singleton functions + React hooks
Orchestration       src/runtime/         Session loop manager (wake→STT→AI→TTS)
Engines             src/engines/         Native-managed engine runtime (Sherpa-ONNX)
Providers           src/providers/       Opt-in STT / TTS / VAD / verification adapters
Internal            src/internal/        Native bridge, event emitters, runtime store
Native Interface    NativeVoiceActivator.ts  Nitro Modules codegen spec
```

**Key design facts:**

- **Singleton state.** `src/public/voice-activator.ts` uses module-level variables, not a class. One runtime per app process. `initialize()` / `dispose()` manage the lifecycle.
- **Two event emitters.** `runtimeEvents` fires wake word lifecycle events (`wakeWordDetected`, `stateChanged`, `error`, `interruption`, `audioRouteChanged`). `sessionEvents` fires conversation turn events (`sessionStarted`, `sessionListening`, `sessionTranscribed`, `sessionSpeaking`, `sessionTurnComplete`, `sessionEnded`, `sessionError`). Subscribe with `addWakeWordListener` and `addSessionListener` respectively.
- **Provider injection.** STT and TTS are passed to `initialize()` via `sttProvider` / `ttsProvider`. The package never owns transcription or synthesis -- it calls your provider at the right moment in the loop.
- **Generation IDs.** A counter increments on each new session. Async provider callbacks capture the generation at call time and no-op if it no longer matches. This prevents a slow STT response from a stale session completing into a new one.
- **Barge-in fast-path.** If a wake word fires while TTS is speaking, a dedicated path calls `ttsProvider.stop()` and re-enters the listen stage without waiting for the normal orchestration queue. Interruption latency is under 300ms.

---

## Key Concepts

**Session loop.** Once `sttProvider` and `ttsProvider` are both passed to `initialize()`, each wake word automatically triggers: `sttProvider.transcribe()` → `aiHandler(transcript)` → `ttsProvider.speak(response)` → optional re-listen. Without both providers, wake word events fire but no session loop activates.

**VAD gate.** The optional `SileroVADEngine` sits between wake word detection and STT handoff. It requires sustained speech energy before forwarding to transcription, filtering accidental trigger events.

**Speaker verification.** The optional `SherpaOnnxSpeakerVerificationAdapter` compares the speaker's live voiceprint to an enrolled embedding before proceeding with a session turn. Enrollment data is biometric -- see [Privacy & Compliance](#privacy--compliance-summary) below.

**Noise suppression.** The optional `SherpaOnnxNoiseSuppressionAdapter` preprocesses audio before transcription to improve STT accuracy in noisy environments.

**Anti-spoofing.** The optional `SherpaOnnxAntiSpoofingAdapter` runs a liveness check to reject replay attacks before speaker verification.

**`reListenMode`.** Set to `'auto'` in `VoiceSessionConfig` and the loop re-enters the listen stage automatically after TTS finishes. Set to `'manual'` to wait for an explicit `session.listen()` call.

---

## Complete API Surface

### Lifecycle Functions

| Export | Description |
|--------|-------------|
| `initialize(options)` | Load the wake word engine and register providers. Must be called before `startDetection()`. |
| `startDetection()` | Begin listening for wake words. Engine must be initialized. |
| `stopDetection()` | Stop listening. Keeps engine loaded -- cheaper to restart than re-initialize. |
| `dispose()` | Release all native resources. Call on unmount / app background. |
| `getStatus()` | Returns `WakeWordStatus` snapshot: `state`, `lastError`, `isListening`, etc. |
| `getSession()` | Returns the active `VoiceSession` object, or `null` if no session is running. |
| `setAudioRoute(route)` | Switch output between `'default'`, `'speaker'`, `'earpiece'`, and `'bluetooth'`. |

### Events

| Export | Description |
|--------|-------------|
| `addWakeWordListener(event, cb)` | Subscribe to runtime events. Returns `{ remove() }`. |
| `addSessionListener(event, cb)` | Subscribe to session turn events. Returns `{ remove() }`. |

**Runtime event names:** `'wakeWordDetected'` · `'stateChanged'` · `'error'` · `'interruption'` · `'audioRouteChanged'`

**Session event names:** `'sessionStarted'` · `'sessionListening'` · `'sessionTranscribed'` · `'sessionSpeaking'` · `'sessionTurnComplete'` · `'sessionEnded'` · `'sessionError'`

### Speaker Enrollment

| Export | Description |
|--------|-------------|
| `enrollSpeaker(userId, audioBuffer)` | Extract voiceprint from audio buffer and store in memory. Requires explicit user consent first (GDPR/BIPA). |
| `exportEnrollment()` | Serialize enrollment to `EnrollmentData` for persistent storage. Encrypt at rest in your app. |
| `importEnrollment(data)` | Restore a previously exported enrollment. |
| `clearEnrollment()` | Remove all biometric data from memory immediately. |

### React Hooks

| Export | Description |
|--------|-------------|
| `useWakeWord()` | Reactive `UseWakeWordResult` snapshot: runtime state, last detected phrase, STT and TTS states. |
| `useVoiceSession()` | Reactive `UseVoiceSessionResult` snapshot: session state, last transcript, current turn. |

### Built-In Provider Adapters (opt-in)

| Export | Peer Dependency | Description |
|--------|----------------|-------------|
| `WhisperRNSTTAdapter` | `whisper.rn` | On-device STT via Whisper models. |
| `SherpaOnnxTTSAdapter` | none (bundled) | On-device TTS via Piper VITS models through the bundled Sherpa-ONNX layer. |
| `CustomTTSAdapter` | `onnxruntime-react-native` | On-device TTS via any Piper ONNX model. Note: may cause duplicate ONNX symbols on iOS -- see [iOS ONNX Conflict Resolution](ios-onnx-conflict-resolution.md). |
| `SileroVADEngine` | none (bundled) | VAD gate between wake word and STT. |
| `SherpaOnnxSpeakerVerificationAdapter` | none (bundled) | Voiceprint-based speaker identity check. |
| `SherpaOnnxNoiseSuppressionAdapter` | none (bundled) | Audio noise suppression preprocessing. |
| `SherpaOnnxAntiSpoofingAdapter` | none (bundled) | Liveness check before speaker verification. |

### Key Types

```typescript
// initialize() options
WakeWordInitializationOptions {
  engineConfig?: WakeWordEngineConfiguration
  sttProvider?: SpeechToTextProvider
  ttsProvider?: TextToSpeechProvider
  session?: VoiceSessionConfig
  speakerVerificationProvider?: SpeakerVerificationProvider
  audioPreprocessingProvider?: AudioPreprocessingProvider
  antiSpoofingProvider?: AntiSpoofingProvider
}

// session loop config
VoiceSessionConfig {
  aiHandler: AIHandler              // (transcript: string) => Promise<string>
  reListenMode: 'auto' | 'manual'
  silenceTimeoutMs?: number
  maxTurns?: number
}

// provider interfaces (implement these for custom providers)
SpeechToTextProvider {
  name: string
  transcribe(): Promise<TranscriptionResult>
  cancel(): Promise<void>
}
TextToSpeechProvider {
  name: string
  speak(text: string, options?: TTSOptions): Promise<void>
  stop(): Promise<void>
}

// status snapshot
WakeWordStatus {
  state: WakeWordState              // 'idle' | 'initializing' | 'ready' | 'starting' | 'running' | 'interrupted' | 'stopping' | 'stopped' | 'error' | 'unsupported'
  isAvailable: boolean
  isListening: boolean
  canStart: boolean
  reason?: string
  lastError?: WakeWordError | null
}

// error shape
WakeWordError {
  category: WakeWordErrorCategory   // see Error Reference below
  message: string
  recoverable: boolean
}
```

---

## Minimal Setup

### Wake Word Only (bare React Native)

Validates the runtime without STT or TTS. Say "Hello World" to confirm detection.

```typescript
import {
  initialize,
  startDetection,
  stopDetection,
  addWakeWordListener,
  getStatus,
  dispose,
} from 'react-native-voice-activator';

async function runQuickstart() {
  const status = getStatus();
  if (status.state === 'unsupported') {
    console.log('Unsupported:', status.lastError?.message);
    return;
  }

  const sub = addWakeWordListener('wakeWordDetected', (e) => {
    console.log('Detected:', e.detectedPhrase);
  });

  try {
    await initialize();
    await startDetection();
    // say "Hello World"
    await stopDetection();
    await dispose();
  } finally {
    sub.remove();
  }
}
```

### Wake Word Only (Expo)

Same API. Add the plugin to `app.json` first:

```json
{
  "expo": {
    "plugins": [
      ["react-native-voice-activator", { "microphonePermissionText": "Microphone is used for wake word detection." }]
    ]
  }
}
```

Then run `npx expo prebuild && cd ios && pod install`. Runtime code is identical to bare React Native above.

### Full Session (STT + TTS + AI handler)

```typescript
import {
  initialize,
  startDetection,
  useVoiceSession,
} from 'react-native-voice-activator';
import { WhisperRNSTTAdapter } from 'react-native-voice-activator';
import { SherpaOnnxTTSAdapter } from 'react-native-voice-activator';

// 1. Wire providers + AI handler
await initialize({
  sttProvider: new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' }),
  ttsProvider: new SherpaOnnxTTSAdapter({
    modelPath: `${RNFS.DocumentDirectoryPath}/sherpa-tts/en_US-ryan-low.onnx`,
    tokensPath: `${RNFS.DocumentDirectoryPath}/sherpa-tts/tokens.txt`,
    dataDir:    `${RNFS.DocumentDirectoryPath}/sherpa-tts/espeak-ng-data`,
  }),
  session: {
    aiHandler: async (transcript) => {
      // call your LLM or backend here
      return `You said: ${transcript}`;
    },
    reListenMode: 'auto',
  },
});

await startDetection();

// 2. React component subscribes to session state
function ConversationUI() {
  const { state, lastTranscript } = useVoiceSession();
  return <Text>{state === 'listening' ? 'Listening...' : lastTranscript}</Text>;
}
```

See [Conversation Session](conversation-session.md) for the full session event reference.

---

## Common Patterns

### Pattern 1: Wake word only, no session

Use when you want to react to a trigger phrase but drive STT/TTS yourself.

```typescript
await initialize(); // no sttProvider or ttsProvider

addWakeWordListener('wakeWordDetected', async (event) => {
  console.log('Triggered by:', event.detectedPhrase);
  // your own downstream logic here
});

await startDetection();
```

### Pattern 2: Custom provider (implement your own STT)

Implement the `SpeechToTextProvider` interface and pass it to `initialize()`.

```typescript
import type { SpeechToTextProvider, TranscriptionResult } from 'react-native-voice-activator';

class MySTTProvider implements SpeechToTextProvider {
  readonly name = 'MySTT';

  async transcribe(): Promise<TranscriptionResult> {
    // start recording, stop on silence, return transcript
    return { text: 'hello world', confidence: 0.95, provider: 'MySTT' };
  }

  async cancel(): Promise<void> {
    // stop recording and discard
  }
}

await initialize({
  sttProvider: new MySTTProvider(),
  ttsProvider: myTTSProvider,
  session: { aiHandler: myAIHandler, reListenMode: 'auto' },
});
```

### Pattern 3: Manual re-listen (you control when to listen again)

```typescript
await initialize({
  sttProvider: stt,
  ttsProvider: tts,
  session: {
    reListenMode: 'manual',
    aiHandler: async (transcript) => {
      const response = await callMyBackend(transcript);
      return response;
    },
  },
});

// Later, when ready for the next turn:
const session = getSession();
await session?.listen();
```

### Pattern 4: Speaker enrollment with consent gate

```typescript
import {
  enrollSpeaker,
  exportEnrollment,
  importEnrollment,
  clearEnrollment,
} from 'react-native-voice-activator';

// Enroll (requires explicit user consent first -- GDPR/BIPA requirement)
async function enrollWithConsent(userId: string, audioBuffer: ArrayBuffer) {
  const hasConsent = await showConsentDialog();
  if (!hasConsent) throw new Error('User consent required');

  await enrollSpeaker(userId, audioBuffer);
  const data = await exportEnrollment();
  await secureStorage.save(`enrollment_${userId}`, JSON.stringify(data));
}

// Restore on app launch
async function restoreEnrollment(userId: string) {
  const raw = await secureStorage.get(`enrollment_${userId}`);
  if (raw) await importEnrollment(JSON.parse(raw));
}

// Delete on account deletion or consent revocation
async function deleteEnrollment(userId: string) {
  await clearEnrollment();
  await secureStorage.delete(`enrollment_${userId}`);
}
```

---

## Error Reference

| `WakeWordErrorCategory` | Cause | Recovery |
|-------------------------|-------|----------|
| `permission` | Microphone permission denied | Request `RECORD_AUDIO` (Android) or check `NSMicrophoneUsageDescription` (iOS) |
| `lifecycle` | API called in wrong state (e.g. `startDetection` before `initialize`) | Check `getStatus().state` before calling lifecycle functions |
| `configuration` | Invalid or missing initialization options | Review `WakeWordInitializationOptions` -- both `sttProvider` and `ttsProvider` are required for sessions |
| `engine` | Native engine failed to load or crashed | Check that model assets are bundled correctly; see [Getting Started](getting-started.md) |
| `platform` | OS-level constraint (background mode, foreground service) | See [Background Behavior](background-behavior.md) |
| `internal` | Unexpected runtime error | File a bug; include `getStatus().lastError.message` |

All errors have `recoverable: boolean`. Non-recoverable errors require `dispose()` + `initialize()` to reset.

---

## Privacy & Compliance Summary

`enrollSpeaker()` processes biometric voiceprint data. Your app must:

- Obtain **explicit consent** before calling `enrollSpeaker()` (required by GDPR Art. 9, BIPA, CCPA)
- Encrypt `exportEnrollment()` output at rest
- Implement deletion: `clearEnrollment()` + delete stored data
- Disclose biometric data collection in your privacy policy

All processing is on-device. No data leaves the device through this library.

---

## Documentation

| Document | Description |
|---|---|
| [LLM/AI Assistant Context](llm-context.md) | This page -- one-stop orientation |
| [Getting Started](getting-started.md) | Step-by-step setup from zero to first detection |
| [Bare React Native Setup](bare-react-native-setup.md) | Native project configuration for bare React Native |
| [Expo Setup](expo-setup.md) | Config plugin and prebuild setup for Expo |
| [Conversation Session](conversation-session.md) | Full session API, events, barge-in, and React hooks |
| [Background Behavior](background-behavior.md) | iOS and Android background detection constraints |
| [WhisperRN STT Provider](examples/whisper-stt-provider.md) | On-device speech-to-text setup |
| [Custom TTS Provider](examples/custom-tts-provider.md) | On-device text-to-speech setup |
| [iOS ONNX Conflict Resolution](ios-onnx-conflict-resolution.md) | Fix duplicate ONNX symbol linker errors |
| [Wake Word Training](model-training/wake-word-training.md) | Train a custom wake word offline |
| [TTS Voice Cloning](model-training/tts-voice-cloning.md) | Train a custom TTS voice |
| [Troubleshooting](troubleshooting.md) | Full error category reference |
| [Android TTS Setup](android-tts-setup.md) | Android model asset placement for SherpaOnnxTTSAdapter |
| [Migration](migration.md) | Version migration guide |
| [App Store Submission](app-store-submission.md) | App Store review guidance |
