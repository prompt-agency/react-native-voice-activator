---
phase: 02-provider-interfaces-and-adapters
plan: 01
subsystem: api
tags: [speaker-verification, typescript, react-native, sherpa-onnx, enrollment, base64]

# Dependency graph
requires:
  - phase: 01-native-bridge
    provides: extractSpeakerEmbedding, registerSpeaker, verifySpeaker, identifySpeaker, clearSpeakers, detectSpoofing bridge methods in NativeVoiceActivator.ts
provides:
  - SpeakerVerificationProvider interface in src/public/types.ts
  - AudioPreprocessingProvider interface in src/public/types.ts
  - AntiSpoofingProvider interface in src/public/types.ts
  - EnrollmentData type in src/public/types.ts
  - SherpaOnnxSpeakerVerificationAdapter with full enrollment accumulation (5-cap), export/import, clear, multi-speaker
  - Unit tests covering all enrollment, export, import, clear, and interface scenarios
affects: [03-orchestration-integration, 04-expo-plugin]

# Tech tracking
tech-stack:
  added: []
  patterns: [Float32Array embedding averaging, base64 ArrayBuffer encode/decode, Map-based in-memory enrollment state]

key-files:
  created:
    - src/providers/speaker-verification/SherpaOnnxSpeakerVerificationAdapter.ts
    - src/providers/speaker-verification/index.ts
    - src/__tests__/sherpa-onnx-speaker-verification-adapter.test.ts
  modified:
    - src/public/types.ts

key-decisions:
  - "verifySpeaker passes stored averaged embedding to bridge (not query embedding) per D-05 — native registerSpeaker keeps native registry current on each enroll"
  - "averageEmbeddings helper throws on dimension mismatch for safety (Float32Array element-wise average)"
  - "Guard before any await in enrollSpeaker — throws synchronously at 5-sample cap (D-06)"

patterns-established:
  - "Provider interfaces in src/public/types.ts — matches existing SpeechToTextProvider/TextToSpeechProvider location"
  - "Adapter in src/providers/{name}/ with index.ts re-export — matches whisper-rn and tts patterns"
  - "In-memory enrollment state via Map<string, string[]> — raw base64 embeddings, averaged at query time"
  - "TDD: test file written first (RED), implementation added (GREEN), typecheck verified"

requirements-completed: [API-01, API-02, ENROLL-01, ENROLL-02, ENROLL-03, ENROLL-04, ENROLL-05, PRIV-01, SPOOF-03]

# Metrics
duration: 3min
completed: 2026-04-20
---

# Phase 2 Plan 1: Provider Interfaces and SherpaOnnxSpeakerVerificationAdapter Summary

**Three typed provider interfaces (SpeakerVerificationProvider, AudioPreprocessingProvider, AntiSpoofingProvider) and SherpaOnnxSpeakerVerificationAdapter with 5-cap enrollment accumulation, Float32Array averaging, and export/import via base64 embeddings**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-20T20:44:06Z
- **Completed:** 2026-04-20T20:47:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added SpeakerVerificationProvider, AudioPreprocessingProvider, AntiSpoofingProvider interfaces and EnrollmentData type to src/public/types.ts
- Implemented SherpaOnnxSpeakerVerificationAdapter with enrollment accumulation (up to 5 samples, D-06), Float32Array element-wise averaging (D-05), full export/import/clear lifecycle (D-03, ENROLL-02–04, PRIV-01)
- All 9 unit tests pass: enrollment accumulation, 5-cap guard before bridge call, verifySpeaker, identifySpeaker, export/import/clear, multi-speaker, and optional detectSpoofing interface satisfaction (SPOOF-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define provider interfaces and implement SherpaOnnxSpeakerVerificationAdapter** - `33a175f` (feat)
2. **Task 2: Write unit tests for SherpaOnnxSpeakerVerificationAdapter** - `e53ab77` (test)

_Note: TDD — tests written first (RED), then implementation (GREEN)_

## Files Created/Modified

- `src/public/types.ts` - Added SpeakerVerificationProvider, AudioPreprocessingProvider, AntiSpoofingProvider interfaces and EnrollmentData type
- `src/providers/speaker-verification/SherpaOnnxSpeakerVerificationAdapter.ts` - Full adapter implementation with enrollment state machine
- `src/providers/speaker-verification/index.ts` - Re-export for the adapter
- `src/__tests__/sherpa-onnx-speaker-verification-adapter.test.ts` - 9 unit tests covering all enrollment/export/import/clear/interface scenarios

## Decisions Made

- `verifySpeaker` passes the stored averaged embedding to the native bridge (not the query embedding), following D-05 which specifies "average stored embeddings before computing similarity". The native `registerSpeaker` is called after each enroll to keep the native registry current.
- `averageEmbeddings` helper throws `"Embedding dimension mismatch: expected ${len}, got ${arr.length}"` if embeddings have different dimensions — safety guard for corrupt import data.
- The 5-sample cap guard is checked synchronously before any `await` in `enrollSpeaker` — this ensures the 6th call throws immediately without consuming the `extractSpeakerEmbedding` bridge call.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Minor: TypeScript reported `_embedding` declared but never used during initial `verifySpeaker` implementation. Fixed by using `await` without assignment (Rule 1 auto-fix, part of task commit 33a175f).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three provider interfaces are defined and exported from `src/public/types.ts` — Phase 3 orchestration can reference them directly
- SherpaOnnxSpeakerVerificationAdapter is complete and tested — Phase 3 can inject it via WakeWordInitializationOptions
- `WakeWordInitializationOptions` not yet updated with `speakerVerificationProvider?` / `audioPreprocessingProvider?` fields — this is scope for subsequent plans in Phase 2 or Phase 3

---
*Phase: 02-provider-interfaces-and-adapters*
*Completed: 2026-04-20*
