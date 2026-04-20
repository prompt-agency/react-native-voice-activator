# Roadmap: react-native-voice-activator

## Overview

This roadmap delivers the v1.0 Speech Verification milestone: speaker enrollment and verification, VAD gating, pre-STT noise suppression, anti-spoofing, privacy compliance, and Expo plugin support. All work builds on the already-linked Sherpa-ONNX binary — no new native dependencies. The build order is native bridge outward: Phase 1 exposes raw C API methods through Nitro Modules (including the AASIST anti-spoofing bridge); Phase 2 wraps them in typed provider interfaces and JS adapters (including the `AntiSpoofingProvider` interface, `SherpaOnnxAntiSpoofingAdapter`, and the privacy no-storage invariant); Phase 3 wires the verification gate and enrollment API into the session orchestrator and public API surface; Phase 4 extends the Expo plugin, adds integration tests against real audio fixtures, and delivers privacy compliance documentation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Native Bridge** - Expose Sherpa-ONNX speaker embedding, speech denoiser, and anti-spoofing APIs through Nitro Modules on iOS and Android
- [ ] **Phase 2: Provider Interfaces and Adapters** - Define typed provider contracts and ship `SherpaOnnxSpeakerVerificationAdapter`, `SherpaOnnxNoiseSuppressionAdapter`, and `SherpaOnnxAntiSpoofingAdapter` with privacy no-storage invariant
- [ ] **Phase 3: Orchestrator Hook and Public API** - Wire the verification gate and enrollment API into the session orchestrator and `voice-activator.ts`
- [ ] **Phase 4: Expo Plugin and Integration Testing** - Extend the Expo config plugin for model asset copying, validate the full pipeline with real audio fixtures, and deliver privacy compliance documentation

## Phase Details

### Phase 1: Native Bridge
**Goal**: Developers can call speaker embedding extraction, speaker embedding manager operations, speech denoising, and anti-spoofing detection from JavaScript through the Nitro Modules spec — on both iOS and Android
**Depends on**: Nothing (first phase)
**Requirements**: BRIDGE-01, BRIDGE-02, BRIDGE-03, BRIDGE-04, BRIDGE-05, BRIDGE-06, BRIDGE-07, SPOOF-01
**Success Criteria** (what must be TRUE):
  1. A JS caller can pass a base64 PCM buffer to `extractSpeakerEmbedding` and receive a base64 float32 embedding without a runtime crash on both iOS and Android
  2. A JS caller can call `registerSpeaker`, `verifySpeaker`, `identifySpeaker`, and `clearSpeakers` sequentially and observe correct boolean/string results on both platforms
  3. A JS caller can pass a base64 PCM buffer to `denoiseAudio` and receive a non-empty base64 denoised PCM result on both platforms
  4. A JS caller can pass a base64 PCM buffer to `detectSpoofing` and receive a spoof probability score (0–1) on both iOS and Android without a runtime crash
  5. Every new method (including `detectSpoofing`) is declared in `NativeVoiceActivator.ts` before its native implementation exists — spec-first order is verifiable via git history
  6. A cross-platform parity test calls all eight bridge methods on both iOS simulator and Android emulator and asserts non-null, non-error results
**Plans:** 2/3 plans executed

Plans:
- [x] 01-01-PLAN.md — Spec-first: declare 8 bridge methods in NativeVoiceActivator.ts + unit tests
- [ ] 01-02-PLAN.md — iOS native: SherpaOnnxSpeakerEmbedding + SherpaOnnxDenoiser wrappers + VoiceActivator.mm wiring
- [x] 01-03-PLAN.md — Android native: SherpaOnnxSpeakerEmbedding.kt + SherpaOnnxDenoiser.kt wrappers + VoiceActivatorModule.kt wiring

### Phase 2: Provider Interfaces and Adapters
**Goal**: The `SpeakerVerificationProvider`, `AudioPreprocessingProvider`, and `AntiSpoofingProvider` interfaces exist as typed contracts; their Sherpa-ONNX adapters implement them against the native bridge; the `SpeakerVerificationProvider` interface includes the optional `detectSpoofing()` method; enrollment data is export/import only — the library never stores embeddings internally and module state is clean after `clearEnrollment()`
**Depends on**: Phase 1
**Requirements**: API-01, API-02, ENROLL-01, ENROLL-02, ENROLL-03, ENROLL-04, ENROLL-05, NOISE-01, NOISE-02, NOISE-03, NOISE-04, PRIV-01, SPOOF-02, SPOOF-03
**Success Criteria** (what must be TRUE):
  1. A developer can call `enrollSpeaker(userId, audioBuffer)` up to five times for the same user ID and each call accumulates rather than replaces the embedding (multi-sample averaging)
  2. A developer can call `exportEnrollment()` and receive a JSON-serializable `EnrollmentData` object containing only embedding data — no raw audio — and pass that object to `importEnrollment()` on a fresh adapter instance to restore the speaker registry
  3. A developer can call `clearEnrollment()` and confirm zero speakers remain in the in-memory manager; a unit test asserts no embedding data persists in module state after `clearEnrollment()` is called
  4. A developer can pass a `SherpaOnnxNoiseSuppressionAdapter` instance to `audioPreprocessingProvider` and confirm that calling `process(rawPcm)` returns a non-empty `ArrayBuffer` without error
  5. A developer can construct a `SherpaOnnxAntiSpoofingAdapter` and call `detectSpoofing(pcm, sampleRate)` via the `AntiSpoofingProvider` interface, receiving a spoof probability score; when `antiSpoofingProvider` is set in `WakeWordInitializationOptions`, sessions with spoof probability above `spoofingThreshold` are rejected
  6. The `SpeakerVerificationProvider` interface compiles with the optional `detectSpoofing?()` method present — existing custom implementations that do not declare `detectSpoofing` continue to satisfy the interface without TypeScript errors
  7. Unit tests for all adapters pass using mocked native bridge methods, verifying enrollment accumulation, export shape, import restoration, noise suppression passthrough, and anti-spoofing score passthrough
**Plans**: TBD
**UI hint**: no

### Phase 3: Orchestrator Hook and Public API
**Goal**: When a wake word fires and `speakerVerificationProvider` is configured, the session starts immediately (not blocked) and is aborted asynchronously if verification fails; the enrollment API is available on the `voiceActivator` singleton; VAD gating is opt-in via `WakeWordInitializationOptions`; all new options are optional with zero breaking changes
**Depends on**: Phase 2
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05, VERIFY-06, VAD-01, VAD-02, VAD-03, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. When `speakerVerificationProvider` is set and a wake word fires, `sessionEvents` emits `speakerVerificationPassed` (with similarity score and matched speaker ID) before the first session turn begins — and the session is not delayed by more than 150ms total from wake word detection
  2. When verification fails and `verificationFailureBehavior` is `'closed'`, no session turn starts; when `'open'`, the session continues; when `'emit'`, a `speakerVerificationFailed` event fires with similarity score and the app receives control
  3. Two wake words fired 60ms apart result in only the second verification callback completing — the first stale callback is discarded by the generation-ID guard without corrupting session state
  4. An existing app that passes no new options to `initialize()` continues to work identically — no TypeScript errors, no behavior changes, no new required fields
  5. When `vadGateEnabled: true`, audio frames below the configured `vadGateThreshold` do not reach the wake word engine; the VAD gate adds no measurable latency to the barge-in fast-path
**Plans**: TBD
**UI hint**: no

### Phase 4: Expo Plugin and Integration Testing
**Goal**: Expo users can configure `speakerModelPath` and `denoiserModelPath` in `app.json` and have model files automatically copied to iOS bundle resources and Android assets; the full pipeline is validated against real PCM fixtures — enrolled speaker, same speaker with noise, different speaker — on both platforms; library documentation explicitly states GDPR/CCPA/BIPA obligations for consuming apps
**Depends on**: Phase 3
**Requirements**: PLUGIN-01, PLUGIN-02, PRIV-02
**Success Criteria** (what must be TRUE):
  1. Running `expo prebuild` with `speakerModelPath` and `denoiserModelPath` set in `app.json` results in the model files present at the correct path in the iOS `.app` bundle and in `android/app/src/main/assets/` — verified by file-system assertions in a CI step
  2. A real-audio integration test using actual PCM fixtures (enrolled speaker, enrolled speaker with background noise, different speaker) passes against the full native pipeline — the enrolled speaker is accepted above threshold and the different speaker is rejected below threshold on both iOS simulator and Android emulator
  3. The `speaker-verification-contract.test.ts` contract test asserts that `SherpaOnnxSpeakerVerificationAdapter` fully implements the `SpeakerVerificationProvider` interface, including all method signatures and return types
  4. The example app demonstrates enrollment, export, app-restart simulation (import), and verification in a runnable flow that a developer can copy
  5. Published documentation (README or dedicated docs page) includes a Privacy & Compliance section that explicitly names GDPR, CCPA, and BIPA; states that consuming apps must obtain explicit user consent before calling `enrollSpeaker()`; and describes the app's responsibility for compliant storage of enrollment data
**Plans**: TBD
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Native Bridge | 2/3 | In Progress|  |
| 2. Provider Interfaces and Adapters | 0/TBD | Not started | - |
| 3. Orchestrator Hook and Public API | 0/TBD | Not started | - |
| 4. Expo Plugin and Integration Testing | 0/TBD | Not started | - |
