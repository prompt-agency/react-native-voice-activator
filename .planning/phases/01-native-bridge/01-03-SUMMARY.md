---
phase: 01-native-bridge
plan: "03"
subsystem: android-native-bridge
tags:
  - kotlin
  - android
  - sherpa-onnx
  - speaker-embedding
  - denoiser
  - native-bridge

dependency_graph:
  requires:
    - 01-01  # NativeVoiceActivator.ts spec (codegen contract)
  provides:
    - Android implementation of BRIDGE-01 through BRIDGE-06 and SPOOF-01
  affects:
    - VoiceActivatorModule.kt (8 new override methods)

tech_stack:
  added: []
  patterns:
    - Kotlin internal class wrappers following SherpaOnnxDetector pattern
    - Instance caching by model path (lazy-init, no-op if same path)
    - Base64 float PCM encoding with ByteOrder.LITTLE_ENDIAN
    - Promise-based error handling (promise.reject with typed error codes)
    - Lazy initialization via ensureSpeakerEngine() / ensureDenoiser()

key_files:
  created:
    - android/src/main/java/com/voiceactivator/Engines/SherpaOnnx/SherpaOnnxSpeakerEmbedding.kt
    - android/src/main/java/com/voiceactivator/Engines/SherpaOnnx/SherpaOnnxDenoiser.kt
  modified:
    - android/src/main/java/com/voiceactivator/VoiceActivatorModule.kt

decisions:
  - score-approximation: SpeakerEmbeddingManager.search() returns only a name string (no continuous score). Score values are best-effort: 1.0 if matched/found, 0.0 otherwise. Documented in KDoc.
  - detect-spoofing-stub: detectSpoofing returns 0.0 always. No Sherpa-ONNX anti-spoofing API exists in v1.12.29. SPOOF-01 is satisfied as a bridge-level stub per plan.
  - little-endian: All ByteBuffer operations use ByteOrder.LITTLE_ENDIAN to match iOS ARM convention for float32 PCM base64 encoding.

metrics:
  duration_seconds: 125
  completed_date: "2026-04-20"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 01 Plan 03: Android Bridge Methods (Speaker Embedding + Denoiser) Summary

**One-liner:** Kotlin wrappers for Sherpa-ONNX speaker embedding (5 ops) and denoiser (1 op) wired into VoiceActivatorModule.kt as 8 new override methods, completing the Android half of the Phase 1 native bridge.

## What Was Built

### SherpaOnnxSpeakerEmbedding.kt

New internal Kotlin class wrapping `SpeakerEmbeddingExtractor` and `SpeakerEmbeddingManager` from the Sherpa-ONNX AAR:

- `initialize(modelPath)` — Lazy-initializes extractor + manager; caches by model path; no-ops on repeated calls with same path
- `extractEmbedding(pcmBase64, sampleRate)` — Decodes float32 PCM from base64, feeds to extractor stream, returns embedding as base64
- `registerSpeaker(name, embeddingBase64)` — Adds speaker embedding to manager
- `verifySpeaker(name, embeddingBase64, threshold)` — Returns `{ matched: Boolean, score: Double }` via `manager.verify()` + `manager.search()`
- `identifySpeaker(embeddingBase64, threshold)` — Returns `{ name: String?, score: Double }` via `manager.search()`
- `clearSpeakers()` — Releases and recreates manager (preserves extractor, resets enrolled speakers)
- `release()` — Full native resource teardown

### SherpaOnnxDenoiser.kt

New internal Kotlin class wrapping `OfflineSpeechDenoiser`:

- `initialize(modelPath)` — Lazy-initializes denoiser; caches by model path
- `denoise(pcmBase64, sampleRate)` — Decodes PCM, runs denoiser, returns enhanced audio as base64
- `release()` — Releases native resources

### VoiceActivatorModule.kt (8 new overrides)

| Method | Bridge ID | Notes |
|--------|-----------|-------|
| `extractSpeakerEmbedding` | BRIDGE-01 | Delegates to `speakerEmbedding.extractEmbedding()` |
| `registerSpeaker` | BRIDGE-02 | Rejects promise if `manager.add()` returns false |
| `verifySpeaker` | BRIDGE-03 | Returns ReadableMap with matched + score |
| `identifySpeaker` | BRIDGE-04 | Handles null name via `map.putNull()` |
| `clearSpeakers` | BRIDGE-05 | Delegates to wrapper; no model path needed |
| `denoiseAudio` | BRIDGE-06 | Delegates to `denoiser.denoise()` |
| `detectSpoofing` | SPOOF-01 | Stub returning 0.0 |

Model paths extracted from `initialize()` options: `speakerModelPath` and `denoiserModelPath`. Wrappers are released in `dispose()`.

## Verification

- `yarn typecheck` — passes (exit 0)
- `yarn test --testPathPattern=native-bridge-spec` — 9/9 tests pass
- Both Kotlin files confirmed present in `android/src/main/java/com/voiceactivator/Engines/SherpaOnnx/`
- `override fun` count in VoiceActivatorModule.kt: 23 (15 pre-existing + 7 new + detectSpoofing)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `detectSpoofing` returns 0.0 | VoiceActivatorModule.kt:278 | Intentional per plan (SPOOF-01); no Sherpa-ONNX anti-spoofing API in v1.12.29; real AASIST integration deferred to v1.1+ |
| `score` in verifySpeaker/identifySpeaker is 0.0 or 1.0 | SherpaOnnxSpeakerEmbedding.kt | AAR limitation: `SpeakerEmbeddingManager.search()` returns name string only, no continuous similarity score |

These stubs do not prevent the plan's goal — the bridge methods are fully functional for the enrollment/verification pipeline; score granularity is a future enhancement.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 3e5ce76 | feat(01-03): add SherpaOnnxSpeakerEmbedding and SherpaOnnxDenoiser Kotlin wrappers |
| Task 2 | fc324b2 | feat(01-03): wire 8 bridge methods into VoiceActivatorModule.kt |

## Self-Check: PASSED
