# Requirements: react-native-voice-activator

**Defined:** 2026-04-20
**Core Value:** Wake word detection that reliably triggers only for the intended user — even in noisy, real-world environments.

## v1.0 Requirements — Speech Verification

### Native Bridge

The Sherpa-ONNX C APIs for speaker embedding and speech denoising must be exposed through the Nitro Modules spec before any JS layer can be built. This phase has no prerequisites and everything else depends on it.

- [x] **BRIDGE-01**: Library exposes `extractSpeakerEmbedding(pcmBase64, sampleRate)` via native bridge, returning a base64-encoded float32 embedding vector
- [x] **BRIDGE-02**: Library exposes `registerSpeaker(name, embeddingBase64)` via native bridge to add a named speaker to the in-memory embedding manager
- [x] **BRIDGE-03**: Library exposes `verifySpeaker(name, embeddingBase64, threshold)` via native bridge, returning a similarity score and boolean match result
- [x] **BRIDGE-04**: Library exposes `identifySpeaker(embeddingBase64, threshold)` via native bridge, returning the best-matching speaker name and similarity score (or null if below threshold)
- [x] **BRIDGE-05**: Library exposes `clearSpeakers()` via native bridge to wipe all registered speakers from the in-memory manager
- [x] **BRIDGE-06**: Library exposes `denoiseAudio(pcmBase64, sampleRate)` via native bridge using `SherpaOnnxOfflineSpeechDenoiser`, returning cleaned PCM as base64
- [x] **BRIDGE-07**: All new Nitro spec methods are implemented on both iOS (Swift/Obj-C) and Android (Kotlin) with parity

### Speaker Enrollment

- [x] **ENROLL-01**: Developer can call `enrollSpeaker(userId, audioBuffer)` multiple times to accumulate 2–5 samples; the library averages embeddings across samples for improved accuracy
- [x] **ENROLL-02**: Developer can call `exportEnrollment()` to retrieve all speaker embeddings as a serialisable object (no raw audio, embeddings only)
- [x] **ENROLL-03**: Developer can call `importEnrollment(data)` to restore previously exported enrollment data into the in-memory speaker manager
- [x] **ENROLL-04**: Developer can call `clearEnrollment()` to remove all enrolled speakers and reset the in-memory manager
- [x] **ENROLL-05**: Library supports multi-speaker enrollment — multiple named users can be registered simultaneously; `identifySpeaker` returns which one matched

### Speaker Verification Gate

- [x] **VERIFY-01**: When `speakerVerificationProvider` is set in `WakeWordInitializationOptions`, wake word events trigger an async speaker verification check before the voice session starts
- [x] **VERIFY-02**: The verification check runs asynchronously — the session starts optimistically and is aborted if verification fails, to stay within the 300ms barge-in budget
- [x] **VERIFY-03**: Developer can configure `verificationThreshold: number` (0–1, default 0.55) in `WakeWordInitializationOptions`
- [x] **VERIFY-04**: Developer can configure `verificationFailureBehavior: 'open' | 'closed' | 'emit'` — `open` continues the session, `closed` aborts it, `emit` fires an event and lets the app decide
- [x] **VERIFY-05**: Library emits `speakerVerificationPassed` event on `sessionEvents` when verification succeeds, including similarity score and matched speaker ID
- [x] **VERIFY-06**: Library emits `speakerVerificationFailed` event on `sessionEvents` when verification fails, including similarity score

### Pre-STT Noise Suppression

- [x] **NOISE-01**: Library defines an `AudioPreprocessingProvider` interface with `process(audioBuffer: ArrayBuffer): Promise<ArrayBuffer>`
- [x] **NOISE-02**: Library ships a `SherpaOnnxNoiseSuppressionAdapter` implementing `AudioPreprocessingProvider` using the `gtcrn_simple.onnx` model (<1MB)
- [x] **NOISE-03**: When `audioPreprocessingProvider` is set in `WakeWordInitializationOptions`, captured audio is preprocessed before being passed to the STT provider (VAD path only for v1.0)
- [x] **NOISE-04**: Noise suppression model path is configurable via `SherpaOnnxNoiseSuppressionAdapter` constructor options

### VAD Gate (Pre-Wake)

- [x] **VAD-01**: When `vadGateEnabled: true` is set in `WakeWordInitializationOptions`, audio frames are gated through Silero VAD before reaching the wake word engine
- [x] **VAD-02**: Developer can configure `vadGateThreshold: number` (0–1, default 0.5) to tune sensitivity of the pre-wake VAD gate
- [x] **VAD-03**: VAD gate runs with negligible additional latency (<30ms) and does not affect the barge-in fast path

### Developer API

- [x] **API-01**: Library defines a `SpeakerVerificationProvider` interface with `enrollSpeaker`, `verifySpeaker`, `exportEnrollment`, `importEnrollment`, `clearEnrollment`
- [x] **API-02**: Library ships a `SherpaOnnxSpeakerVerificationAdapter` as the default implementation of `SpeakerVerificationProvider`
- [x] **API-03**: All new `WakeWordInitializationOptions` fields are optional — existing apps with no changes continue to work identically
- [x] **API-04**: New provider types and configuration options are exported from the library's public API surface (`src/public/`)

### Expo Plugin

- [x] **PLUGIN-01**: Expo config plugin is extended to accept optional `speakerModelPath` and `denoiserModelPath` paths in plugin config
- [x] **PLUGIN-02**: When model paths are configured, the plugin copies the model files to iOS Copy Bundle Resources and Android assets during Expo prebuild

### Privacy & Compliance

- [x] **PRIV-01**: Library never stores, caches, or logs speaker embeddings or raw audio internally — all biometric data is passed through to the consuming app via `exportEnrollment()` and is not retained in module state after `clearEnrollment()` is called
- [ ] **PRIV-02**: Library documentation explicitly states GDPR/CCPA/BIPA obligations — consuming apps must obtain explicit user consent before calling `enrollSpeaker()`, and must implement their own compliant storage for enrollment data

### Anti-Spoofing

- [x] **SPOOF-01**: Library exposes an anti-spoofing bridge method `detectSpoofing(pcmBase64, sampleRate)` via Nitro Modules, returning a spoof probability score (0–1) using an AASIST-class on-device model
- [x] **SPOOF-02**: Library ships a `SherpaOnnxAntiSpoofingAdapter` implementing an `AntiSpoofingProvider` interface; when `antiSpoofingProvider` is set in `WakeWordInitializationOptions`, spoof detection runs alongside speaker verification and rejects sessions where spoof probability exceeds a configurable `spoofingThreshold`
- [x] **SPOOF-03**: `SpeakerVerificationProvider` interface includes an optional `detectSpoofing()` method so custom provider implementations can add liveness detection without breaking the interface contract

## v2 Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Advanced Noise Handling

- **NOISE-V2-01**: VAD gate supports streaming pre-wake noise suppression (not just gating)
- **NOISE-V2-02**: Non-VAD STT path supports audio preprocessing (requires wrapping STT provider directly)
- **NOISE-V2-03**: Adaptive threshold — verification threshold auto-adjusts based on detected SNR

### Extended Enrollment

- **ENROLL-V2-01**: Dedicated enrollment capture method with AGC disabled for improved iOS/Android audio parity
- **ENROLL-V2-02**: Enrollment quality score returned to developer (signal-to-noise estimate of enrolled samples)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud-based speaker verification | Library is offline-first; cloud APIs are app-side concern |
| Non-VAD STT path preprocessing | No pre-existing audio buffer before `transcribe()` starts recording; requires different composition strategy |
| Multi-microphone beamforming | Hardware-specific, outside library scope |
| Streaming real-time denoising during capture | Requires streaming denoiser model; `gtcrn_simple` is offline/batch |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BRIDGE-01 | Phase 1 | Complete |
| BRIDGE-02 | Phase 1 | Complete |
| BRIDGE-03 | Phase 1 | Complete |
| BRIDGE-04 | Phase 1 | Complete |
| BRIDGE-05 | Phase 1 | Complete |
| BRIDGE-06 | Phase 1 | Complete |
| BRIDGE-07 | Phase 1 | Complete |
| SPOOF-01 | Phase 1 | Complete |
| ENROLL-01 | Phase 2 | Complete |
| ENROLL-02 | Phase 2 | Complete |
| ENROLL-03 | Phase 2 | Complete |
| ENROLL-04 | Phase 2 | Complete |
| ENROLL-05 | Phase 2 | Complete |
| NOISE-01 | Phase 2 | Complete |
| NOISE-02 | Phase 2 | Complete |
| NOISE-03 | Phase 3 | Complete |
| NOISE-04 | Phase 2 | Complete |
| API-01 | Phase 2 | Complete |
| API-02 | Phase 2 | Complete |
| PRIV-01 | Phase 2 | Complete |
| SPOOF-02 | Phase 2 | Complete |
| SPOOF-03 | Phase 2 | Complete |
| VERIFY-01 | Phase 3 | Complete |
| VERIFY-02 | Phase 3 | Complete |
| VERIFY-03 | Phase 3 | Complete |
| VERIFY-04 | Phase 3 | Complete |
| VERIFY-05 | Phase 3 | Complete |
| VERIFY-06 | Phase 3 | Complete |
| VAD-01 | Phase 3 | Complete |
| VAD-02 | Phase 3 | Complete |
| VAD-03 | Phase 3 | Complete |
| API-03 | Phase 3 | Complete |
| API-04 | Phase 3 | Complete |
| PLUGIN-01 | Phase 4 | Complete |
| PLUGIN-02 | Phase 4 | Complete |
| PRIV-02 | Phase 4 | Pending |

**Coverage:**
- v1.0 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-20 — traceability updated with PRIV-01, PRIV-02, SPOOF-01, SPOOF-02, SPOOF-03 phase assignments*
