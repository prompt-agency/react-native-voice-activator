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
yarn verify:contracts  # Verify Expo, RunAnywhere, docs contracts

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

Providers (src/providers/runanywhere/)
  └── RunAnywhereSTTAdapter.ts  # Whisper-tiny STT (opt-in peer dep)
  └── RunAnywhereTTSAdapter.ts  # Piper TTS (opt-in peer dep)
  └── catalog.ts               # Model registry (HuggingFace URLs)

Internal (src/internal/)
  └── native-module.ts         # FFI bridge to native runtime
  └── runtime-bridge.ts        # Status/error/interrupt handler registration
  └── runtime-events.ts        # EventEmitter for wake word events
  └── session-events.ts        # EventEmitter for conversation events
  └── runtime-store.ts         # Mutable state store for runtime status

Native Interface
  └── src/NativeVoiceActivator.ts  # Codegen spec (Nitro Modules)

Expo Plugin (src/expo/)
  └── Automates Android foreground service, iOS background modes, mic permissions
```

### Key Patterns

**Singleton state**: `voice-activator.ts` uses module-level variables (not a class). All state—engine instance, session config, provider generation counter, barge-in flag—lives at module scope.

**Provider generation invalidation**: A `generationId` counter prevents stale async provider callbacks from completing after a new session has started. Any provider callback checks its captured generation against current before proceeding.

**Barge-in fast-path**: When TTS is speaking and a wake word fires, a dedicated fast-path bypasses the normal queue for <300ms interruption response.

**Event system**: Two separate `EventEmitter` instances—`runtimeEvents` (wake word lifecycle) and `sessionEvents` (conversation turns). Hooks subscribe to these; `voice-activator.ts` emits to both.

**Contract tests**: `src/__tests__/documentation-contract.test.ts` and `reliability-validation-contract.test.ts` verify external-facing documentation links and reliability claims programmatically. These run as part of `yarn lint`.

**Vendor type shims**: `src/vendor-types/` contains hand-written type definitions for `@runanywhere/core` and `@runanywhere/onnx` packages so the library compiles without requiring users to install those optional peer deps.

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

Providers are injected via `WakeWordInitializationOptions.sttProvider` / `ttsProvider`. The `RunAnywhereSTTAdapter` and `RunAnywhereTTSAdapter` are the built-in implementations; `WhisperRNSTTAdapter` is a planned alternative (see `_bmad-output/planning-artifacts/research/`).

### Error Handling

Errors are typed into categories: `permission`, `lifecycle`, `configuration`, `engine`, `platform`, `internal`. They propagate through the event system and are stored in the status object returned by `getStatus()`. Each error includes a `recoverable` flag.

### Testing

Tests use `react-native` Jest preset. Native module is auto-mocked. RunAnywhere adapters use dynamic `jest.mock` of the ONNX native module. Run a single test file:

```bash
yarn test --testPathPattern=runanywhere-stt-adapter
```

### Build Output

React Native Builder Bob outputs to `lib/` with ESM modules and TypeScript declarations. The Expo config plugin compiles separately to `plugin/build/` via `tsconfig.plugin.json`. Both are excluded from ESLint.
