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
[VoiceActivator] Skipping bundled sherpa-onnxruntime.xcframework (sherpa-onnx will link the app's ONNX Runtime): resolved Podfile dependencies: target(s) YourApp link VoiceActivator together with onnxruntime-react-native.
[VoiceActivator] If this build later fails with "Undefined symbols: _OrtGetApiBase", then onnxruntime-react-native is installed but its pod is not linked into this target. Set RUNANYWHERE_ONNX_COMPAT=0 to vendor our ONNX Runtime (1.17.1) instead.
[VoiceActivator] The same link also needs _OrtSessionOptionsAppendExecutionProvider_CoreML, so your ONNX Runtime must include the CoreML execution provider. The onnxruntime-c pod does; a custom or minimal ORT build may not.
```

or

```
[VoiceActivator] Vendoring bundled sherpa-onnxruntime.xcframework (ORT 1.17.1): resolved Podfile dependencies: target(s) YourApp link VoiceActivator and no ONNX Runtime pod. Override with RUNANYWHERE_ONNX_COMPAT=1.
```

If you hit an ORT symbol error or an ORT crash, read those lines first: they
tell you which way the link went, and the skip case names the symbol you are
most likely to be searching for.

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

Detection asks whether an ONNX Runtime pod is **linked into the target that
links this pod**, not merely whether a package sits in `node_modules`. Those
are different questions, and the difference is the whole point: a package can
be installed with its pod nowhere near your target.

### Signal 1: the resolved Podfile (the one that decides in practice)

By the time CocoaPods evaluates a podspec, your Podfile has already run,
React Native / Expo autolinking (`use_native_modules!`) included. The podspec
reads the Podfile CocoaPods already loaded (`Pod::Config`'s memoised
`podfile`; verified against CocoaPods 1.16.2 via
`Pod::Podfile#target_definitions` and, per definition, `#dependencies`,
`#abstract?` and `#name`) and looks at each concrete target definition:

- Targets that depend on `VoiceActivator`, and
- Targets that depend on an ONNX Runtime pod: `onnxruntime-react-native`,
  `onnxruntime-c`, `onnxruntime-objc`, `onnxruntime-mobile-c`,
  `onnxruntime-mobile-objc`, `onnxruntime-training-c`,
  `onnxruntime-training-objc`.

The outcome is one of:

| Situation | Outcome |
| --- | --- |
| Every target linking `VoiceActivator` also links an ORT pod | **Confident: another ORT.** Ours is skipped. |
| No target linking `VoiceActivator` links an ORT pod | **Confident: no other ORT.** Ours is vendored. |
| No target names `VoiceActivator` at all, but some target links an ORT pod | **Confident: another ORT** (we are a transitive dependency of one of them). Ours is skipped. |
| Some targets linking `VoiceActivator` have an ORT pod and some do not | **Uncertain.** Ours is vendored, with a warning: vendoring is a per-pod decision and cannot differ per target. |

Only the Podfile CocoaPods has already loaded is read; the podspec never
triggers a Podfile evaluation of its own, because a podspec is evaluated with
the working directory pointed at the package, and autolinking run from there
would either fail or do real work in the wrong place.

### Signals 2 and 3: is the package installed at all?

These are used only when the resolved Podfile is not available (outside
`pod install`, or an unfamiliar CocoaPods object graph):

2. Node is asked to resolve `onnxruntime-react-native/package.json`, anchored at
   CocoaPods' installation root, its parent, and this package's own directory.
   Node's resolver is used because it is the only thing that gets npm/yarn
   hoisting, Yarn workspaces, pnpm's symlinked store and `link:` / `portal:`
   dependencies all correct.
3. If Node cannot be run, a plain walk up from the same anchors looking for
   `node_modules/onnxruntime-react-native`.

A **negative** answer here is conclusive: if the package is not installed
anywhere, no pod can link it, so the bundled runtime is vendored. A
**positive** answer is not conclusive, because it says nothing about linking,
so it is classified **uncertain**.

Detection never raises: a missing Node, a failed spawn or an unreadable
directory all degrade to the next step.

### What "uncertain" does

Uncertain vendors the bundled runtime and prints a warning naming both
overrides. That direction is deliberate: skipping ours breaks the link
outright whenever nothing else provides a runtime, while vendoring ours only
misbehaves when something does. Set `RUNANYWHERE_ONNX_COMPAT=1` if your app
already links its own ONNX Runtime, or `RUNANYWHERE_ONNX_COMPAT=0` to pin the
uncertain-case behaviour explicitly.

### Known limits of detection

- It keys on the ONNX Runtime pod names listed above. Another pod that vendors
  its own `onnxruntime.xcframework` under a different name, or that pulls in
  an ORT through its own podspec rather than through your Podfile, is not
  visible here. Use `RUNANYWHERE_ONNX_COMPAT=1` for that case.
- Vendoring is a per-pod decision, so an app whose targets disagree about
  ONNX Runtime cannot be satisfied automatically. That is the "uncertain"
  row above; pick a direction with the env var.

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
grep -c sherpa-onnxruntime ios/Pods/Pods.xcodeproj/project.pbxproj
# 0 when the bundled runtime was excluded, non-zero when it was vendored.
```

Do not use `Podfile.lock` for this. `vendored_frameworks` is not recorded
there, so `grep sherpa-onnxruntime ios/Podfile.lock` is 0 either way and tells
you nothing. The generated Pods project is where the framework reference
actually appears.

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
