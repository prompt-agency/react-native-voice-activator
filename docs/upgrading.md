# Upgrading

For migrating from the earlier credential-era built-in engine path to the
current Sherpa-ONNX default engine (API changes, not peer dependency version
changes), see [Migration](./migration.md) instead.

## To React Native 0.86 / Expo SDK 57

This release moves the tested baseline to React Native `0.86+` and Expo SDK
`57+`. The `react-native` peer range is still `*`; older versions are untested
rather than actively blocked.

Two optional peers changed in ways that require action.

### `react-native-fs` is now `@dr.pogodin/react-native-fs`

The original `react-native-fs` was last published in 2022 and is a legacy
bridge module. React Native 0.85 removed the interop layer that let such
modules run, so it can no longer be relied on. It is replaced by the
maintained fork, which is a real TurboModule.

```sh
yarn remove react-native-fs
yarn add @dr.pogodin/react-native-fs
npx expo prebuild --clean   # or: cd ios && pod install
```

The API is the same for everything this package uses. Note the fork has no
default export:

```ts
// before
import RNFS from 'react-native-fs';
// after
import * as RNFS from '@dr.pogodin/react-native-fs';
```

### `react-native-audio-recorder-player` now requires v4

v3 does not compile against React Native 0.86. v4 is a Nitro-based rewrite.

```sh
yarn add react-native-audio-recorder-player@^4.0.0 react-native-nitro-modules@0.31.10
```

`react-native-nitro-modules` must satisfy the peer range
`>=0.31.3 <0.32.0`. Pin it to `0.31.10` specifically: v4.5.0 of the recorder
ships pre-generated Nitrogen output built against an older Nitro, and newer
Nitro releases (0.32 and above, including 0.37.1) fail to compile it. The
peer range is not arbitrary: it is the compatibility window that this
pre-generated output actually works with, and it will move only when the
recorder package regenerates its Nitro bindings against a newer Nitro core.

If you construct the recorder yourself, note v4's default export is a
singleton instance rather than a class, and `AVEncodingOption` is now a
string-literal type that no longer includes `wav`.

### `RUNANYWHERE_ONNX_COMPAT` unset now means "auto", not "vendor ours"

This is a behaviour change with no source change on your side, so it is easy
to miss: the same app, built from the same commit, can now get a different
binary.

Before this release, the iOS podspec always vendored our
`sherpa-onnxruntime.xcframework` (ONNX Runtime 1.17.1) unless you explicitly
set `RUNANYWHERE_ONNX_COMPAT=1`. An unset variable meant "vendor ours".

As of this release, an unset variable means "decide automatically". At
`pod install` time the podspec inspects the resolved Podfile and skips
vendoring our runtime when the target that links `VoiceActivator` already
links an ONNX Runtime pod (`onnxruntime-react-native` and friends). That is
what fixes the `The requested API version [30] is not available` SIGSEGV that
the old default reintroduced on every `pod install`, including the one
`expo prebuild` runs for you.

What this means for you:

- **You never set the variable and your app has no other ONNX Runtime.** No
  change: ours is still vendored.
- **You never set the variable and your app does link `onnxruntime-react-native`.**
  Ours is now dropped. This is the fix; the old behaviour was the crash.
- **You set `RUNANYWHERE_ONNX_COMPAT=1` to work around the old default.** You
  can drop it. Keeping it is harmless: it still forces the skip.
- **You depend on our runtime always being vendored.** Set
  `RUNANYWHERE_ONNX_COMPAT=0` explicitly rather than relying on the old
  default.

The decision is printed on every `pod install`, and when detection cannot tell,
it vendors ours and says so. Details, including how to verify which way the
link went, are in
[iOS ONNX Runtime conflict resolution](./ios-onnx-conflict-resolution.md).

### iOS recording container: unverified on device

`WhisperRNSTTAdapter`'s iOS recording path currently configures
`AVFormatIDKeyIOS` as `'lpcm'`. That value is marked provisional in the
adapter source pending an on-device measurement that has not yet been run.
This upgrade did not confirm the iOS whisper recording path end to end on a
physical device; it is unverified, not known to be broken. If you rely on
`WhisperRNSTTAdapter` for iOS recording, test your own recording and
transcription path after upgrading rather than assuming it carried over
unchanged.

### Toolchain

- Node.js `20.19.4+`, `22.13+`, `24.3+`, or `25+` (React Native 0.86's
  `engines` field is `^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0`; Node
  21.x and 23.x are not supported).
- JDK 17 or 21 for Android builds. JDK 25 fails CMake configuration.
