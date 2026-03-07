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

## Android

Android background behavior is still under active implementation. Do not assume parity with the current iOS background model.

## Developer Guidance

- treat `getStatus()` and runtime events as the source of truth for supported versus unsupported behavior
- keep user-facing messaging explicit about force-quit and relaunch limitations
- do not market this package as “always on like Siri”
