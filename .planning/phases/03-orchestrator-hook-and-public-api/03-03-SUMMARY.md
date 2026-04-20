---
phase: 03-orchestrator-hook-and-public-api
plan: 03
subsystem: api
tags: [vad-gate, pcm-ring-buffer, speaker-verification, wake-word, noise-filtering, public-api]

requires:
  - phase: 03-02
    provides: setVerificationAudioBuffer(), enrollment methods in voice-activator.ts, SpeakerVerificationPassedEvent/SpeakerVerificationFailedEvent types
  - phase: 03-01
    provides: SileroVADEngine with start/stop/dispose lifecycle, VAD_NATIVE_PCM_FRAME_EVENT constant

provides:
  - VAD pre-wake gate: suppresses false wake words when no speech energy detected (VAD-01)
  - vadGateThreshold configurable (defaults 0.5) passed to SileroVADEngine (VAD-02)
  - Barge-in fast-path executes before VAD gate check — zero latency impact (VAD-03)
  - PCM ring buffer (32 frames, ~1s at 16kHz/512-sample frames) feeds verificationAudioBuffer
  - VAD engine lifecycle mirrored to engine runtime: start/stop/dispose/interruption handling
  - All Phase 3 types (SpeakerVerificationPassedEvent, SpeakerVerificationFailedEvent) exported from index.ts
  - All enrollment methods (enrollSpeaker, exportEnrollment, importEnrollment, clearEnrollment) exported from index.ts

affects:
  - src/public/voice-activator.ts
  - src/__tests__/phase-03-vad-gate.test.ts

tech-stack:
  added: []
  patterns:
    - VAD gate flag driven by session events (speechStart/speechEnd)
    - PCM ring buffer pattern: circular array of base64 frames, concatenated on demand
    - NativeEventEmitter addListener pattern (matches SileroVADEngine.start() internal)

key-files:
  created:
    - src/__tests__/phase-03-vad-gate.test.ts
  modified:
    - src/public/voice-activator.ts

decisions:
  - VAD gate check placed after barge-in fast-path (not before) to preserve <300ms barge-in latency (VAD-03)
  - PCM ring buffer uses 32 frames (not 31) for slight over-sampling safety margin (~1.024s)
  - NativeEventEmitter listener cast to match SileroVADEngine pattern (readonly Object[] callback signature)
  - clearVadRingBuffer() also sets verificationAudioBuffer = null directly (not via setVerificationAudioBuffer) to avoid circular dependency within ring buffer assembly

metrics:
  duration: 8m
  completed: 2026-04-20
  tasks: 2
  files: 2
---

# Phase 03 Plan 03: VAD Pre-Wake Gate and Public API Exports Summary

VAD pre-wake gate wired into voice-activator.ts with PCM ring buffer feeding verification audio source; all Phase 3 public API exports confirmed in src/index.ts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire VAD pre-wake gate and PCM ring buffer | fa91ce6 | src/public/voice-activator.ts, src/__tests__/phase-03-vad-gate.test.ts |
| 2 | Add Phase 3 exports to src/index.ts | (already present from Plan 03-02) | src/index.ts |

## What Was Built

### Task 1: VAD Pre-Wake Gate (TDD)

Added 6 new module-scope variables to `voice-activator.ts`:
- `activeVadGateEnabled: boolean` — toggles VAD gating
- `activeVadGateThreshold: number` — threshold passed to SileroVADEngine (default 0.5)
- `activeVadGateEngine: SileroVADEngine | null` — engine instance lifecycle
- `vadGateSpeechActive: boolean` — flag set by speechStart/speechEnd listeners
- `vadGateSpeechSub`, `vadGateSilenceSub`, `vadPcmRingBufferSub` — subscriptions

PCM ring buffer: 32-frame circular buffer of base64-encoded float32 PCM frames. On each frame push, concatenates all frames into a single Float32Array ArrayBuffer and calls `setVerificationAudioBuffer()`, making the last ~1 second of audio available to the speaker verification gate (Plan 03-02).

VAD gate check in `queueProviderOrchestration()`:
```
if (activeVadGateEnabled && !vadGateSpeechActive) { return; }
```
This line appears AFTER the barge-in fast-path block, ensuring VAD-03 compliance.

Engine lifecycle wired in:
- `startDetection()`: creates SileroVADEngine, loads model, subscribes, starts
- `stopDetection()`: stops engine, removes subscriptions, clears ring buffer
- `dispose()`: stops + disposes engine, resets all state
- `syncEngineRuntimeWithNativeStatus()`: stops engine on `interrupted`, restarts on recovery

### Task 2: Public API Exports

Confirmed `src/index.ts` already exports (from Plan 03-02):
- `enrollSpeaker`, `exportEnrollment`, `importEnrollment`, `clearEnrollment` from `./public/voice-activator`
- `SpeakerVerificationPassedEvent`, `SpeakerVerificationFailedEvent` from `./public/types`

No changes required. Full test suite: 1276/1279 pass (3 failures are pre-existing from other worktrees).

## Deviations from Plan

### Auto-fixed Issues

None beyond the plan spec.

### Scope Note

The typecheck error in `src/__tests__/phase-03-orchestrator.test.ts:58` (`Mock<Promise<undefined>>` type mismatch) is pre-existing from Plan 03-01 and out of scope for this plan.

## Verification

- `yarn typecheck`: 1 pre-existing error (phase-03-orchestrator.test.ts from Plan 03-01), 0 new errors
- `yarn test --testPathPattern=phase-03-vad-gate`: 14/14 pass
- `yarn test`: 1276/1279 pass (3 pre-existing failures from other worktrees, not our scope)

## Known Stubs

None. The VAD gate is fully functional: it suppresses wake words when no speech is detected, barge-in is unaffected, and PCM frames feed the verification audio buffer.

## Self-Check: PASSED

- `src/public/voice-activator.ts` contains `let activeVadGateEnabled: boolean = false` ✓
- `src/public/voice-activator.ts` contains `let activeVadGateThreshold: number = 0.5` ✓
- `src/public/voice-activator.ts` contains `let activeVadGateEngine: SileroVADEngine | null = null` ✓
- `src/public/voice-activator.ts` contains `let vadGateSpeechActive: boolean = false` ✓
- `src/public/voice-activator.ts` contains `if (activeVadGateEnabled && !vadGateSpeechActive)` ✓
- `src/public/voice-activator.ts` contains `VAD_RING_BUFFER_SIZE` ✓
- VAD gate check appears AFTER barge-in fast-path block ✓
- `src/__tests__/phase-03-vad-gate.test.ts` created ✓
- Commits: c325d10 (test RED), fa91ce6 (feat GREEN) ✓
