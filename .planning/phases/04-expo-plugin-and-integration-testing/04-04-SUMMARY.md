---
phase: 04-expo-plugin-and-integration-testing
plan: "04"
subsystem: expo-plugin
tags: [unit-tests, withModelAssets, config-plugin, file-copy, PLUGIN-02]
dependency_graph:
  requires: [src/expo/withModelAssets.ts]
  provides: [withModelAssets unit test coverage]
  affects: []
tech_stack:
  added: []
  patterns: [jest.mock node:fs, jest.mock @expo/config-plugins with async callback capture, flushCallbackErrors async error pattern]
key_files:
  created:
    - src/__tests__/with-model-assets.test.ts
  modified: []
decisions:
  - async callbacks inside withDangerousMod require immediate .catch attachment in the mock to prevent unhandled rejection warnings; errors captured via CallbackResult.settled promise and collected via flushCallbackErrors helper
metrics:
  duration: "5m"
  completed_date: "2026-04-21"
  tasks_completed: 1
  files_changed: 1
---

# Phase 04 Plan 04: withModelAssets Unit Tests Summary

CI-runnable unit tests for the `withModelAssets` Expo config plugin verifying iOS and Android copy paths, Xcode project registration, hard-fail on missing paths, and independently optional field behavior via mocked `node:fs` and `@expo/config-plugins`.

## What Was Built

`src/__tests__/with-model-assets.test.ts` — 15 tests covering:

1. **iOS copy path** — `copyFileSync` dest is `platformProjectRoot/appName/SherpaOnnxSpeaker|SherpaOnnxDenoiser/filename`
2. **iOS directory creation** — `mkdirSync` called with `{ recursive: true }` on `platformProjectRoot/appName/subdir`
3. **Android copy path** — dest is `platformProjectRoot/app/src/main/assets/voice-activator-sherpa-onnx/filename`
4. **Xcode registration** — `addResourceFile` called with `appName/subdir/filename` and `{ target: uuid }`
5. **Hard-fail** — rejected promise (async throw) captured when `existsSync` returns false; error message contains field name and "does not exist"
6. **Optional fields** — no `copyFileSync`/`mkdirSync`/`addResourceFile` calls when both props are undefined
7. **Absolute paths** — path used verbatim as the `copyFileSync` source without joining against `projectRoot`
8. **Both models** — exactly 4 `copyFileSync` calls when both `speakerModelPath` and `denoiserModelPath` are set

**Mock design:** `withDangerousMod` mock captures async callback results via `CallbackResult.settled` (a `.then(noop, capture)` chain attached immediately to prevent unhandled rejections). Tests use `flushCallbackErrors()` to `await` settling and collect errors.

## Deviations from Plan

None — plan executed exactly as written, with one implementation refinement:

The plan's `withDangerousMod` mock invoked callbacks synchronously and suggested `expect(() => ...).toThrow()` for the error tests. Since `withModelAssets.ts` wraps callbacks in `async (modConfig) => { ... }`, errors become rejected Promises rather than synchronous throws. The mock was implemented to capture rejections asynchronously using a `CallbackResult` pattern, and error tests use `flushCallbackErrors()` instead of `.toThrow()`. This achieves the same semantic coverage.

## Verification

- `yarn test --testPathPattern=with-model-assets` — 15/15 tests pass, 0 failures
- `src/__tests__/with-model-assets.test.ts` exists (321 lines, well above 60-line minimum)
- All acceptance criteria from plan met:
  - Mocks `node:fs` (existsSync, mkdirSync, copyFileSync)
  - Mocks `@expo/config-plugins` (withDangerousMod, withXcodeProject)
  - Imports `withModelAssets` from `../expo/withModelAssets`
  - iOS destination contains `SherpaOnnxSpeaker`/`SherpaOnnxDenoiser`
  - Android destination contains `voice-activator-sherpa-onnx`
  - `addResourceFile` called for Xcode project registration
  - Error captured when file path does not exist, with descriptive message
  - No copy when fields are undefined

## Self-Check: PASSED
