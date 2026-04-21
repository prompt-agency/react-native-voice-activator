---
phase: 4
slug: expo-plugin-and-integration-testing
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | jest.config.js |
| **Quick run command** | `yarn test --testPathPattern=speaker-verification-contract` |
| **Full suite command** | `yarn test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn test --testPathPattern=speaker-verification-contract`
- **After every plan wave:** Run `yarn test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-00-01 | 00 | 0 | PLUGIN-02 | fixture+stub | `yarn test --testPathPattern=speaker-verification-contract` | ✅ (Wave 0) | ⬜ pending |
| 4-01-01 | 01 | 1 | PLUGIN-01 | unit | `yarn typecheck` | ✅ | ⬜ pending |
| 4-01-02 | 01 | 1 | PLUGIN-02 | build | `yarn build:plugin` | ✅ | ⬜ pending |
| 4-02-01 | 02 | 1 | PRIV-02 | contract | `yarn test --testPathPattern=speaker-verification-contract` | ✅ | ⬜ pending |
| 4-02-02 | 02 | 1 | PRIV-02 | lint | `yarn lint` | ✅ | ⬜ pending |
| 4-03-01 | 03 | 1 | PLUGIN-01 | build | `yarn typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Plan (04-00-PLAN.md)

- [x] `src/__tests__/fixtures/speaker-a-enrolled.wav` — stub WAV for enrolled speaker
- [x] `src/__tests__/fixtures/speaker-a-noisy.wav` — stub WAV for enrolled speaker with noise
- [x] `src/__tests__/fixtures/speaker-b-different.wav` — stub WAV for different speaker
- [x] `src/__tests__/speaker-verification-contract.test.ts` — failing contract test stub (`.todo` placeholder)

Wave 0 is covered by Plan 04-00 (wave: 0, depends_on: []).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `expo prebuild` copies model files to iOS bundle | PLUGIN-01 | Requires native build toolchain | Run `expo prebuild`, verify `ios/<App>/SherpaOnnxSpeaker/<filename>` exists and is referenced in `.pbxproj` |
| `expo prebuild` copies model files to Android assets | PLUGIN-01 | Requires native build toolchain | Run `expo prebuild`, verify `android/app/src/main/assets/voice-activator-sherpa-onnx/<filename>` exists |
| EnrollmentScreen round-trip demo | PLUGIN-01 | Requires running app on device/simulator | Run example app, complete enroll → export → simulate restart → verify flow |
| Plugin throws on missing file path | PLUGIN-01 | Requires `expo prebuild` run | Set invalid path in `app.json`, run `expo prebuild`, confirm error message contains `[react-native-voice-activator]` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 04-00)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
