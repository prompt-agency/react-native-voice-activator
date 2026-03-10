# Release Readiness

This checklist separates automated release gates from the remaining manual proof required before a production publish.

## Automated Gates

The repository is considered release-candidate ready only after these commands are green:

- `yarn verify:release-readiness`
- `yarn workspace react-native-voice-activator-example build:android`
- `bundle exec pod install --project-directory=ios` inside [`example`](./../example)
- `yarn workspace react-native-voice-activator-example build:ios`

Local prerequisite for the iOS gate:

- the machine must have the Ruby version pinned in [`example/.ruby-version`](../example/.ruby-version)
- CI already provides that via [`release.yml`](../.github/workflows/release.yml)
- if local `pod install` or `build:ios` fails before Xcode compilation starts because the pinned Ruby is missing, treat that as a workstation-toolchain issue, not a package-runtime regression

`yarn verify:release-readiness` currently covers:

- lint
- type-safe documentation and setup-contract checks
- Expo config resolution and Expo prebuild generation
- reliability evidence schema validation
- unit/integration tests
- package build output generation
- `npm pack --dry-run` publish-surface verification

## Manual Gates

These checks are still required before a real release, and they are not yet replaceable with current CI evidence:

- physical iOS quiet/noisy acceptance validation
- physical Android quiet/noisy acceptance validation
- 30-minute endurance validation on supported reference devices
- Android foreground-service behavior verification on at least one real device
- iOS background-behavior verification on a real device

The current evidence status lives in:

- [`tests/fixtures/reliability/latest-results.json`](../tests/fixtures/reliability/latest-results.json)
- [`tests/fixtures/reliability/reference-device-matrix.json`](../tests/fixtures/reliability/reference-device-matrix.json)

Do not widen package claims beyond what those files actually prove.

## Current Support Boundary

- Bare React Native: validated through package checks plus native build paths
- Expo: validated through config resolution and Expo prebuild generation
- Expo Go: unsupported
- Expo dev-client runtime: not yet proven in automated validation

## Release Decision

Do not publish if any automated gate is red.

Do not market device reliability, noisy-environment performance, or long-run stability as proven until the manual gates are completed and the reliability result fixtures are updated with measured values.
