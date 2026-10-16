# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build
yarn prepare           # Full build (bob build + plugin)
yarn build:plugin      # Build Expo config plugin only

# Test & Quality
yarn test              # Run all Jest tests
yarn test --testPathPattern=<file>  # Run single test file
yarn typecheck         # TypeScript type check
yarn lint              # ESLint + contract verification scripts

# Contract Verification (subset of lint)
yarn verify:contracts  # Verify Expo, example setup, docs contracts

# Release Readiness
yarn verify:release-readiness  # lint + test + prepare + pack dry-run

# Example App
yarn example <cmd>     # Yarn workspace passthrough to example/
```

Pre-commit hooks (Lefthook) run ESLint, TypeScript check, and commitlint on staged files. Commits must follow Conventional Commits format.

## Architecture

This is a React Native library providing wake word detection and managed multi-turn voice conversation sessions.

### Layered Design

```
Public API (src/public/)
  └── voice-activator.ts       # Module-level singleton; all state lives here
  └── useWakeWord.ts            # React hook wrapping runtime events
  └── useVoiceSession.ts        # React hook wrapping session events

Orchestration (src/runtime/)
  └── session-orchestrator.ts  # Manages listen→transcribe→AI→speak loop

Engines (src/engines/)
  └── native-managed-engine-runtime.ts  # Default: Sherpa-ONNX via native module
  └── porcupine/               # Optional alternative engine

Providers (src/providers/)
  └── whisper-rn/               # WhisperRNSTTAdapter (opt-in peer: whisper.rn)
  └── tts/                      # CustomTTSAdapter, audio playback helpers

Internal (src/internal/)
  └── native-module.ts         # FFI bridge to native runtime
  └── runtime-bridge.ts        # Status/error/interrupt handler registration
  └── runtime-events.ts        # EventEmitter for wake word events
  └── session-events.ts        # EventEmitter for conversation events
  └── runtime-store.ts         # Mutable state store for runtime status

Native Interface
  └── src/NativeVoiceActivator.ts  # Codegen spec (TurboModule, RN Codegen)

Expo Plugin (src/expo/)
  └── Automates Android foreground service, iOS background modes, mic permissions
```

### Key Patterns

**Singleton state**: `voice-activator.ts` uses module-level variables (not a class). All state—engine instance, session config, provider generation counter, barge-in flag—lives at module scope.

**Provider generation invalidation**: A `generationId` counter prevents stale async provider callbacks from completing after a new session has started. Any provider callback checks its captured generation against current before proceeding.

**Barge-in fast-path**: When TTS is speaking and a wake word fires, a dedicated
fast-path bypasses the normal queue so the interruption is not serialised behind
the running session. 300ms is the design target, not a measured result: the
interruption latency has never been measured on a physical device, and
`scripts/run-reliability-evaluation.mjs` cannot measure it (it copies each
fixture's declared metrics into `latest-results.json` and starts no detector).
Do not quote a figure from that file as evidence. See
`docs/reliability-validation.md`.

**Wake phrase tokenization**: `wakePhrase` is tokenized in TypeScript
(`src/internal/keyword-tokenizer.ts`) before the keywords file is written,
because sherpa-onnx's `EncodeBase` answers a token missing from `tokens.txt` by
calling `exit(-1)`: no signal, no crash report, nothing on the JS error path.
The model bundle's `bpe.model` is a **unigram** SentencePiece model despite its
name, so the encoder is Viterbi maximum-score segmentation, not pair merging.
The vocabulary is generated into `src/internal/keyword-vocab.generated.json` by
`yarn generate:keyword-vocab` and guarded by `scripts/verify-keyword-vocab.mjs`
in `yarn lint`. Do not set `modeling_unit` / `bpe_vocab` on the native config to
make sherpa-onnx tokenize plain text: that was issue #31, and it does not work.

**Event system**: Two separate `EventEmitter` instances—`runtimeEvents` (wake word lifecycle) and `sessionEvents` (conversation turns). Hooks subscribe to these; `voice-activator.ts` emits to both.

**Contract tests**: `src/__tests__/documentation-contract.test.ts` and `reliability-validation-contract.test.ts` verify external-facing documentation links and reliability claims programmatically. These run as part of `yarn lint`.

**Vendor type shims**: `src/vendor-types/` contains hand-written type definitions for optional peers (e.g. `whisper.rn`, `onnxruntime-react-native`) so the library typechecks when those packages are not installed.

**Nitro version pin**: `react-native-nitro-modules` is pinned to exactly
`0.31.10`, not a range. `react-native-audio-recorder-player@4.5.0` ships
pre-generated Nitrogen output built against nitro `^0.29.2`; against nitro
0.37.1 it fails to compile with `Unresolved reference 'updateNative'`. Do not
widen this pin without rebuilding the example app on Android.

### Provider Interface Contracts

```typescript
interface SpeechToTextProvider {
  readonly name: string
  transcribe(): Promise<TranscriptionResult>
  cancel(): Promise<void>
}

interface TextToSpeechProvider {
  readonly name: string
  speak(text: string, options?: TTSOptions): Promise<void>
  stop(): Promise<void>
}
```

Providers are injected via `WakeWordInitializationOptions.sttProvider` / `ttsProvider`. The package exports `WhisperRNSTTAdapter` and `CustomTTSAdapter`; other vendors stay application-owned (see `docs/examples/`).

### Error Handling

Errors are typed into categories: `permission`, `lifecycle`, `configuration`, `engine`, `platform`, `internal`. They propagate through the event system and are stored in the status object returned by `getStatus()`. Each error includes a `recoverable` flag.

### Testing

Tests use the `@react-native/jest-preset` Jest preset. Native module and optional peers are mocked via `moduleNameMapper` and file-local `jest.mock`. Run a single test file:

```bash
yarn test --testPathPattern=whisper-rn-stt-adapter
```

### Build Output

React Native Builder Bob outputs to `lib/` with ESM modules and TypeScript declarations. The Expo config plugin compiles separately to `plugin/build/` via `tsconfig.plugin.json`. Both are excluded from ESLint.
