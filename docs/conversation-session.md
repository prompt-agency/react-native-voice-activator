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
import { initialize, useVoiceSession } from 'react-native-voice-activator';

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

// 2. Say your wake word — the session starts automatically

// 3. React to session state in your component
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
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `aiHandler` | `(transcript: string) => Promise<string>` | Yes | Receives the user's transcribed speech; return the text you want spoken back. |
| `reListenMode` | `'auto' \| 'manual'` | Yes | `'auto'` re-arms listening automatically after each turn. `'manual'` waits for your app to call `session.listen()`. |
| `silenceTimeoutMs` | `number` | No | Milliseconds of silence in the listening state before the session ends with `sessionEnded { reason: 'timeout' }`. |
| `maxTurns` | `number` | No | Maximum number of turns before the session ends with `sessionEnded { reason: 'explicit' }`. |

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
| `waiting` | AI handler called, waiting for response. |
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

The package implements a Siri-style barge-in pattern: if the user says the wake word while the AI is speaking (or while the AI handler is running), the session:

1. Stops TTS playback within ~300ms
2. Discards any pending AI response
3. Immediately starts a new listening turn

This is automatic — no configuration required. Barge-in fires any time the wake word fires while a session is in `speaking` or `waiting` state.

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
  console.error(err.code, err.message); // e.g., 'stt_failed', 'ai_handler_failed'
  // session is now idle — user can say wake word again to restart
});
```

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
