# Background Behavior

`react-native-voice-activator` does not claim always-on voice behavior. Background support is platform-constrained and must be interpreted narrowly.

## iOS

Supported today:

- detection can continue after explicit activation when the host app enters the background and the app declares `UIBackgroundModes` with `audio`
- the public runtime remains `running` while background continuation is still valid
- if background continuation is active, `getStatus()` keeps `isListening: true`

Not supported:

- force-quit continuation
- cold relaunch continuation
- pretending background wake word detection survives app termination

Explicit unsupported behavior:

- if the app enters the background without the required iOS audio background mode, the runtime transitions to `unsupported`
- the runtime surfaces a normalized `platform` error with code `background_audio_mode_required`
- the engine-backed detector is torn down so the package does not report `unsupported` while detection is still running internally

Foreground return:

- when the app returns to the foreground from a supported background audio state, the runtime remains `running`
- the package emits a visible runtime update so event-driven consumers do not need to poll `getStatus()` to notice the transition
- supported iOS audio-session interruptions transition the runtime to `interrupted` and, when resumable, back to `running` without requiring undocumented manual re-arming
- non-resumable iOS interruptions surface explicit `unsupported` or `error` outcomes instead of pretending detection continued
- supported iOS audio-route changes emit `audioRouteChanged` events so apps can react to route movement without polling

## Android

Supported today:

- detection can continue after explicit activation when it is started from a visible Android activity context
- the runtime remains `running` while the foreground-service notification is active
- if Android foreground-service continuation is active, `getStatus()` keeps `isListening: true`

Not supported:

- starting detection from a hidden or background-only app context
- implying Android background behavior is exempt from OEM battery management or device policy differences
- claiming parity with the current iOS audio-background model

Explicit unsupported behavior:

- if detection is started without a visible activity context, the runtime transitions to `unsupported`
- the runtime surfaces a normalized `platform` error with code `foreground_service_visible_context_required`
- the runtime tears down service ownership and engine activity so the package does not report `unsupported` while the detector is still running internally

Permission and notification requirements:

- Android background continuation requires `RECORD_AUDIO`
- the package also requires foreground-service permissions and an active foreground-service notification while detection is running
- if microphone permission is missing, the runtime surfaces a normalized `permission` error instead of pretending background continuation is available
- supported Android audio-device topology changes emit `audioRouteChanged` events through the shared JS contract
- interruption and service/runtime recovery still require device validation before the package should claim production-proven Android resilience

## Developer Guidance

- treat `getStatus()` and runtime events as the source of truth for supported versus unsupported behavior
- keep user-facing messaging explicit about force-quit and relaunch limitations
- keep docs and app copy explicit that the built-in Sherpa engine is still
  constrained by the same platform lifecycle limits
- do not market this package as “always on like Siri”
