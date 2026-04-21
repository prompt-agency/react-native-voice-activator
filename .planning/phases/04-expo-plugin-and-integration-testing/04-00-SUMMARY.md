---
phase: 04-expo-plugin-and-integration-testing
plan: "00"
subsystem: testing-infrastructure
tags: [wav-fixtures, contract-test, tdd, nyquist, speaker-verification]
dependency_graph:
  requires: []
  provides: [WAV-FIXTURES, SPEAKER-VERIFICATION-CONTRACT-STUB]
  affects: [04-01, 04-02, 04-03]
tech_stack:
  added: []
  patterns: [nyquist-wave-0-anchor, tdd-red-state-stub]
key_files:
  created:
    - src/__tests__/fixtures/speaker-a-enrolled.wav
    - src/__tests__/fixtures/speaker-a-noisy.wav
    - src/__tests__/fixtures/speaker-b-different.wav
    - src/__tests__/speaker-verification-contract.test.ts
  modified: []
decisions:
  - "WAV fixtures use 16kHz mono 16-bit PCM format (~0.1s, 1600 samples each) as minimal valid test audio"
  - "Contract test uses .todo placeholder for adapter contract — RED state anchor for Plan 04-02"
metrics:
  duration: "57s"
  completed_date: "2026-04-21"
  tasks_completed: 1
  files_created: 4
  files_modified: 0
requirements_satisfied: [PLUGIN-02]
---

# Phase 04 Plan 00: Wave 0 Test Infrastructure Summary

Minimal WAV fixture files and a failing contract test stub created as Nyquist Wave 0 anchor for speaker verification infrastructure.

## What Was Built

Three valid WAV audio fixtures (16kHz mono 16-bit PCM, ~0.1s each) and a contract test skeleton that asserts fixture existence while marking the adapter interface contract as `.todo` (RED state).

### Fixture Specifications

| File | Content | Purpose |
|------|---------|---------|
| `speaker-a-enrolled.wav` | 440Hz sine wave, 1600 samples | Enrolled speaker reference audio |
| `speaker-a-noisy.wav` | 440Hz sine wave + random noise, 1600 samples | Noisy enrolled speaker audio |
| `speaker-b-different.wav` | 220Hz sine wave, 1600 samples | Different speaker audio |

Each WAV file is 3244 bytes with a valid RIFF/WAVE header, fmt chunk (PCM format 1), and data chunk.

### Contract Test

`src/__tests__/speaker-verification-contract.test.ts` contains:
- `it.todo('SherpaOnnxSpeakerVerificationAdapter satisfies SpeakerVerificationProvider')` — RED state anchor
- `it.each(fixtures)` assertions that confirm all 3 WAV files exist at the expected paths

Test results: 3 passed (fixture existence), 1 todo (adapter contract — intentional RED state).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

`it.todo('SherpaOnnxSpeakerVerificationAdapter satisfies SpeakerVerificationProvider')` in `src/__tests__/speaker-verification-contract.test.ts` — intentional placeholder. Plan 04-02 will fill this with the full adapter contract assertions.

## Self-Check: PASSED

- [x] `src/__tests__/fixtures/speaker-a-enrolled.wav` exists (3244 bytes)
- [x] `src/__tests__/fixtures/speaker-a-noisy.wav` exists (3244 bytes)
- [x] `src/__tests__/fixtures/speaker-b-different.wav` exists (3244 bytes)
- [x] `src/__tests__/speaker-verification-contract.test.ts` exists (20 lines)
- [x] Commit `a133738` exists
