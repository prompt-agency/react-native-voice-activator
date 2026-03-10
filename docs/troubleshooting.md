# Troubleshooting

This package surfaces structured runtime failures through the public event and
status contract.

## Check Runtime Status First

Use `getStatus()` to inspect:

- current runtime state
- whether the runtime is actively listening
- whether the package can start again
- the latest structured error

Use `addWakeWordListener('stateChanged', ...)` and
`addWakeWordListener('error', ...)` if you need event-driven visibility instead
of polling `getStatus()`.

The example app now exposes the same diagnostics surface for evaluation:

- current runtime status
- latest structured error
- recent runtime events
- normalized error categories for quick failure triage

The example app also contains optional STT/TTS extension-point examples. Those
examples are downstream application integrations only. If they fail, debug the
app-level handoff code separately from the package runtime itself.

## Common Failure Classes

- `permission`
  - microphone permission is missing, denied, or revoked
- `lifecycle`
  - runtime start/stop/dispose or interruption-recovery failures
- `configuration`
  - invalid engine or setup configuration
- `engine`
  - built-in engine initialization or runtime failures
- `platform`
  - unsupported background state, invalid visible-context start, or other
    platform-policy restrictions
- `internal`
  - unexpected package/runtime failure

## Troubleshooting by Error Category

### `permission`

Typical causes:

- iOS microphone permission not granted
- Android `RECORD_AUDIO` permission missing or revoked
- Expo or bare app never requested permission before starting detection

What to do:

- confirm your app requests microphone permission before `startDetection()`
- on iOS, verify `NSMicrophoneUsageDescription` is present
- on Android, verify microphone permission is granted before runtime start
- re-check `getStatus().lastError` after the permission prompt completes

### `lifecycle`

Typical causes:

- calling lifecycle methods in an invalid order
- interruption recovery fails
- stop/dispose fails to tear the runtime down cleanly

What to do:

- call `initialize()` before `startDetection()`
- use `stateChanged` events and `getStatus()` instead of assuming the runtime resumed
- if the runtime reaches `interrupted`, wait for an explicit transition back to `running`
- if the runtime reaches `unsupported` or `error`, treat that as authoritative and do not keep issuing start/stop blindly

### `configuration`

Typical causes:

- invalid engine options
- invalid keyword or model asset configuration
- unsupported config shape for the selected engine

What to do:

- use the documented `initialize()` shape only
- keep engine configuration engine-neutral at the public API layer
- if you are supplying custom engine assets, validate those paths and keys before runtime start

### `engine`

Typical causes:

- built-in Porcupine adapter initialization failure
- engine start/stop failure
- engine restart failure after interruption recovery

What to do:

- inspect `lastError.code` and `lastError.message`
- verify your engine-specific configuration is valid
- verify the runtime did not transition to `unsupported` because of a platform condition before assuming the engine itself is broken

### `platform`

Typical causes:

- iOS app backgrounded without `UIBackgroundModes: ["audio"]`
- Android detection started without a visible activity context
- Android foreground-service ownership could not be established or maintained
- platform policy blocks continuation

What to do:

- on iOS, verify the app declares the audio background mode
- on Android, start detection only from a visible app context
- verify Android notification/foreground-service requirements are satisfied
- use the documented platform limitation as truth instead of retrying unsupported behavior

### `internal`

Typical causes:

- unexpected package/runtime failure not mapped to a narrower category

What to do:

- capture `lastError`
- inspect the current `getStatus()` snapshot
- reduce the flow to a minimal reproduction using the example app and the same lifecycle sequence
- treat recurring internal failures as implementation bugs, not integration guidance problems

## Platform Notes

- iOS:
  - background continuation requires `UIBackgroundModes` to include `audio`
  - force-quit continuation is unsupported
  - supported background continuation still depends on the app remaining alive
- Android:
  - background continuation requires a visible activity context for start
  - foreground-service ownership and notification state must remain valid
  - OEM battery management can still constrain behavior outside the package contract

## Bare React Native vs Expo

- bare React Native is the primary runtime validation path today
- Expo support currently proves config resolution and prebuild generation, not a full Expo runtime session in CI
- Expo Go is unsupported
- Expo consumers still use the same public lifecycle API and error categories as bare React Native consumers

## Related Docs

- Bare React Native setup: [`./bare-react-native-setup.md`](./bare-react-native-setup.md)
- Expo setup: [`./expo-setup.md`](./expo-setup.md)
- Background behavior: [`./background-behavior.md`](./background-behavior.md)
- Getting started: [`./getting-started.md`](./getting-started.md)
