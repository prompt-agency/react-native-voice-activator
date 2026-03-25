# iOS ONNX Runtime Conflict Resolution

## Default (wake word only)

This package bundles `sherpa-onnxruntime.xcframework` (ONNX Runtime 1.17.1,
static library) for the Sherpa-ONNX wake-word engine. **If your app does not
link another ONNX Runtime copy**, use the default podspec path: both
`sherpa-onnx.xcframework` and `sherpa-onnxruntime.xcframework` are vendored.
No Podfile flags are required.

**Android is not affected** for the same class of issue: native libraries load
in per-process namespaces, so separate `.so` files do not produce the iOS-style
linker duplicate-symbol failure mode.

## When two ONNX Runtimes collide

If a second dependency also bundles an ONNX Runtime xcframework (same symbol
names, e.g. `_OrtGetApiBase`), the iOS linker can emit duplicate symbol warnings
and runtime initialization for one backend may fail (historically seen as ONNX
provider registration errors such as -401).

Typical situations to validate after `pod install` / `xcodebuild`:

- optional `onnxruntime-react-native` for `CustomTTSAdapter` (Piper ONNX)
- any other native module that vendors `onnxruntime.xcframework`

## Escape hatch: `RUNANYWHERE_ONNX_COMPAT=1`

The podspec still honors `ENV['RUNANYWHERE_ONNX_COMPAT'] == '1'` at **pod
install** time (name retained for existing Podfiles). When set:

- `sherpa-onnx.xcframework` is still vendored
- `sherpa-onnxruntime.xcframework` is **not** vendored
- `sherpa-onnx.a` must resolve ONNX symbols from the **other** ORT you link

This only works when both builds are compatible at the ABI level with what
Sherpa was compiled against. This package’s bundled Sherpa stack targets **ORT
1.17.1 / `ORT_API_VERSION` 17**.

### Podfile snippet

```ruby
target 'YourApp' do
  # Only when you link a second, compatible ORT and need a single symbol space.
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

After rebuilding, confirm duplicate ONNX symbols are gone (adjust paths/scheme
for your app):

```sh
xcodebuild -workspace ios/YourApp.xcworkspace \
  -scheme YourApp \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  build 2>&1 | grep -i "duplicate symbol" | wc -l
# Expected: 0
```

## Maintenance

- **Do not set** `RUNANYWHERE_ONNX_COMPAT=1` unless you are deliberately sharing
  one ORT across Sherpa and another pod; the default is Sherpa’s bundled ORT.
- If the other ORT upgrades to a different `ORT_API_VERSION` than Sherpa’s
  1.17.1 build, runtime crashes are possible — re-run the duplicate-symbol
  check and treat version skew as a release blocker.
- The flag is read at `pod install` time by the podspec; it does not affect
  JavaScript, TypeScript, or Android builds.

## onnxruntime-react-native (Custom TTS)

`onnxruntime-react-native` ≥ 1.20.x typically ships a newer ORT API generation
than Sherpa’s bundled 1.17.1. **Linking both into one binary without careful
planning is risky.** Prefer validating with a real `pod install` and the
duplicate-symbol check above. If versions are incompatible, keep Sherpa’s
bundled `sherpa-onnxruntime.xcframework` and avoid a second ORT in the same
process, or pursue a dedicated upgrade task for Sherpa/ORT alignment.
