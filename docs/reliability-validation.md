# Reliability Validation

Story 3.4 defines the evidence surface for quiet/noisy and endurance evaluation. This document is intentionally strict about what is proven today versus what is still pending physical-device execution.

## What Exists Today

- structured evaluation manifests under `tests/fixtures/reliability/`
- deterministic host-side scenario fixtures under `tests/fixtures/reliability/scenarios/`
- a results file at `tests/fixtures/reliability/latest-results.json`
- a contract check at `node scripts/verify-reliability-evidence.mjs`
- an executable host-side evidence runner at `node scripts/run-reliability-evaluation.mjs`
- package-level runtime, interruption, and background behavior tests
- Android native compile evidence through `./gradlew :react-native-voice-activator:compileDebugKotlin`

The repo now has an automated deterministic host-side runner for quiet, noisy, and endurance evidence. That runner does not replace physical-device execution. It proves the evidence contract, scenario coverage, and result schema on the host path while leaving acoustic/device proof explicitly pending.

## What Is Still Pending

- physical-device quiet acceptance validation on the primary iOS reference device
- physical-device noisy acceptance validation on the primary iOS reference device
- physical-device 30-minute endurance validation on the primary iOS reference device
- physical-device quiet acceptance validation on the primary Android reference device
- physical-device noisy acceptance validation on the primary Android reference device
- physical-device 30-minute endurance validation on the primary Android reference device

## Reference Device Matrix

The current reference-device matrix is stored in `tests/fixtures/reliability/reference-device-matrix.json`.

Required reference-device scenarios:

- `quiet-acceptance`
- `noisy-acceptance`
- `endurance-30m`

Reference-device classes currently in use:

- `fixture-runner`: deterministic host-side evidence
- `physical-device`: pending acoustic/device proof
- `build-host`: compile-only native validation

## Quiet / Noisy Validation

Use the current built-in native-managed runtime through the public lifecycle API and the existing example app or equivalent host app path.

Fixture definitions:

- `tests/fixtures/reliability/quiet-acceptance-set.json`
- `tests/fixtures/reliability/noisy-acceptance-set.json`

These fixture manifests are structured evaluation metadata. They now point to deterministic host-side scenario fixtures for automated contract validation and also define the scenario contract that must be repeated on physical devices for acoustic proof.

Evaluation expectations:

- at least one expected wake word detection
- no silent runtime teardown
- explicit recording of false triggers or unsupported transitions
- results captured into `tests/fixtures/reliability/latest-results.json`

To regenerate deterministic host-side evidence:

```bash
corepack yarn evaluate:reliability
```

## Endurance Validation

The PRD requires a 30-minute continuous detection endurance test on each supported reference device.

The endurance plan is stored in `tests/fixtures/reliability/endurance-plan.json`.

Required outputs:

- whether the full 30-minute run completed
- `latencyMsP95`
- `falseTriggerCount`
- `interruptionCount`
- `unsupportedTransitionCount`
- `teardownIssueCount`
- unrecoverable failure count
- any unsupported transitions, teardown issues, or interruption problems
- operator notes for follow-up

A passed physical-device run must replace those null placeholders with measured values. Pending physical-device runs may keep those fields null while device execution is still outstanding.

## Truthfulness Rules

- compile-only validation is not the same as device validation
- deterministic host-side validation is not the same as acoustic device validation
- docs, scripts, and example surfaces must not claim physical-device proof unless `latest-results.json` actually records it
