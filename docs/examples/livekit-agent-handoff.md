# LiveKit Agents: wake word to hot mic

LiveKit does ship on-device wake word. [Their
docs](https://docs.livekit.io/agents/multimodality/audio/wakeword/) put it
plainly: "Detection runs on the client device, not on the agent server." The
client SDKs for it are Python, Rust and Swift.

There is no React Native one.

So if you are building a LiveKit voice agent in React Native, the wake-word half
is yours to solve. This is that half: idle on-device with no network traffic,
and connect to the room only once someone says the phrase.

As with any LiveKit agent, turn detection, transcription and speech all happen
server-side, so `sttProvider` and `ttsProvider` stay out of it. This is the
mic-gate mode.

## The one rule that matters

**Never let both hold the microphone.** This package taps the mic for wake-word
detection; LiveKit publishes a WebRTC audio track and calls
`AudioSession.startAudioSession()`, which takes over the platform audio session.
Two independent capture streams on one device is not a configuration that works:
on iOS the second tap can fail outright, and on Android whichever consumer stops
last silently starves the other.

The order is always **stop detection → start the audio session → connect**, and
in reverse on the way out.

## Install

```bash
yarn add react-native-voice-activator
yarn add @livekit/react-native @livekit/react-native-webrtc livekit-client
npx expo install @livekit/react-native-expo-plugin
```

**Expo Go will not work**, for either package. Use a development build:

```bash
npx expo prebuild --clean
npx expo run:ios --device
```

Call `registerGlobals()` once, at module scope, before anything touches LiveKit:

```ts
import { registerGlobals } from '@livekit/react-native';

registerGlobals();
```

## Getting a token

LiveKit rooms need a server-signed access token. Never ship your API secret in
the app; mint the token in your backend and fetch it at connect time:

```ts
async function fetchRoomToken(): Promise<{ serverUrl: string; token: string }> {
  const response = await fetch('https://your-backend.example/livekit/token', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`token endpoint returned ${response.status}`);
  }
  return response.json();
}
```

Fetch it **after** the wake word fires, not on mount. A token minted at launch
may have expired by the time someone actually speaks.

## The handoff

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioSession, LiveKitRoom, registerGlobals } from '@livekit/react-native';
import {
  initialize,
  startDetection,
  stopDetection,
  addWakeWordListener,
  prepareModels,
  getModelStatus,
  dispose,
} from 'react-native-voice-activator';

registerGlobals();

type Connection = { serverUrl: string; token: string };

export default function VoiceGate() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const busy = useRef(false);

  // Shared by every exit path: a clean disconnect, an error, and a failed
  // connect. Without it, a session that never came up leaves the app deaf with
  // detection stopped and no room running, and the user gets no signal beyond
  // the wake phrase quietly not working.
  const returnToIdle = useCallback(async () => {
    setConnection(null);
    await AudioSession.stopAudioSession();
    busy.current = false;
    await startDetection();
  }, []);

  const handleWakeWord = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;

    try {
      // Release the microphone before LiveKit claims the audio session.
      await stopDetection();
      const next = await fetchRoomToken();
      await AudioSession.startAudioSession();
      setConnection(next);
    } catch (error) {
      console.error('[handoff] could not start the room', error);
      await returnToIdle();
    }
  }, [returnToIdle]);

  useEffect(() => {
    const subscription = addWakeWordListener('wakeWordDetected', () => {
      handleWakeWord();
    });

    (async () => {
      if (!(await getModelStatus()).ready) {
        await prepareModels();
      }
      await initialize({ wakePhrase: 'hey acme' });
      await startDetection();
    })().catch(console.error);

    return () => {
      subscription.remove();
      AudioSession.stopAudioSession().catch(console.error);
      dispose().catch(console.error);
    };
  }, [handleWakeWord]);

  if (!connection) {
    return null; // idle: listening on-device, nothing on the network
  }

  return (
    <LiveKitRoom
      serverUrl={connection.serverUrl}
      token={connection.token}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={() => {
        returnToIdle().catch(console.error);
      }}
      onError={(error) => {
        console.error('[livekit]', error);
        returnToIdle().catch(console.error);
      }}
    >
      {/* Your in-call UI. The agent handles the conversation from here. */}
    </LiveKitRoom>
  );
}
```

## iOS audio routing

Inside the room, LiveKit wants to manage the iOS audio session so playback lands
on the speaker rather than the earpiece:

```tsx
import { useIOSAudioManagement } from '@livekit/react-native';
import { useRoomContext } from '@livekit/react-native';

function RoomAudio() {
  const room = useRoomContext();
  useIOSAudioManagement(room, true);
  return null;
}
```

Render it inside `LiveKitRoom`. Do not call it while detection is running: it
reconfigures the same audio session the wake-word tap is using.

## Ending the call

Disconnecting fires `onDisconnected`, which runs `returnToIdle` and starts
listening again:

```tsx
const room = useRoomContext();
await room.disconnect();
```

## What this costs

Wake-word detection is on-device and free. LiveKit bills per participant-minute
from the moment you connect, so the gate is also a cost control: the room only
exists while someone is talking to it.

## Caveats

- **Background behaviour is not covered here.** A wake phrase heard while the
  app is backgrounded needs the iOS audio background mode or an Android
  foreground service, and connecting WebRTC from the background is a separate
  problem. See [background behaviour](../background-behavior.md).
- **Detection accuracy is unmeasured.** Detection rate and false accepts per
  hour for arbitrary phrases have not been measured on physical devices, so
  `sensitivity` is untuned, and a false accept here opens a billed room. See
  [reliability validation](../reliability-validation.md).
- **Token lifetime.** Fetch at wake time, not at mount, or long-idle apps will
  connect with a stale token.
