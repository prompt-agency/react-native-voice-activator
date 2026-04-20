---
phase: 02-provider-interfaces-and-adapters
plan: 03
subsystem: api
tags: [speaker-verification, noise-suppression, anti-spoofing, typescript, react-native, public-api]

# Dependency graph
requires:
  - phase: 02-provider-interfaces-and-adapters
    plan: 01
    provides: SpeakerVerificationProvider, AudioPreprocessingProvider, AntiSpoofingProvider interfaces and SherpaOnnxSpeakerVerificationAdapter
  - phase: 02-provider-interfaces-and-adapters
    plan: 02
    provides: SherpaOnnxNoiseSuppressionAdapter, SherpaOnnxAntiSpoofingAdapter
provides:
  - WakeWordInitializationOptions extended with speakerVerificationProvider, audioPreprocessingProvider, antiSpoofingProvider, spoofingThreshold
  - voice-activator.ts module-scope storage for all three provider references plus spoofing threshold
  - Getter functions getSpeakerVerificationProvider, getAudioPreprocessingProvider, getAntiSpoofingProvider, getSpoofingThreshold
  - src/index.ts exports for all three adapter classes and all four new types
affects: [03-orchestration-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [module-scope provider storage following sttProvider/ttsProvider pattern, getter function exports for internal provider access]

key-files:
  created: []
  modified:
    - src/public/types.ts
    - src/public/voice-activator.ts
    - src/index.ts

key-decisions:
  - "Added getter functions (getSpeakerVerificationProvider, getAudioPreprocessingProvider, getAntiSpoofingProvider, getSpoofingThreshold) to satisfy noUnusedLocals TypeScript strictness while making providers accessible to Phase 3 orchestrator"
  - "spoofingThreshold defaults to 0.5 — midpoint of [0, 1] score range; Phase 3 will define final calibration"

requirements-completed: [API-01, API-02, NOISE-03]

# Metrics
duration: 2min
completed: 2026-04-20
---

# Phase 2 Plan 3: Public API Wiring Summary

**Extended WakeWordInitializationOptions with four new optional provider fields, wired module-scope storage in voice-activator.ts following the existing sttProvider/ttsProvider pattern, and exported all three adapter classes and four new types from src/index.ts — completing the Phase 2 public API surface**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T20:48:41Z
- **Completed:** 2026-04-20T20:50:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `speakerVerificationProvider`, `audioPreprocessingProvider`, `antiSpoofingProvider`, and `spoofingThreshold` optional fields to `WakeWordInitializationOptions` in `src/public/types.ts`
- Added four module-scope variables in `voice-activator.ts` following the existing pattern; assigned from `options` in `initialize()` and reset in `dispose()`
- Exported getter functions for all four new module-scope provider references to satisfy TypeScript's `noUnusedLocals` strictness and to provide Phase 3 orchestrator access
- Added exports for `SherpaOnnxSpeakerVerificationAdapter`, `SherpaOnnxNoiseSuppressionAdapter`, `SherpaOnnxAntiSpoofingAdapter` to `src/index.ts`
- Added type exports for `AntiSpoofingProvider`, `AudioPreprocessingProvider`, `EnrollmentData`, `SpeakerVerificationProvider` to `src/index.ts`
- Full typecheck and all in-worktree tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend WakeWordInitializationOptions and wire voice-activator.ts module state** - `97e09d8` (feat)
2. **Task 2: Export all new adapters and types from src/index.ts** - `3b9c5cf` (feat)

## Files Created/Modified

- `src/public/types.ts` — Added four optional fields to WakeWordInitializationOptions
- `src/public/voice-activator.ts` — Added provider imports, four module-scope variables, initialize/dispose assignments, and getter function exports
- `src/index.ts` — Added three adapter class exports and four new type exports

## Decisions Made

- Added getter functions (`getSpeakerVerificationProvider`, `getAudioPreprocessingProvider`, `getAntiSpoofingProvider`, `getSpoofingThreshold`) rather than leaving variables unused. TypeScript `noUnusedLocals: true` would reject bare declarations — getter functions satisfy the compiler while serving as the access path for Phase 3.
- `activeSpoofingThreshold` defaults to `0.5`. This is the midpoint of the [0, 1] score range; actual calibrated defaults will be determined during Phase 3 integration testing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added getter functions for new provider module variables**
- **Found during:** Task 1 verification (yarn typecheck)
- **Issue:** TypeScript `noUnusedLocals: true` rejects module-scope variables that are assigned but never read. The plan specified storing the references for Phase 3 without wiring them into the session flow.
- **Fix:** Added four exported getter functions (`getSpeakerVerificationProvider`, `getAudioPreprocessingProvider`, `getAntiSpoofingProvider`, `getSpoofingThreshold`) following the existing `getSession()` pattern. This satisfies the compiler and makes the providers accessible to Phase 3 without any session-flow wiring.
- **Files modified:** `src/public/voice-activator.ts`
- **Commit:** `97e09d8`

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- All three adapter classes are exported from `src/index.ts` — library users can import them directly
- `WakeWordInitializationOptions` has all four new optional fields — existing apps are unaffected (zero breaking changes)
- Getter functions in `voice-activator.ts` give Phase 3 orchestrator access to the stored provider references without coupling through the options object
- Phase 3 can slot speaker verification between wake word detection and session start by reading `getSpeakerVerificationProvider()` in `session-orchestrator.ts`

---
*Phase: 02-provider-interfaces-and-adapters*
*Completed: 2026-04-20*
