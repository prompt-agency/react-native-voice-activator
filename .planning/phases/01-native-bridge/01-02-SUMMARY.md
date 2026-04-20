---
phase: 01-native-bridge
plan: "02"
subsystem: ios-native
tags: [ios, sherpa-onnx, speaker-embedding, denoiser, objc, rct-export-method]
dependency_graph:
  requires: ["01-01"]
  provides: ["ios-speaker-embedding-bridge", "ios-denoiser-bridge"]
  affects: ["01-03-android-bridge", "02-js-adapter"]
tech_stack:
  added: []
  patterns:
    - "SherpaOnnxTTS caching pattern (lazy init, model path cache key, 8MB NSThread)"
    - "Destroy-and-recreate for clearSpeakers (no explicit C API clear function)"
    - "GetBestMatches + Verify combination for verifySpeaker score+boolean"
key_files:
  created:
    - ios/Engines/SherpaOnnx/SherpaOnnxSpeakerEmbedding.h
    - ios/Engines/SherpaOnnx/SherpaOnnxSpeakerEmbedding.mm
    - ios/Engines/SherpaOnnx/SherpaOnnxDenoiser.h
    - ios/Engines/SherpaOnnx/SherpaOnnxDenoiser.mm
  modified:
    - ios/VoiceActivator.mm
decisions:
  - "detectSpoofing implemented as stub returning 0.0 (SPOOF-01); Sherpa-ONNX v1.12.29 has no anti-spoofing API per RESEARCH.md Pitfall 6"
  - "speakerModelPath and denoiserModelPath passed via initialize() options dict (consistent with detector pattern, not TTS per-call pattern)"
  - "verifySpeaker uses GetBestMatches(n=1) for score, Verify for boolean — score falls back to 1.0/0.0 if GetBestMatches returns different top-match"
  - "clearSpeakers uses destroy-and-recreate pattern; no SherpaOnnxClearSpeakerEmbeddingManager C API exists"
metrics:
  duration: "4m"
  completed_date: "2026-04-20"
  tasks_completed: 2
  files_changed: 5
---

# Phase 01 Plan 02: iOS Speaker Embedding and Denoiser Bridge Summary

iOS wrapper classes for speaker embedding (BRIDGE-01..05), speech denoising (BRIDGE-06), and anti-spoofing stub (SPOOF-01), wired into VoiceActivator.mm via 7 new RCT_EXPORT_METHOD entries.

## What Was Built

Two new Obj-C wrapper classes following the `SherpaOnnxTTS` caching pattern, plus 7 new bridge methods in `VoiceActivator.mm`:

**SherpaOnnxSpeakerEmbedding (.h/.mm)**
- `configureWithModelPath:numThreads:error:` — lazy init with model path cache; creates both extractor and manager; caller must use 8MB NSThread
- `extractEmbeddingFromPCMBase64:sampleRate:error:` — stream-based extraction; ~2s audio required; returns base64 float32 embedding
- `registerSpeakerWithName:embeddingBase64:error:` — registers embedding in in-memory manager
- `verifySpeaker:embeddingBase64:threshold:error:` — boolean match via `SherpaOnnxSpeakerEmbeddingManagerVerify` + score via `GetBestMatches`
- `identifySpeaker:threshold:error:` — best-match via `GetBestMatches(n=1)` with `Search` fallback
- `clearSpeakers` — destroy-and-recreate pattern (no explicit C API clear function)

**SherpaOnnxDenoiser (.h/.mm)**
- `configureWithModelPath:numThreads:error:` — lazy init with GTCRN config; caller must use 8MB NSThread
- `denoiseFromPCMBase64:sampleRate:error:` — runs `SherpaOnnxOfflineSpeechDenoiserRun`, encodes result as base64

**VoiceActivator.mm additions**
- Imports for both new wrapper headers
- `_speakerEmbedding`, `_denoiser`, `_speakerModelPath`, `_denoiserModelPath` ivars
- `ensureSpeakerEngineConfigured:` and `ensureDenoiserConfigured:` private helpers (8MB NSThread for model loading)
- 7 `RCT_EXPORT_METHOD` entries: extractSpeakerEmbedding, registerSpeaker, verifySpeaker, identifySpeaker, clearSpeakers, denoiseAudio, detectSpoofing
- Cleanup in `dispose:` method

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1: iOS wrapper files | 27f03a2 | feat(01-02): add SherpaOnnxSpeakerEmbedding and SherpaOnnxDenoiser iOS wrappers |
| Task 2: VoiceActivator.mm wiring | 01aa716 | feat(01-02): wire 8 bridge methods into VoiceActivator.mm |

## Verification Results

- `yarn typecheck`: PASSED (0 errors)
- `yarn test --testPathPattern=native-bridge-spec`: PASSED (9/9 tests)
- `yarn test` full suite: 588 pre-existing tests pass + 1 new test pass; 1 pre-existing failure (Expo plugin build artifact not present — unrelated to this plan, exists on main branch)
- All 4 new iOS files exist in `ios/Engines/SherpaOnnx/`
- Podspec glob `ios/**/*.{h,m,mm,cpp}` auto-picks up new files
- VoiceActivator.mm: 21 RCT_EXPORT_METHOD entries (vs 12 before; +7 new + 2 listener = correct)

## Deviations from Plan

None — plan executed exactly as written.

The plan's IMPORTANT note about `SherpaOnnxSpeakerEmbeddingManagerGetBestMatches` was verified: the function IS present in the bundled c-api.h header with the expected `SherpaOnnxSpeakerEmbeddingManagerBestMatchesResult` struct (containing `matches` array with `name` and `score` fields). No workaround was needed.

## Known Stubs

- `detectSpoofing` returns `@(0.0)` unconditionally. This is intentional — Sherpa-ONNX v1.12.29 and upstream v1.12.39 have no anti-spoofing API. The method is declared in the spec (plan 01-01) and implemented as a stub per RESEARCH.md Pitfall 6 and PROJECT.md "Out of Scope" for v1.0. Resolution: v1.1+ AASIST integration.

## Self-Check: PASSED

All 4 new iOS source files confirmed present. Both task commits (27f03a2, 01aa716) confirmed in git log.
