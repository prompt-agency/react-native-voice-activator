---
phase: 03-orchestrator-hook-and-public-api
plan: 02
subsystem: api
tags: [speaker-verification, anti-spoofing, enrollment, verification-gate, generation-id, session-orchestrator]

requires:
  - phase: 03-01
    provides: abort() on VoiceSessionOrchestrator, audioPreprocessingProvider 4th constructor param, SpeakerVerificationPassedEvent/SpeakerVerificationFailedEvent types, WakeWordInitializationOptions extensions

provides:
  - Speaker verification gate wired into queueProviderOrchestration (concurrent with session start)
  - verificationFailureBehavior 'closed'/'open'/'emit' modes all functional
  - Generation-ID guard discards stale verification callbacks from rapid wake words
  - Anti-spoofing runs concurrently with verification via Promise.all
  - enrollSpeaker/exportEnrollment/importEnrollment/clearEnrollment on voiceActivator singleton
  - setVerificationAudioBuffer() for Plan 03 VAD gate audio source wiring
  - All enrollment methods exported from public API index

affects:
  - 03-03 (VAD gate will wire setVerificationAudioBuffer with PCM ring buffer)
  - phase-04 (documentation must cover verification gate behavior and enrollment API)

tech-stack:
  added: []
  patterns:
    - Fire-and-forget IIFE for concurrent verification that doesn't block session start
    - Generation-ID guard incremented on new session start (not just stop/dispose)
    - Promise.all for parallel verification + anti-spoofing checks
    - Hardcoded 16000 Hz sample rate for verification audio (matches Sherpa-ONNX capture rate)

key-files:
  created:
    - src/__tests__/phase-03-verification-gate.test.ts
  modified:
    - src/public/voice-activator.ts
    - src/index.ts

key-decisions:
  - "invalidateProviderOrchestration() called before closeActiveVoiceSession() in session-mode queue path — ensures pending verification IIFEs from prior session are discarded by generation guard when new session starts"
  - "verificationAudioBuffer is module-scope state set via exported setVerificationAudioBuffer() — Plan 03 VAD gate will call this with PCM ring buffer frames; until then verification gate is a no-op (optimistic pass)"
  - "Promise.all used for concurrent verification + anti-spoofing — both fail-fast together; result computed after both settle"
  - "Hardcoded 16000 Hz sampleRate in enrollSpeaker and verification calls — matches Sherpa-ONNX native capture rate per VAD_SAMPLE_RATE decision in Plan 01"

requirements-completed:
  - VERIFY-01
  - VERIFY-02
  - VERIFY-03
  - VERIFY-04
  - API-03

duration: 5min
completed: 2026-04-20
---

# Phase 3 Plan 02: Verification Gate and Enrollment API Summary

**Speaker verification gate wired as concurrent IIFE alongside session start, with generation-ID guard, three failure behaviors, anti-spoofing via Promise.all, and four enrollment methods on the voiceActivator singleton**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-20T21:30:26Z
- **Completed:** 2026-04-20T21:35:47Z
- **Tasks:** 1 (TDD: test + feat commits)
- **Files modified:** 3

## Accomplishments

- Concurrent verification gate: session starts immediately on wake word, verification IIFE fires alongside `orchestrator.start()` — zero session-start latency overhead
- Generation-ID guard now increments when a new session starts (not just on stop/dispose), ensuring two rapid wake words discard the first's stale verification callback
- All three `verificationFailureBehavior` modes: `'closed'` calls `orchestrator.abort()` and nulls `activeVoiceSession`; `'open'` fires `speakerVerificationFailed` and continues; `'emit'` fires event and lets app decide
- Anti-spoofing provider check runs concurrently with speaker identification via `Promise.all` — spoof score evaluated against `activeSpoofingThreshold`
- Four enrollment methods (`enrollSpeaker`, `exportEnrollment`, `importEnrollment`, `clearEnrollment`) delegated to `activeSpeakerVerificationProvider` with hardcoded 16000 Hz; throw descriptive errors when provider is null
- `setVerificationAudioBuffer()` exported for Plan 03 VAD gate to wire PCM ring buffer as verification audio source

## Task Commits

TDD task with two commits:

1. **RED — failing tests** - `5a9633a` (test)
2. **GREEN — implementation** - `4f780f0` (feat)
3. **Index exports** - `95a4433` (feat)

## Files Created/Modified

- `src/public/voice-activator.ts` - Added verification gate IIFE, module-scope state for threshold/behavior/audio buffer, enrollment methods, updated orchestrator constructor with 4th param
- `src/__tests__/phase-03-verification-gate.test.ts` - 15 tests covering all verification behaviors, generation-ID race, enrollment API, anti-spoofing concurrency
- `src/index.ts` - Added enrollment function exports and SpeakerVerification event type exports

## Decisions Made

- `invalidateProviderOrchestration()` is now called before `closeActiveVoiceSession()` in the session-mode queue path. This was not in the original plan spec — it's required so that when a second wake word fires and the queue processes it, the `verGen` captured by the first verification IIFE is stale. Without this, both wake words shared the same generation counter and the guard never fired.

- Refactored concurrent checks from two separate `.then()` mutations on a shared mutable variable (`verificationResult`, `spoofScore`) to `Promise.all([verifyPromise, spoofPromise])` with destructured return values. This eliminated TypeScript `never` inference issues on the mutable vars and is cleaner.

- `verificationAudioBuffer` starts as `null` — when null, the verification gate is a no-op (optimistic pass, no events). Plan 03 will call `setVerificationAudioBuffer()` with VAD PCM ring buffer frames.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Generation-ID guard required invalidating on new session start**

- **Found during:** Task 1 (T7 test failure)
- **Issue:** Plan spec says "Two wake words 60ms apart — first verification callback discarded by generation-ID guard" but `providerOrchestrationGeneration` was only incremented by `stopDetection`/`dispose`/`syncEngineRuntimeWithNativeStatus`. Two rapid wake words shared the same generation value.
- **Fix:** Added `invalidateProviderOrchestration()` call before `closeActiveVoiceSession()` in the session-mode queue path. `verGen` is now captured AFTER this increment, so a second wake word creates a new generation that makes the first IIFE's `verGen` stale.
- **Files modified:** `src/public/voice-activator.ts`
- **Verification:** T7 test passes — first verification's stale callback bails without calling abort

**2. [Rule 1 - Bug] TypeScript narrowing failure on mutable verification result**

- **Found during:** Task 1 (typecheck after implementation)
- **Issue:** Assigning `verificationResult` inside `.then()` callback made TypeScript infer it as `never` after `await Promise.all()` at the narrowed usage site.
- **Fix:** Refactored to `const [verificationResult, rawSpoofScore] = await Promise.all([verifyPromise, spoofPromise])` with direct resolved values, eliminating the mutable pattern.
- **Files modified:** `src/public/voice-activator.ts`
- **Verification:** `yarn typecheck` exits 0 (only pre-existing `phase-03-orchestrator.test.ts` error remains)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs)
**Impact on plan:** Both fixes essential for correctness. First is a logical gap in the plan spec; second is a TypeScript inference issue with the mutable pattern. No scope creep.

## Issues Encountered

- Pre-existing TypeScript error in `src/__tests__/phase-03-orchestrator.test.ts` (line 58, `speak` mock type mismatch) — out of scope, not introduced by this plan.
- Pre-existing test failures in `tests/integration/config-plugin/config-plugin.test.ts` across worktrees (plugin build missing) — out of scope.

## Known Stubs

- `setVerificationAudioBuffer()` exists but is not called by any internal code yet — the verification gate only runs when a non-null audio buffer is set. Plan 03 will wire the VAD gate PCM ring buffer into this function. Until then, all verification calls are optimistic passes (no events, no abort).

## Next Phase Readiness

- Plan 03-03 (VAD gate) can wire `setVerificationAudioBuffer()` with PCM frames from Silero VAD ring buffer
- All enrollment methods are functional and accessible via `voiceActivator.enrollSpeaker()` etc. or named exports
- `VoiceActivatorApi` interface is fully implemented in the singleton

---
*Phase: 03-orchestrator-hook-and-public-api*
*Completed: 2026-04-20*
