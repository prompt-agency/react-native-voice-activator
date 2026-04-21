---
phase: 04-expo-plugin-and-integration-testing
plan: "01"
subsystem: expo-plugin
tags: [expo, config-plugin, model-assets, ios, android]
dependency_graph:
  requires: ["04-00"]
  provides: ["PLUGIN-01", "PLUGIN-02"]
  affects: ["src/expo/withModelAssets.ts", "src/expo/config-plugin.ts"]
tech_stack:
  added: []
  patterns: ["withDangerousMod for platform file copy", "withXcodeProject for .pbxproj registration"]
key_files:
  created:
    - src/expo/withModelAssets.ts
  modified:
    - src/expo/config-plugin.ts
decisions:
  - "withModelAssets defines ModelAssetsProps locally to avoid circular import with config-plugin.ts; VoiceActivatorPluginProps in config-plugin.ts extends with the same fields"
metrics:
  duration: "~5m"
  completed: "2026-04-21"
  tasks: 2
  files: 2
---

# Phase 04 Plan 01: withModelAssets Expo Config Plugin Summary

**One-liner:** Model asset copy plugin for iOS (with .pbxproj registration via withXcodeProject) and Android, composing speakerModelPath/denoiserModelPath into the withVoiceActivator chain.

## What Was Built

Created `src/expo/withModelAssets.ts` — an Expo config plugin that accepts optional `speakerModelPath` and `denoiserModelPath` strings in `app.json` plugin config and handles all platform-specific file placement during `expo prebuild`:

- **iOS file copy** (`withDangerousMod(['ios', ...])`): Resolves path (relative-to-projectRoot or absolute), copies to `ios/<AppName>/SherpaOnnxSpeaker/<filename>` or `ios/<AppName>/SherpaOnnxDenoiser/<filename>`.
- **iOS Xcode registration** (`withXcodeProject`): Calls `xcodeProject.addResourceFile(relativePath, { target })` so copied files appear in Copy Bundle Resources and are included in the `.app` bundle.
- **Android file copy** (`withDangerousMod(['android', ...])`): Copies to `android/app/src/main/assets/voice-activator-sherpa-onnx/` — Gradle auto-includes all assets.
- **Hard-fail on missing path**: `resolveModelPath()` throws `[react-native-voice-activator] ${fieldName}: configured path does not exist: ${resolved}` if the file is absent.
- **Per-field independence**: Each field is optional; absent fields are silently skipped.

Updated `src/expo/config-plugin.ts`:
- Added `speakerModelPath?: string` and `denoiserModelPath?: string` to `VoiceActivatorPluginProps`.
- Imported and composed `withModelAssets(config, resolvedProps)` as the last plugin in the `withVoiceActivator` chain.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create withModelAssets.ts | 913d370 | src/expo/withModelAssets.ts |
| 2 | Extend VoiceActivatorPluginProps and compose | e18a1c2 | src/expo/config-plugin.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Avoided circular import by defining ModelAssetsProps locally**
- **Found during:** Task 1
- **Issue:** The plan specified `import type { VoiceActivatorPluginProps } from './config-plugin'` in `withModelAssets.ts`, but `config-plugin.ts` imports from `withModelAssets.ts` — creating a circular dependency. Additionally, `VoiceActivatorPluginProps` didn't yet have the new fields until Task 2.
- **Fix:** Defined `ModelAssetsProps` interface locally in `withModelAssets.ts` with the two model path fields. `VoiceActivatorPluginProps` in `config-plugin.ts` independently declares the same fields — no shared import needed.
- **Files modified:** src/expo/withModelAssets.ts
- **Commit:** 913d370

## Known Stubs

None — no UI rendering paths or placeholder data in this plan.

## Self-Check: PASSED

- src/expo/withModelAssets.ts: FOUND
- src/expo/config-plugin.ts: FOUND (modified)
- plugin/build/src/expo/withModelAssets.js: FOUND
- Commit 913d370: FOUND
- Commit e18a1c2: FOUND
