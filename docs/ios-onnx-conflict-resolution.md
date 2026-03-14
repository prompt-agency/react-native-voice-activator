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
