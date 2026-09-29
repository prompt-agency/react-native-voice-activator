# Conversation Session

The conversation session is the full-stack voice loop — from wake word detection through multi-turn listening, transcription, AI callback, and speech output. Use it when your app needs a real conversational assistant experience instead of a raw wake-word-to-action trigger.

## When to Use the Session API

| Use case | Recommended API |
|---|---|
| Simple command-and-response | `addWakeWordListener` + your own STT/TTS wiring |
| Multi-turn voice assistant | `VoiceSessionConfig` + `useVoiceSession()` |

## Architecture

The session automatically manages this loop:

```
Wake word detected
    ↓
STT: listen for user speech
    ↓
AI handler called with transcript
    ↓
TTS: speak AI response
    ↓
(repeat: auto mode) or (wait: manual mode)
```

The package owns the entire loop. Your app provides the AI handler function and receives session events.

## Quick Start

```typescript
import {
  initialize,
  startDetection,
  useVoiceSession,
} from 'react-native-voice-activator';

// 1. Configure with a session
await initialize({
  builtInSTT: { modelId: 'whisper-tiny-en' },
  builtInTTS: { modelId: 'piper-en-lessac' },
  session: {
    aiHandler: async (transcript) => {
      // Call your backend or LLM here
      const response = await myAI.chat(transcript);
      return response.text;
    },
    reListenMode: 'auto',    // keep listening after each turn
    silenceTimeoutMs: 10000, // end session after 10s of silence
    maxTurns: 5,             // end after 5 turns (optional)
  },
});

// 2. Start wake word detection
await startDetection();

// 3. Say your wake word — the session starts automatically

// 4. React to session state in your component
function VoiceAssistant() {
  const { sessionState, lastTranscript, lastSpeechText, turnCount } = useVoiceSession();

  return (
    <View>
      <Text>State: {sessionState ?? 'inactive'}</Text>
      <Text>You said: {lastTranscript}</Text>
      <Text>AI said: {lastSpeechText}</Text>
      <Text>Turn: {turnCount}</Text>
    </View>
  );
}
```

## `VoiceSessionConfig` Reference

```typescript
interface VoiceSessionConfig {
  aiHandler: (transcript: string) => Promise<string>;
  reListenMode: 'auto' | 'manual';
  silenceTimeoutMs?: number;
  maxTurns?: number;
  vad?: VADConfig;
  providerTimeoutMs?: number;
  aiHandlerTimeoutMs?: number;
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `aiHandler` | `(transcript: string) => Promise<string>` | Yes | Receives the user's transcribed speech; return the text you want spoken back. |
| `reListenMode` | `'auto' \| 'manual'` | Yes | `'auto'` re-arms listening automatically after each turn. `'manual'` waits for your app to call `session.listen()`. |
| `silenceTimeoutMs` | `number` | No | Session-level timeout while in `listening`: if the user never finishes an utterance, the session ends with `sessionEnded { reason: 'timeout' }`. Separate from `vad.silenceTimeoutMs` (VAD debounce before `speechEnd`). |
| `maxTurns` | `number` | No | Maximum number of turns before the session ends with `sessionEnded { reason: 'explicit' }`. |
| `vad` | `VADConfig` | No | When set, the session uses bundled Silero VAD for the `listening` phase: audio is captured once via the VAD native stream, and `speechEnd` (plus `speechPadMs`) triggers transcription from a temp WAV. Requires an STT provider that implements `transcribeFromWavPath` (e.g. `WhisperRNSTTAdapter`). When omitted, `transcribe()` runs immediately as before (mic recording inside the STT provider). |
| `providerTimeoutMs` | `number` | No | Bound on a single `transcribe()` or `speak()` call, default `30000`. On expiry the turn emits `sessionError` with `stt_timeout` or `tts_timeout`. `0` disables. |
| `aiHandlerTimeoutMs` | `number` | No | Bound on the `aiHandler` call, default `60000`. On expiry the turn emits `sessionError` with `ai_handler_timeout`. `0` disables. |

### Timeouts: what `silenceTimeoutMs` does not cover

`silenceTimeoutMs` only arms during the `listening` stage and is cleared as soon as STT resolves. It guards a user who never finishes speaking — it does **not** guard a provider or handler that never returns.

Those need their own bounds, because a hang would otherwise strand the turn in its stage with no recovery other than an external `close()`:

| If this never returns | Code emitted | Bounded by | Default |
|---|---|---|---|
| `sttProvider.transcribe()` | `stt_timeout` | `providerTimeoutMs` | 30s |
| `aiHandler()` | `ai_handler_timeout` | `aiHandlerTimeoutMs` | 60s |
| `ttsProvider.speak()` | `tts_timeout` | `providerTimeoutMs` | 30s |

`aiHandlerTimeoutMs` is the one most worth setting deliberately: it is usually a network round-trip to an LLM, so it is the likeliest of the three to hang, and the default 60s is generous.

```typescript
session: {
  aiHandler,
  reListenMode: 'auto',
  aiHandlerTimeoutMs: 20_000, // fail fast on a slow LLM
}
```

### VAD on Android: supply `modelPath`

`VADConfig.modelPath` is **required on Android**. The bundled
`silero_vad.onnx` lives inside the APK, and `onnxruntime-react-native` can no
longer read it in place: its Java module only exposes `install()`, and the
older bridge `loadModel()` that understood the `asset://` scheme is gone. An
`asset://` string now reaches native as a plain filesystem path and fails with
`File doesn't exist`.

Extract the asset once and pass the absolute path. Omit it on iOS, where ORT
resolves the bare filename from the main bundle.

```ts
import { Platform } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

async function resolveVadModelPath(): Promise<string | undefined> {
  if (Platform.OS !== 'android') return undefined;
  const dest = `${RNFS.DocumentDirectoryPath}/silero_vad.onnx`;
  if (!(await RNFS.exists(dest))) {
    await RNFS.copyFileAssets('silero_vad.onnx', dest);
  }
  return dest;
}

await initialize({
  sttProvider,
  ttsProvider,
  session: {
    aiHandler,
    reListenMode: 'auto',
    silenceTimeoutMs: 10_000,
    vad: { modelPath: await resolveVadModelPath() },
  },
});
```

::: warning silenceTimeoutMs depends on VAD
`silenceTimeoutMs` only behaves as a "user never spoke" guard when `vad` is
configured, because `speechStart` is what clears the timer. Without `vad`,
nothing clears it until `transcribe()` resolves, so the budget must also cover
STT inference — otherwise the session is cancelled mid-utterance with
`sessionEnded { reason: 'timeout' }`.
:::

### Passing the Session Config

Pass `session` inside `WakeWordInitializationOptions`:

```typescript
await initialize({
  sttProvider: mySTT,  // or builtInSTT
  ttsProvider: myTTS,  // or builtInTTS
  session: {
    aiHandler: myHandler,
    reListenMode: 'auto',
  },
});
```

**Important:** A session will only start if BOTH an STT provider and a TTS provider are configured. If either is missing, wake word detection works normally but no session starts.

## `VoiceSession` Interface

```typescript
interface VoiceSession {
  readonly state: VoiceSessionState;
  listen(): Promise<void>;
  close(): Promise<void>;
  addListener<TEventName extends VoiceSessionEventName>(
    eventName: TEventName,
    listener: VoiceSessionEventListener<TEventName>
  ): VoiceSessionSubscription;
}
```

| Method | Description |
|---|---|
| `.state` | Current session state (see state model below). |
| `.listen()` | In manual mode: starts the next listening turn. No-op in any other state. |
| `.close()` | Ends the session immediately, stops STT/TTS, emits `sessionEnded { reason: 'explicit' }`. Idempotent. |
| `.addListener(event, fn)` | Instance-scoped event listener. Returns a subscription with `.remove()`. |

Access the active session via `getSession()`:

```typescript
import { getSession } from 'react-native-voice-activator';

const session = getSession(); // VoiceSession | null
await session?.close();
```

## Session State Model

```
idle → listening → transcribing → waiting → speaking → (idle or closed)
```

| State | Meaning |
|---|---|
| `idle` | Session started or turn completed in manual mode — waiting for `listen()`. |
| `listening` | STT is active and waiting for user speech. |
| `transcribing` | User speech captured, processing text. |
| `waiting` | AI handler called, waiting for response. **Note:** no event is emitted for this transition — only observable via `getSession()?.state`, not via the hook or `addSessionListener`. |
| `speaking` | TTS speaking the AI response. |
| `closed` | Session ended. All resources released. |
| `null` | No active session (hook only: `sessionState` is null when no session exists). |

## Session Events

Listen via `session.addListener(eventName, fn)` (instance-scoped) or `addSessionListener` (global bus):

```typescript
import { addSessionListener } from 'react-native-voice-activator';

const sub = addSessionListener('sessionTranscribed', (payload) => {
  console.log('User said:', payload.text);
});

// Later:
sub.remove();
```

| Event | Payload | Description |
|---|---|---|
| `sessionStarted` | `{}` | Session created (wake word just fired). |
| `sessionListening` | `{}` | STT armed, microphone active. |
| `sessionTranscribed` | `{ text: string }` | User speech captured. |
| `sessionSpeaking` | `{ text: string }` | AI response being spoken (text is the response). |
| `sessionTurnComplete` | `{ turn: number }` | Full turn done. `turn` is 1-based. |
| `sessionEnded` | `{ reason: 'timeout' \| 'explicit' }` | Session closed. `explicit` for `close()` or `maxTurns`. `timeout` for `silenceTimeoutMs`. |
| `sessionError` | `WakeWordError` | STT, TTS, or AI handler error. Session returns to idle. |
| `speechStart` | `{}` | Bundled Silero VAD detected speech onset (when `SileroVADEngine` is running). |
| `speechEnd` | `{ durationMs: number }` | Bundled Silero VAD detected speech offset; `durationMs` is the detected speech span. |

## `useVoiceSession()` Hook

The `useVoiceSession()` hook gives React components reactive access to session state:

```typescript
import { useVoiceSession } from 'react-native-voice-activator';

function AssistantDisplay() {
  const {
    sessionState,    // VoiceSessionState | null
    lastTranscript,  // string | null — user's last speech
    lastSpeechText,  // string | null — AI's last response
    lastError,       // WakeWordError | null
    turnCount,       // number — completed turns (1-based, resets on sessionStarted)
    listen,          // () => Promise<void> — manual mode: next turn
    close,           // () => Promise<void> — end session
  } = useVoiceSession();
}
```

**Snapshot persistence:** `lastTranscript` and `lastSpeechText` persist across session boundaries so the last conversation remains visible. `turnCount` resets to 0 on each new session.

## Conversation Modes

### Auto Mode (`reListenMode: 'auto'`)

After each complete turn (speaking → done), the session immediately re-arms the microphone. No app intervention needed.

```typescript
session: {
  aiHandler: myHandler,
  reListenMode: 'auto',
  silenceTimeoutMs: 8000, // end session if no speech for 8s
}
```

Best for: always-on assistant experiences.

### Manual Mode (`reListenMode: 'manual'`)

After each turn, the session pauses in `idle`. Your app controls when the next turn starts:

```typescript
session: {
  aiHandler: myHandler,
  reListenMode: 'manual',
}

// In your UI:
const { listen } = useVoiceSession();
<Button onPress={listen} title="Talk Again" />
```

Best for: push-to-talk style flows, or when your UI needs to interject before the next turn.

## Barge-In (Interruption)

The package implements a Siri-style barge-in pattern. What happens depends on which stage the turn is in when the wake word fires:

| Turn stage | Behaviour |
|---|---|
| `speaking` (TTS playing) | Stops TTS playback, discards the rest of the response, starts a new listening turn. |
| `waiting` (your AI handler is running) | The handler is **not** cancelled — it runs to completion, then its response is discarded and a new listening turn starts. |
| `listening` / `transcribing` | Abandons the utterance in progress and starts a fresh listening turn. The half-spoken phrase is never passed to your AI handler. |

Interruption latency has not yet been measured on physical devices. See [Reliability Validation](/reliability-validation) for what is and is not proven.

This is automatic — no configuration required. Barge-in fires whenever the wake word fires while a session is active in any stage other than `idle` or `closed`.

**Limitation (waiting state):** JavaScript Promises are not cancellable. If the AI handler is running and barge-in fires, the handler's promise is still awaited, but the response is discarded when it resolves. For low-latency barge-in, keep your AI handler fast-returning (streaming with early exit).

## Session Lifecycle Controls

```typescript
session: {
  aiHandler: myHandler,
  reListenMode: 'auto',
  silenceTimeoutMs: 10000, // 10s silence → session ends
  maxTurns: 5,             // max 5 turns → session ends
}
```

Both controls emit `sessionEnded`:
- `silenceTimeoutMs` fires with `reason: 'timeout'`
- `maxTurns` fires with `reason: 'explicit'`

## Error Handling

The session emits `sessionError` for STT, TTS, and AI handler failures and returns to `idle` — it does **not** close the session on non-fatal errors. The session only transitions to `closed` via `close()`, `silenceTimeoutMs`, or `maxTurns`.

```typescript
addSessionListener('sessionError', (err) => {
  console.error(err.code, err.message);
  // session is now idle — user can say wake word again to restart
});
```

Session error codes:

| Code | Meaning |
|---|---|
| `stt_failed` | `sttProvider.transcribe()` rejected. |
| `stt_timeout` | `transcribe()` exceeded `providerTimeoutMs`. |
| `ai_handler_failed` | Your `aiHandler` rejected. |
| `ai_handler_timeout` | Your `aiHandler` exceeded `aiHandlerTimeoutMs`. |
| `tts_failed` | `ttsProvider.speak()` rejected. |
| `tts_timeout` | `speak()` exceeded `providerTimeoutMs`. |

A `*_timeout` code means the call never settled and was abandoned, and the provider was asked to `cancel()`/`stop()`. A `*_failed` code means it rejected on its own.

## Full Example: Minimal Conversation App

```typescript
import React from 'react';
import { Text, View } from 'react-native';
import {
  initialize,
  startDetection,
  useVoiceSession,
} from 'react-native-voice-activator';

async function setupVoiceAssistant() {
  await initialize({
    builtInSTT: { modelId: 'whisper-tiny-en' },
    builtInTTS: { modelId: 'piper-en-lessac' },
    session: {
      aiHandler: async (transcript) => {
        // Replace with your API call
        return `You said: "${transcript}". How can I help?`;
      },
      reListenMode: 'auto',
      silenceTimeoutMs: 8000,
    },
  });
  await startDetection();
}

export function ConversationAssistant() {
  const { sessionState, lastTranscript, lastSpeechText, turnCount } = useVoiceSession();
  const isActive = sessionState !== null;

  return (
    <View>
      <Text>{isActive ? `Session active: ${sessionState}` : 'Say the wake word to start'}</Text>
      {lastTranscript && <Text>You: {lastTranscript}</Text>}
      {lastSpeechText && <Text>AI: {lastSpeechText}</Text>}
      {turnCount > 0 && <Text>Turn {turnCount}</Text>}
    </View>
  );
}
```
