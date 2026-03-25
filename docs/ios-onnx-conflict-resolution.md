# iOS ONNX Runtime Conflict Resolution

## Problem

This package bundles `sherpa-onnxruntime.xcframework` (ONNX Runtime 1.17.1, static library) for the Sherpa-ONNX wake-word engine. The `@runanywhere/onnx` package also bundles `onnxruntime.xcframework` (ONNX Runtime 1.17.1, dynamic framework) for its STT/TTS models.

When both are linked into the same iOS app binary:
- The iOS linker produces hundreds of duplicate symbol warnings for ONNX Runtime and protobuf symbols
- RunAnywhere's `ONNXProvider.register()` fails with error -401 at runtime
- `builtInSTT` / `builtInTTS` are non-functional

**Android is not affected.** Android loads native libraries in per-process namespaces, so symbol collisions between separate `.so` files do not occur.

## Resolution

The bundled `sherpa-onnxruntime.xcframework` can be excluded at `pod install` time via the `RUNANYWHERE_ONNX_COMPAT=1` environment variable. When this flag is set:

- `sherpa-onnx.xcframework` is vendored (the Sherpa C API library, unchanged)
- `sherpa-onnxruntime.xcframework` is **not** vendored
- `sherpa-onnx.a`'s undefined ONNX Runtime symbols resolve against RunAnywhere's `onnxruntime.xcframework` (dynamic) at link time

This works because both ORT builds are identical versions:
- Sherpa bundled: ORT 1.17.1 / `ORT_API_VERSION 17`
- RunAnywhere: ORT 1.17.1 / `ORT_API_VERSION 17`

Both export the same required symbols: `_OrtGetApiBase`, `_OrtSessionOptionsAppendExecutionProvider_CoreML`, `_OrtSessionOptionsAppendExecutionProvider_CPU`, etc.

## Setup

In your `ios/Podfile`, add the env flag inside the `target` block **before** `use_expo_modules!` / `use_native_modules!`:

```ruby
target 'YourApp' do
  # Required when using @runanywhere/onnx for builtInSTT / builtInTTS.
  # Excludes sherpa-onnxruntime.xcframework so the wake-word engine shares
  # RunAnywhere's ONNX Runtime instead — no duplicate symbols, no error -401.
  ENV['RUNANYWHERE_ONNX_COMPAT'] = '1'

  use_expo_modules!  # or use_native_modules! for bare React Native
  # ...
end
```

Then run:

```sh
cd ios && pod install
```

## Verification

After rebuilding, confirm zero ONNX duplicate symbol warnings:

```sh
xcodebuild -workspace ios/YourApp.xcworkspace \
  -scheme YourApp \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  build 2>&1 | grep -i "duplicate symbol" | wc -l
# Expected: 0
```

At runtime, RunAnywhere's ONNX backend registration succeeds (no error -401 in logs), and `builtInSTT` / `builtInTTS` initialize normally.

## Maintenance Notes

- **If RunAnywhere upgrades its ORT version**, check that the new version remains API-compatible with sherpa-onnx (`ORT_API_VERSION` must match). Run the duplicate-symbol check again after `pod install`.
- **If you do not use RunAnywhere** (`builtInSTT: false`, `builtInTTS: false`), do not set `RUNANYWHERE_ONNX_COMPAT=1` — the flag is only needed when both are linked.
- The flag is evaluated at `pod install` time by the podspec Ruby evaluator; it does not affect JavaScript, TypeScript, or Android builds.

## Transition: onnxruntime-react-native (Epic 11)

Story 11-1 adds `onnxruntime-react-native` as an optional peer dependency for the `TTSInferenceEngine` (ONNX-based neural TTS). When RunAnywhere is removed (Story 11-5), the conflict resolution approach must be re-evaluated:

**What to check before pod install (Story 11-5):**

```bash
# Inspect onnxruntime-react-native's bundled ORT version
cat node_modules/onnxruntime-react-native/onnxruntime-react-native.podspec | grep -i ort
# Check the ORT API version (look for ORT_API_VERSION or the xcframework bundle)
```

**Likely outcome:** `onnxruntime-react-native` >= 1.20.0 uses ORT API version 20, while Sherpa-ONNX bundles ORT 1.17.1 (API version 17). Despite both exporting `_OrtGetApiBase`, the duplicate symbol conflict at the **linker** level is version-independent (both define the same symbol name).

**Resolution strategy for Story 11-5:**

Replace `RUNANYWHERE_ONNX_COMPAT=1` with an equivalent `ORTS_COMPAT=1` env var in the podspec that excludes `sherpa-onnxruntime.xcframework`, letting sherpa-onnx resolve against `onnxruntime-react-native`'s dynamic framework.

**Runtime compatibility caveat:** This only works correctly if the ORT API version used by `onnxruntime-react-native` is ABI-compatible with the version Sherpa was compiled against. If API versions differ (e.g., ORT 1.17 vs 1.20), sherpa-onnx may crash at runtime when calling ORT APIs that changed between versions. If this happens, the only safe option is to keep Sherpa's bundled ORT (`sherpa-onnxruntime.xcframework`) and ensure `onnxruntime-react-native` uses a **different symbol namespace** (which Microsoft's builds do not do by default).

**Action for Story 11-5:** Verify with a physical `pod install` and run the duplicate-symbol check. If versions are compatible at the ABI level, apply the `ORTS_COMPAT=1` podspec patch. If not, open a dedicated conflict-resolution subtask.
