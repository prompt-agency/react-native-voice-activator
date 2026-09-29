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
