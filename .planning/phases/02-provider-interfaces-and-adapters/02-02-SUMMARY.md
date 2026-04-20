---
phase: 02-provider-interfaces-and-adapters
plan: 02
subsystem: provider-adapters
tags: [noise-suppression, anti-spoofing, sherpa-onnx, adapters, tdd]
dependency_graph:
  requires: [02-01]
  provides: [SherpaOnnxNoiseSuppressionAdapter, SherpaOnnxAntiSpoofingAdapter]
  affects: []
tech_stack:
  added: []
  patterns: [ArrayBuffer/base64 bridge conversion, TDD red-green cycle]
key_files:
  created:
    - src/providers/noise-suppression/SherpaOnnxNoiseSuppressionAdapter.ts
    - src/providers/noise-suppression/index.ts
    - src/providers/anti-spoofing/SherpaOnnxAntiSpoofingAdapter.ts
    - src/providers/anti-spoofing/index.ts
    - src/__tests__/sherpa-onnx-noise-suppression-adapter.test.ts
    - src/__tests__/sherpa-onnx-anti-spoofing-adapter.test.ts
  modified: []
decisions:
  - SherpaOnnxAntiSpoofingAdapter passes through 0.0 stub result without throwing — documented behavior per Phase 1 stub contract
  - modelPath stored in constructor per NOISE-04; sampleRate at call time per D-10 (stateless interface)
metrics:
  duration: 2m
  completed_date: "2026-04-20"
  tasks_completed: 2
  files_created: 6
  files_modified: 0
---

# Phase 02 Plan 02: Noise Suppression and Anti-Spoofing Adapters Summary

**One-liner:** Two thin Sherpa-ONNX passthrough adapters — SherpaOnnxNoiseSuppressionAdapter (denoiseAudio + base64) and SherpaOnnxAntiSpoofingAdapter (detectSpoofing stub passthrough) — with 8 unit tests.

## Objective

Implement the two remaining concrete Sherpa-ONNX adapters completing the adapter layer. Both are simple passthrough adapters with ArrayBuffer-to-base64 conversion for the native bridge.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement SherpaOnnxNoiseSuppressionAdapter and SherpaOnnxAntiSpoofingAdapter | 95f55ae | 4 adapter files |
| 2 | Write unit tests for noise suppression and anti-spoofing adapters | e230d3b | 2 test files |

## What Was Built

### SherpaOnnxNoiseSuppressionAdapter
- Implements `AudioPreprocessingProvider` interface
- Constructor accepts `{ modelPath: string }` — stored as `_modelPath`, accessible via `.modelPath` getter
- `process(audioBuffer, sampleRate)` converts ArrayBuffer to base64, calls `NativeVoiceActivator.denoiseAudio(pcmBase64, sampleRate)`, converts result base64 back to ArrayBuffer
- sampleRate is a call-time parameter (D-10), not stored at construction
- Stateless — no init/dispose required (D-11)

### SherpaOnnxAntiSpoofingAdapter
- Implements `AntiSpoofingProvider` interface
- `detectSpoofing(pcmBuffer, sampleRate)` converts ArrayBuffer to base64, calls `NativeVoiceActivator.detectSpoofing(pcmBase64, sampleRate)`
- Returns native stub value (0.0) without throwing — documented behavior per Phase 1 SPOOF-01 stub
- Passes through any non-zero score value when bridge returns non-stub result

## Tests

All 8 unit tests pass (`yarn test --testPathPattern="sherpa-onnx-(noise-suppression|anti-spoofing)-adapter"`):

**Noise suppression (4 tests):**
- process calls denoiseAudio with base64 PCM and sampleRate (NOISE-02)
- process returns non-empty ArrayBuffer (NOISE-02)
- constructor stores modelPath (NOISE-04)
- process passes sampleRate at call time, not constructor (D-10)

**Anti-spoofing (4 tests):**
- detectSpoofing calls bridge detectSpoofing with base64 PCM (SPOOF-02)
- detectSpoofing returns number 0-1 (SPOOF-02)
- detectSpoofing does not throw on stub 0.0 result
- detectSpoofing passes through non-zero scores

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `SherpaOnnxAntiSpoofingAdapter` always calls native `detectSpoofing` which returns 0.0. This is intentional — the native stub is documented (SPOOF-01) and deferred per RESEARCH.md. The adapter correctly passes through whatever the bridge returns. No functional stub at the adapter layer.

## Self-Check: PASSED

Files exist:
- src/providers/noise-suppression/SherpaOnnxNoiseSuppressionAdapter.ts — FOUND
- src/providers/noise-suppression/index.ts — FOUND
- src/providers/anti-spoofing/SherpaOnnxAntiSpoofingAdapter.ts — FOUND
- src/providers/anti-spoofing/index.ts — FOUND
- src/__tests__/sherpa-onnx-noise-suppression-adapter.test.ts — FOUND
- src/__tests__/sherpa-onnx-anti-spoofing-adapter.test.ts — FOUND

Commits:
- 95f55ae — feat(02-02): implement SherpaOnnxNoiseSuppressionAdapter and SherpaOnnxAntiSpoofingAdapter — FOUND
- e230d3b — test(02-02): add unit tests for noise suppression and anti-spoofing adapters — FOUND
