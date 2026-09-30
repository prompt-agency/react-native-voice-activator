# ElevenLabs Agents: wake word to hot mic

[ElevenLabs Agents](https://elevenlabs.io/docs/eleven-agents/libraries/react-native)
runs the whole conversation: turn detection, transcription, the LLM and speech,
all server-side over WebRTC. What it does not do is decide *when the
conversation starts*. Its React Native SDK opens the microphone on a button
press and keeps it open.

This example puts a wake phrase in front of it. The app idles on-device with no
network traffic, and the moment someone says "hey acme" it hands a live
microphone to the agent.

Nothing here uses `sttProvider` or `ttsProvider`. ElevenLabs does both halves
server-side, so the managed session in this package would be redundant. This is
the mic-gate mode.

## The one rule that matters

**Never let both hold the microphone.** This package taps the mic for wake-word
detection; ElevenLabs publishes a WebRTC audio track. Two independent capture
streams on one device is not a configuration that works: on iOS the second tap
can fail outright, and on Android whichever consumer stops last silently starves
the other.

So the handoff is always: **stop detection, start the session** and, when the
session ends, **start detection again**. Every example below is built around
that, and it is the part people get wrong.

## Install

```bash
yarn add react-native-voice-activator
yarn add @elevenlabs/react-native @livekit/react-native @livekit/react-native-webrtc livekit-client
```

ElevenLabs' SDK is built on LiveKit's WebRTC implementation, which is why those
three come along.

**Expo Go will not work**, for either package. Use a development build:

```bash
npx expo prebuild --clean
npx expo run:ios --device
```

Set your agent id in `.env`:

```
EXPO_PUBLIC_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxxx
```

## The handoff

```tsx
import { useCallback, useEffect, useRef } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react-native';
import type { ConversationStatus } from '@elevenlabs/react-native';
import {
  initialize,
  startDetection,
  stopDetection,
  addWakeWordListener,
  prepareModels,
  getModelStatus,
  dispose,
} from 'react-native-voice-activator';

function VoiceGate() {
  // Guards against a wake word arriving while a session is already starting.
  // Detection is stopped by then, but the event can already be in flight.
  const busy = useRef(false);

  const conversation = useConversation({
    onDisconnect: () => {
      // The agent hung up, the user ended it, or the network dropped. The mic is
      // free again, so go back to listening for the phrase.
      busy.current = false;
      startDetection().catch(console.error);
    },
    onError: (message: string) => {
      console.error('[elevenlabs]', message);
      // Same path as a clean disconnect: without this a failed session leaves
      // the app deaf, with detection stopped and no session running.
      busy.current = false;
      startDetection().catch(console.error);
    },
    onStatusChange: ({ status }: { status: ConversationStatus }) => {
      console.log('[elevenlabs] status', status);
    },
  });

  const handleWakeWord = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;

    try {
      // Release the microphone before ElevenLabs asks for it.
      await stopDetection();
      await conversation.startSession({
        agentId: process.env.EXPO_PUBLIC_AGENT_ID,
      });
    } catch (error) {
      console.error('[handoff] could not start the session', error);
      busy.current = false;
      await startDetection();
    }
  }, [conversation]);

  useEffect(() => {
    const subscription = addWakeWordListener('wakeWordDetected', () => {
      handleWakeWord();
    });

    (async () => {
      // Idempotent: once the ~7.8 MB bundle is present this only re-verifies
      // checksums, so it is safe on every launch.
      if (!(await getModelStatus()).ready) {
        await prepareModels();
      }
      await initialize({ wakePhrase: 'hey acme' });
      await startDetection();
    })().catch(console.error);

    return () => {
      subscription.remove();
      dispose().catch(console.error);
    };
  }, [handleWakeWord]);

  return null;
}

export default function App() {
  return (
    <ConversationProvider>
      <VoiceGate />
    </ConversationProvider>
  );
}
```

## Why the error path restarts detection

The failure worth designing for is not the happy path, it is a session that
never connects. If `startSession` throws, or the agent errors out, detection is
already stopped. Without restarting it the app is deaf until it is relaunched,
and the user has no way to tell: the wake phrase simply stops working.

That is why `onError` and `onDisconnect` do the same thing here. Both mean "the
session is over, whatever the reason".

## Ending the conversation

`conversation.endSession()` triggers `onDisconnect`, which restarts detection.
Nothing else to do:

```tsx
await conversation.endSession();
```

If you want the agent to end its own turn and go back to idle, configure that in
the ElevenLabs agent (an end-call tool or a silence timeout) rather than here.
This package's job finishes at the handoff.

## What this costs

Wake-word detection is on-device and free. Everything after the handoff is
billed by ElevenLabs per minute, so the gate is also a cost control: the session
only exists while someone is actually talking to it, rather than an open mic
streaming to a vendor all day.

## Caveats

- **Background behaviour is not covered here.** A wake phrase heard while the
  app is backgrounded needs the iOS audio background mode or an Android
  foreground service, and starting a WebRTC session from the background is a
  separate problem. See [background behaviour](../background-behavior.md).
- **Detection accuracy is unmeasured.** Detection rate and false accepts per
  hour for arbitrary phrases have not been measured on physical devices, so
  `sensitivity` is untuned. A false accept here costs a real billed session.
  See [reliability validation](../reliability-validation.md).
- **Two audio stacks, one device.** Both packages configure the audio session.
  The stop-then-start ordering above is what keeps them from fighting; do not
  overlap them to save a few hundred milliseconds.
