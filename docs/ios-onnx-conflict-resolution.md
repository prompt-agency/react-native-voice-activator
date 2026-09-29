# iOS ONNX Runtime Conflict Resolution

## Short version

This package bundles `sherpa-onnxruntime.xcframework` (ONNX Runtime 1.17.1,
`ORT_API_VERSION` 17) for the Sherpa-ONNX wake-word engine. If your app also
links an ONNX Runtime of its own, the two cannot coexist, and the podspec now
resolves that for you at `pod install` time:

- **Your app already links an ONNX Runtime** (it depends on
  `onnxruntime-react-native`): the bundled `sherpa-onnxruntime.xcframework` is
  **not** vendored. Sherpa binds to your runtime.
- **Nothing else provides an ONNX Runtime**: the bundled framework **is**
  vendored, exactly as before.

No Podfile flags are required in either case. The decision is printed during
`pod install`, for example:

```
[VoiceActivator] Skipping bundled sherpa-onnxruntime.xcframework (sherpa-onnx
will link the app's ONNX Runtime): detected onnxruntime-react-native via node
resolution at /path/to/app/node_modules/onnxruntime-react-native. Override with
RUNANYWHERE_ONNX_COMPAT=0.
```

or

```
[VoiceActivator] Vendoring bundled sherpa-onnxruntime.xcframework (ORT 1.17.1):
no onnxruntime-react-native found from /path/to/app/ios. Override with
RUNANYWHERE_ONNX_COMPAT=1.
```

If you hit an ORT symbol error or an ORT crash, read that line first: it tells
you which way the link went.

**Android is not affected** for the same class of issue: native libraries load
in per-process namespaces, so separate `.so` files do not produce the iOS-style
linker duplicate-symbol failure mode.

## Why only one ONNX Runtime can win

Both xcframeworks export the same C symbols (`_OrtGetApiBase` and friends).
When both are linked into one binary they share a single symbol namespace and
one of them wins for the whole process.

The direction matters, because ORT is backward compatible but not forward
compatible:

- **A newer ORT wins.** Sherpa asks for API version 17 and gets it. Everything
  works. This is the case the automatic exclusion produces.
- **Sherpa's 1.17.1 wins.** A newer caller, for example
  `onnxruntime-react-native` 1.24.x resolving to the `onnxruntime-c` 1.30 pod,
  asks for its own API version and gets

  ```
  The requested API version [30] is not available, only API versions [1, 17]
  are supported in this build. Current ORT Version is: 1.17.1
  ```

  followed by a **SIGSEGV**. Reproduced on a physical device.

So the resolution is always "keep the newest runtime in the binary", which in
practice means dropping ours whenever the app brings its own.

## How detection works

At `pod install` time the podspec asks Node to resolve
`onnxruntime-react-native/package.json`, anchored at the app project
(CocoaPods' installation root and its parent) and then at the package
directory. Node's own resolver is used because it is the only thing that gets
npm/yarn hoisting, Yarn workspaces, pnpm's symlinked store and `link:` /
`portal:` dependencies all correct.

Fallbacks, in order:

1. Node resolution from the anchors above.
2. If Node is unavailable or resolution throws, a plain walk up from the same
   anchors looking for `node_modules/onnxruntime-react-native`.
3. If neither finds anything, the bundled runtime **is** vendored. That is the
   historical default and the one that cannot produce an unlinkable build; a
   wake-word-only app always links.

Detection never raises: a missing Node, a failed spawn or an unreadable
directory all degrade to the next step.

### Known limits of detection

- It keys on `onnxruntime-react-native` specifically. Another pod that vendors
  its own `onnxruntime.xcframework` under a different package name is not
  detected. Use `RUNANYWHERE_ONNX_COMPAT=1` for that case.
- It keys on the dependency being installed, not on the pod actually being
  linked into your target. If `onnxruntime-react-native` is present in
  `node_modules` but excluded from your Podfile, force the bundled runtime back
  in with `RUNANYWHERE_ONNX_COMPAT=0`.

## Overrides: `RUNANYWHERE_ONNX_COMPAT`

The env var is now an override, not the primary mechanism. It is read at
`pod install` time and works in both directions:

| Value | Effect |
| --- | --- |
| `1` | Always exclude the bundled `sherpa-onnxruntime.xcframework`, even if no other ORT was detected. |
| `0` | Always vendor the bundled `sherpa-onnxruntime.xcframework`, even if another ORT was detected. |
| unset, or anything else | Use the detection result. |

Note that `expo prebuild` runs `pod install` itself, so an override you set
only in your shell for a manual `pod install` will not survive a prebuild. Set
it in the Podfile if you need it to stick:

```ruby
target 'YourApp' do
  # Only when detection gets it wrong; see "Known limits of detection".
  ENV['RUNANYWHERE_ONNX_COMPAT'] = '1'

  use_expo_modules!  # or use_native_modules! for bare React Native
  # ...
end
```

Then:

```sh
cd ios && pod install
```

## Verification

After `pod install`, check which way it went:

```sh
grep -c sherpa-onnxruntime ios/Podfile.lock
# 0 when the bundled runtime was excluded, non-zero when it was vendored.
```

After rebuilding, confirm there are no duplicate ONNX symbols (adjust
paths/scheme for your app):

```sh
xcodebuild -workspace ios/YourApp.xcworkspace \
  -scheme YourApp \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  build 2>&1 | grep -i "duplicate symbol" | wc -l
# Expected: 0
```

If you forced `RUNANYWHERE_ONNX_COMPAT=1` in an app that has no other ONNX
Runtime, the failure shows up as undefined symbols at link time (`_OrtGetApiBase`
and similar). Unset the override.

## onnxruntime-react-native (Custom TTS)

`onnxruntime-react-native` ships a newer ORT API generation than Sherpa's
bundled 1.17.1, and in this repo's example it resolves to the `onnxruntime-c`
1.30 pod. That combination is exactly what detection is for: the bundled
runtime is dropped automatically, Sherpa binds to ORT 1.30, and backward
compatibility covers its API 17 request.

### Header shadowing is fixed as of this release

Earlier releases of this package globbed `ios/**/*.h` in the podspec's
`source_files` and `private_header_files`, which swept the vendored ORT 1.17
headers under `ios/Vendor` into `Pods/Headers/Private/VoiceActivator/`. The
`onnxruntime-react-native` target could then pick up that older
`onnxruntime_cxx_api.h` instead of the `onnxruntime-c` pod's own headers,
producing compile errors such as "no member named
`AddExternalInitializersFromFilesInMemory`" on `SessionOptions`.

As of this release, the podspec enumerates its own source directories
(`ios/*`, `ios/Runtime/**`, `ios/Engines/**`) instead of globbing `ios/**`, so
the vendored `ios/Vendor` headers are no longer swept into
`Pods/Headers/Private/VoiceActivator/` and no longer shadow the
`onnxruntime-c` pod's headers. `scripts/verify-podspec-source-globs.mjs` runs
as part of `yarn verify:contracts` to keep it that way. Consumers integrating
`onnxruntime-react-native` alongside this package should no longer need the
`HEADER_SEARCH_PATHS` / `USE_HEADERMAP` Podfile workaround this section
previously documented.

#### If you are on an older release

If you cannot yet upgrade to this release and still see
`onnxruntime_cxx_api.h` resolving to Sherpa's bundled copy (compile errors
such as "no member named `AddExternalInitializersFromFilesInMemory` in
`Ort::SessionOptions`"), add this to your `post_install` block:

```ruby
installer.pods_project.targets.each do |target|
  next unless target.name == 'onnxruntime-react-native'

  target.build_configurations.each do |config|
    # $(inherited) MUST be kept: dropping it loses the pod's own xcconfig
    # paths (React-jsi, ReactCommon, ...) and breaks `jsi/jsi.h` not found.
    config.build_settings['HEADER_SEARCH_PATHS'] = [
      "\"${PODS_ROOT}/onnxruntime-c/Headers\"",
      '$(inherited)',
    ]
    # Required as well: CocoaPods' header map would otherwise still
    # resolve onnxruntime_cxx_api.h back to Sherpa's copy.
    config.build_settings['USE_HEADERMAP'] = 'NO'
  end
end
```

Older releases also do not detect anything automatically: there,
`RUNANYWHERE_ONNX_COMPAT=1` is the only way to exclude the bundled runtime, and
it must be set for every `pod install`, including the one `expo prebuild` runs.
Upgrading to this release removes the need for both.

## Maintenance

- The detection and the flag are read at `pod install` time by the podspec;
  neither affects JavaScript, TypeScript, or Android builds.
- If Sherpa's bundled ORT is upgraded, re-check the direction argument above:
  the mechanism relies on the app's runtime being newer than or equal to
  Sherpa's, never older.
- Treat a printed decision that disagrees with the app's actual dependency set
  as a release blocker, and re-run the duplicate-symbol check.
