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

## Troubleshoot the Provider Pattern Separately

You supply the STT and TTS provider implementations; the package calls them. So
a failure is either in the package's wake-word runtime, in the orchestration
between the providers, or inside a provider implementation. Split it this way:

- if `wakeWordDetected` never fires, debug the package-owned wake-word runtime
- if `wakeWordDetected` fires but no transcript appears, the package called
  `sttProvider.transcribe()` and it failed or hung — check for a
  `transcriptionError` event
- if transcription succeeds but nothing is spoken, check `autoSpeak` (it
  defaults to `false` in the single-shot flow) and then `speechError`

The example app wires the real `WhisperRNSTTAdapter` and `SherpaOnnxTTSAdapter`
(see `example/src/providers.ts`), not stubs — but a green example run is still
not proof that a given vendor SDK works in your app's build. Reference adapters
live in `docs/examples/`.

## Nothing Happens At All (Hangs)

A provider call that never settles used to wedge the package. Both paths are now
bounded, and a hang surfaces as a distinct error code rather than silence:

| Symptom | Code | Bound | Default |
|---|---|---|---|
| Transcription never returns | `stt_timeout` | `providerTimeoutMs` | 30s |
| AI handler never returns (session only) | `ai_handler_timeout` | `aiHandlerTimeoutMs` | 60s |
| Speech never finishes | `tts_timeout` | `providerTimeoutMs` | 30s |

`providerTimeoutMs` goes on `initialize()` for the single-shot flow and on
`session` for a managed session; `aiHandlerTimeoutMs` is session-only. Set
either to `0` to disable the bound.

Note that `silenceTimeoutMs` does **not** cover these. It only arms during the
listening stage and is cleared as soon as STT resolves, so it guards a user who
never speaks, not a provider that never returns.

If you see these codes with a provider you believe is healthy, raise the bound
before assuming a bug: on-device transcription of a long utterance on an older
device legitimately takes seconds.

## `models_not_prepared`

`initialize()` rejects with this when the on-demand model bundle is absent or
fails verification. It is a `configuration` error and **not recoverable**:
retrying `initialize()` with the same options cannot succeed.

```typescript
const status = await getModelStatus();
// status.missing lists the manifest-relative paths that are absent or corrupt
if (!status.ready) await prepareModels();
```

Common causes:

- `prepareModels()` was never called
- the device was offline the first time it ran, so the download never completed
- the app was reinstalled, or iOS reclaimed the storage — call `prepareModels()`
  again, it re-fetches only what is missing
- `react-native-fs` is not installed; it is required for the download. Either
  install it, or ship the models in your app and pass
  `engineConfig.assetKeys.modelAssetKey`

## A custom `wakePhrase` never fires

Nothing errors — the keyword simply never matches. Work through these:

- **Say it the way it is spelled.** The phrase is tokenized from text, so "hey
  acme" matches someone saying "hey ack-me", not "hey A-C-M-E".
- **Is it distinctive enough?** Two or more words, at least 6 letters. A short or
  common phrase either misses or fires constantly.
- **Raise `engineConfig.sensitivity`.** The default is `0.5`. Higher detects more
  and false-fires more; find the operating point in your own acoustic conditions.
- **Check the generated file.** `getModelStatus().directory` plus
  `generated-keywords/` is where it lives. It should be plain uppercase text, one
  phrase per line, with no `▁` characters. A `▁` means a pre-tokenized file is
  being used with the raw-text path, which cannot match.
- **Confirm the models are the on-demand bundle.** `wakePhrase` needs `bpe.model`,
  which the bundle carries. It is rejected outright with an app-bundled model root.

Detection rates for arbitrary phrases are not yet measured on physical devices —
see [Reliability Validation](/reliability-validation). Measure before shipping.

## Is This Error Worth Retrying?

Every error carries `recoverable`. It answers one question: will the same call
with the same options possibly succeed?

| `recoverable` | Meaning | Examples |
|---|---|---|
| `true` | Retry may work | `stt_timeout`, `tts_timeout`, `stt_transcribe_failed`, most `permission` and `lifecycle` errors |
| `false` | Retry cannot work — change something first | any `configuration` error (including `models_not_prepared`), and `runtime_unavailable` |

`runtime_unavailable` (category `platform`) means the native module is absent
from the build. No amount of retrying helps; rebuild with `pod install` or
`expo prebuild`. A `configuration` error means an asset path, keyword file or
bundle is wrong — fix the options and call `initialize()` again.

## Common Failure Classes

- `permission`
  - microphone permission is missing, denied, or revoked
- `lifecycle`
  - runtime start/stop/dispose or interruption-recovery failures
- `configuration`
  - invalid engine, built-in provider, or setup configuration
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
- remember that the built-in Sherpa path is credential-free by default
- if you are supplying custom engine assets, validate those paths and keys before runtime start

### `engine`

Typical causes:

- built-in native-managed engine initialization failure
- engine start/stop failure
- engine restart failure after interruption recovery

What to do:

- inspect `lastError.code` and `lastError.message`
- confirm whether you are using the bundled native Sherpa assets or intentional
  custom `engineConfig.assetKeys.modelAssetKey` /
  `engineConfig.assetKeys.keywordAssetKey` overrides
- if you use optional STT/TTS adapters (e.g. Whisper or Custom TTS), verify
  local model paths, native peer installs, and prebuild/pod install first
- verify your engine-specific configuration is valid
- verify the runtime did not transition to `unsupported` because of a platform condition before assuming the engine itself is broken

### `platform`

Typical causes:

- the native module is missing from the build (`runtime_unavailable`, not
  recoverable — rebuild, do not retry)
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

## Android Build Issues

### `onnxruntime-react-native` build failure on Android (fbjni conflict)

If you use `onnxruntime-react-native` alongside this package and see a build error like `Could not resolve com.facebook.fbjni:fbjni`, it is caused by a legacy fbjni dependency block in `onnxruntime-react-native`'s `build.gradle` that targets React Native < 0.71.

**Fix:** Apply a patch using [patch-package](https://github.com/ds300/patch-package):

1. Install patch-package: `yarn add --dev patch-package`
2. Add to `package.json` scripts: `"postinstall": "patch-package"`
3. Create the patch at `patches/onnxruntime-react-native+<version>.patch` with this content:

```diff
--- a/node_modules/onnxruntime-react-native/android/build.gradle
+++ b/node_modules/onnxruntime-react-native/android/build.gradle
@@ ... @@
-  if (VersionNumber.parse(REACT_NATIVE_VERSION) < VersionNumber.parse("0.71")) {
-    extractLibs "com.facebook.fbjni:fbjni:+:headers"
-    extractLibs "com.facebook.fbjni:fbjni:+"
-  }
```

The version block is unreachable on React Native 0.71+ and the fbjni dependency is already provided by React Native itself.

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
