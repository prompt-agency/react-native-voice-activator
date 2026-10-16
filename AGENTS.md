# Repository Guidelines

## Project Structure & Module Organization

The root package is the React Native library; `example/` is its Yarn workspace app and integration reference. Public TypeScript APIs live in `src/public/`, with engines, providers, runtime coordination, and Expo config plugins under `src/`. Native implementations live in `android/src/main/` and `ios/`. Keep unit tests beside the library in `src/__tests__/`; shared validation fixtures live in `tests/fixtures/`. Model assets are under `android/src/main/assets/` and `ios/Assets/`; scripts for generating, packaging, and checking them live in `scripts/`.

## Build, Test, and Development Commands

Use Node 20.19 or newer and Yarn 3.6.1. Run `yarn` at the root to install both workspaces. `yarn example start` starts Metro; `yarn example android` or `yarn example ios` runs the sample app. Rebuild the app after native changes. `yarn prepare` fetches the Silero model, generates its manifest, and builds the library and plugin. `yarn typecheck`, `yarn lint`, and `yarn test --runInBand --watchman=false` check types, lint and repository contracts, and run Jest tests. Run `yarn verify:release-readiness` before release work.

## Coding Style & Naming Conventions

TypeScript uses two spaces, single quotes, and ES5 trailing commas, as configured in `package.json`. Follow nearby conventions in Kotlin and Objective-C++. Use descriptive kebab-case module and test filenames, such as `engine-selection.ts` and `engine-selection.test.ts`. ESLint and Prettier enforce formatting; use `yarn lint --fix` for safe fixes. Do not edit generated manifests or vocabulary by hand; use the matching `yarn generate:*` script.

## Testing Guidelines

Jest uses the React Native preset. Add or update `*.test.ts` or `*.test.tsx` cases for behavior changes, including failure, cancellation, and repeated-event paths. For native changes, run the relevant example build and `yarn verify:native-checks`. Test microphone, audio-session, foreground-service, and model-resolution changes on a physical device, and record the device in the PR.

## Commit & Pull Request Guidelines

Use Conventional Commits, as enforced by commitlint: `fix: ...`, `feat: ...`, `docs: ...`, or a scoped form such as `fix(android): ...`. Keep PRs focused. Follow `.github/PULL_REQUEST_TEMPLATE.md`: explain what and why, link an issue when relevant, and paste verification commands with results. Include screenshots or a short recording for visible example-app changes. Back any performance, accuracy, or reliability claim with measured evidence.
