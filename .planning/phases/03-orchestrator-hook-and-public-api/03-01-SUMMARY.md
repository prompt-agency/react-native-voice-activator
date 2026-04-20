---
phase: 03-orchestrator-hook-and-public-api
plan: 01
subsystem: api
tags: [speaker-verification, typescript, react-native, session-orchestrator, types, noise-suppression]

# Dependency graph
requires:
  - phase: 02-provider-interfaces-and-adapters
    provides: SpeakerVerificationProvider, AudioPreprocessingProvider, AntiSpoofingProvider, EnrollmentData, SherpaOnnx adapters
provides:
  - SpeakerVerificationPassedEvent and SpeakerVerificationFailedEvent interfaces in src/public/types.ts
  - speakerVerificationPassed and speakerVerificationFailed entries in VoiceSessionEventMap (11 total)
  - verificationThreshold, verificationFailureBehavior, vadGateEnabled, vadGateThreshold optional fields in WakeWordInitializationOptions
  - enrollSpeaker, exportEnrollment, importEnrollment, clearEnrollment methods in VoiceActivatorApi
  - speakerVerificationPassed and speakerVerificationFailed Set entries in session-events.ts listeners
  - VoiceSessionOrchestrator.abort() method (no sessionEnded emit, D-05)
  - NOISE-03 audio preprocessing in _transcribeWithVad() with 4th constructor param
affects: [03-02-verification-gate, 03-03-voice-activator-wiring, 04-expo-plugin]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD red-green, optional constructor param pattern, conditional preprocessing pipeline]

key-files:
  created:
    - src/__tests__/phase-03-types-contract.test.ts
    - src/__tests__/phase-03-orchestrator.test.ts
  modified:
    - src/public/types.ts
    - src/internal/session-events.ts
    - src/runtime/session-orchestrator.ts

# Key decisions
decisions:
  - abort() intentionally does not emit sessionEnded (D-05) — verification-rejected sessions never "ran" so consumers should not see a sessionEnded event for them
  - VAD_SAMPLE_RATE = 16000 hardcoded in preprocessing path — matches Silero VAD native capture rate; no need for dynamic parameter
  - EnrollmentData forward reference in VoiceActivatorApi works within same file — no import needed
  - Worktree was behind main feat/speech-verification branch; merged 75f2c77 (Phase 2 completion) as prerequisite (Rule 3 blocking fix)

# Metrics
metrics:
  duration: 4m
  completed_date: "2026-04-20T21:27:51Z"
  tasks: 2
  files_modified: 5
---

# Phase 03 Plan 01: Types Contract and Orchestrator Extensions Summary

**One-liner:** TypeScript contracts for speaker verification events and enrollment API, plus VoiceSessionOrchestrator abort() + NOISE-03 preprocessing wiring.

## What Was Built

### Task 1: Types and session-events registry (TDD)

Added to `src/public/types.ts`:
- `SpeakerVerificationPassedEvent` interface: `{ score: number; speakerId: string }`
- `SpeakerVerificationFailedEvent` interface: `{ score: number }`
- `VoiceSessionEventMap` extended to 11 entries with both new verification events
- `WakeWordInitializationOptions` gains 4 optional fields: `verificationThreshold`, `verificationFailureBehavior`, `vadGateEnabled`, `vadGateThreshold`
- `VoiceActivatorApi` gains 4 enrollment methods: `enrollSpeaker`, `exportEnrollment`, `importEnrollment`, `clearEnrollment`

Added to `src/internal/session-events.ts`:
- `speakerVerificationPassed: new Set()` and `speakerVerificationFailed: new Set()` entries in `listeners` registry (now 11 entries, matching VoiceSessionEventMap)

### Task 2: VoiceSessionOrchestrator extensions (TDD)

Added to `src/runtime/session-orchestrator.ts`:
- Import `AudioPreprocessingProvider` from `'../public/types'`
- 4th optional constructor parameter: `audioPreprocessingProvider?: AudioPreprocessingProvider`
- `abort()` async method: closes session without emitting `sessionEnded` (for D-05 — verification-rejected sessions)
- NOISE-03 preprocessing in `_transcribeWithVad()`: when `audioPreprocessingProvider` is present, decodes WAV to `ArrayBuffer`, calls `.process(buffer, 16000)`, re-encodes result back to base64 before writing to disk

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing Phase 2 commits**
- **Found during:** Pre-execution check
- **Issue:** The worktree branch `worktree-agent-a6066cbe` was branched off `cac0e9c` (main merge), missing all Phase 1 and Phase 2 GSD commits on `feat/speech-verification`
- **Fix:** Merged `75f2c77` (Phase 2 completion HEAD) into worktree branch to make `SpeakerVerificationProvider`, `AudioPreprocessingProvider`, `EnrollmentData`, etc. available
- **Commit:** `2f17106 Merge commit '75f2c77' into worktree-agent-a6066cbe`

## Known Stubs

None — all additions are interface/type definitions and behavioral implementations that are fully wired.

## Self-Check: PASSED

Created files exist:
- src/__tests__/phase-03-types-contract.test.ts — FOUND
- src/__tests__/phase-03-orchestrator.test.ts — FOUND

Modified files exist:
- src/public/types.ts — FOUND (contains SpeakerVerificationPassedEvent, new event map entries, new options fields, enrollment API methods)
- src/internal/session-events.ts — FOUND (contains speakerVerificationPassed/Failed entries)
- src/runtime/session-orchestrator.ts — FOUND (contains abort() method, VAD_SAMPLE_RATE, audioPreprocessingProvider.process())

Commits:
- 6ce34c1: test(03-01): add failing tests for Phase 03 types contract
- e114612: feat(03-01): add verification event types, new options fields, and enrollment API
- 2fbc224: test(03-01): add failing tests for VoiceSessionOrchestrator abort() and NOISE-03 preprocessing
- 8b1902d: feat(03-01): add abort() method and NOISE-03 preprocessing to VoiceSessionOrchestrator

All 19 new tests pass. yarn typecheck exits 0. No regressions in existing tests (2 pre-existing config-plugin integration test failures unrelated to this plan).
