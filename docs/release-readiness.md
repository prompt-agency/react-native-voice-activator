# Release Readiness

This checklist separates automated release gates from the remaining manual proof required before a production publish.

Gates run at two different moments. Everything under **Automated Gates** runs
*before* publishing. `yarn verify:release-assets` runs *after* the GitHub
release exists, because it is the only check that can prove the published assets
resolve; see [iOS Vendored Frameworks](#ios-vendored-frameworks).

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
- TypeScript typecheck, run both before and after `yarn prepare` (the
  post-build run is the one that catches emitted `.d.ts` colliding with its
  own source; the pre-build run alone passes on a tree with no `lib/`)
- type-safe documentation and setup-contract checks
- Expo config resolution and Expo prebuild generation
- reliability evidence schema validation
- iOS vendored-framework checksum manifest validation
- unit/integration tests
- package build output generation
- `npm pack --dry-run` publish-surface verification

## How a version gets published

npm publishing happens in CI, not from a laptop, via **npm trusted publishing**.
GitHub Actions presents an OIDC identity that npm trusts for this package, so
there is no `NPM_TOKEN` to leak and no one-time password to type. npm also
attaches a provenance attestation automatically, which is only possible from a
public repository.

The order matters and the workflow enforces it. A published version whose
release assets are missing is unusable, so the GitHub release, carrying the
XCFrameworks, the AAR and the model bundle, must exist **before** the npm
version that points at it.

1. Merge normal PRs with Conventional Commit titles. `release-please.yml`
   opens or updates a release PR that bumps `package.json`, the release
   manifest, and `CHANGELOG.md`. Review the version, notes, and remaining
   device evidence before merging it.
2. On the merge to `main`, `publish.yml` checks whether the package version is
   already on npm. For a new version it runs every Release Readiness job,
   downloads the last release's checksum-matching native archives, packages
   the model files, and creates a draft GitHub release.
3. The workflow verifies the exact 19 uploaded asset names, digests, and model
   sizes, publishes the GitHub release, downloads and verifies the public
   assets, and then publishes to npm using OIDC. A failed run can be retried
   with `workflow_dispatch`; an already published npm version is skipped.

When native binaries change, stage their new archives in a prerelease and pass
that tag as `asset_source_tag` when dispatching `publish.yml`. The same tag is
used for the iOS and Android readiness builds. A routine release needs no
manual asset handling. The older `yarn release` command remains available for
exceptional manual recovery, but do not run it alongside the automated flow.

### One-time setup on npmjs.com

Required before the workflow can publish. Package settings → Publishing access
→ add a trusted publisher:

| Field | Value |
| --- | --- |
| Publisher | GitHub Actions |
| Repository | `prompt-agency/react-native-voice-activator` |
| Workflow filename | `publish.yml` |

Until that exists, the workflow's publish step fails with an authentication
error. That is the intended failure: npm will not accept an OIDC identity it has
not been told to trust.

For release PRs to run CI automatically, create a GitHub App with Contents and
Pull requests write access, install it on this repository, set repository
variable `RELEASE_APP_ID` and secret `RELEASE_APP_PRIVATE_KEY`. Without the App,
the workflow falls back to `GITHUB_TOKEN`; GitHub then requires a maintainer to
approve CI on the generated release PR. Repository Actions settings must allow
Actions to create pull requests.

### Why the publish job does not use `./.github/actions/setup`

That action pins Node from `.nvmrc` (20.19.0). Trusted publishing needs Node
`>=22.14.0` and npm `>=11.5.1`. Only the publish job uses the newer toolchain;
everything else stays on the pinned version the package is actually tested
against.

## iOS Vendored Frameworks

The sherpa xcframeworks are too large for the npm tarball and are downloaded by
the podspec at `pod install` time. They are pinned by SHA-256 in
`ios/vendor-checksums.json`, which ships inside the tarball, so the download is
covered by npm's own integrity chain rather than trusting a mutable GitHub
release asset.

Because zip output is not byte-reproducible, the manifest only describes the
exact zips that produced it. If the vendored frameworks have changed, use this
release order:

1. `yarn package:ios-vendor` — builds both zips and rewrites the manifest
2. commit `ios/vendor-checksums.json`
3. upload the new zips to a prerelease and dispatch `publish.yml` with its tag
   after merging the release PR; the workflow verifies the files against the
   committed manifest before upload
4. those same zips are uploaded as the `v<version>` release assets

If the vendored frameworks have not changed, reuse the exact archives from the
previous GitHub release and keep the checksum manifest unchanged. Run
`node scripts/verify-vendor-checksums.mjs --require-assets` after downloading
them. The Release Readiness workflow points its iOS build at the latest
published release, so it can verify a candidate after its version is bumped.
Checksum validation still rejects archives that do not match the candidate's
manifest. When frameworks change, upload the new archives to a prerelease and
set the workflow's `ios_asset_tag` input to that tag for a pre-release build.

Android works the same way, with the AAR instead of zips: Gradle's
`fetchSherpaOnnxAar` task downloads
`sherpa-onnx-static-link-onnxruntime-1.12.29.aar` from the `v<version>` release,
verifies it against `android/vendor-checksums.json`, and refuses to put an
unverified binary on the compile classpath. The AAR is uploaded as a release
asset alongside the iOS zips.

**A published npm version whose GitHub release assets are missing or do not
match the manifests is unusable**: `pod install` fails closed on iOS and the
Gradle build fails closed on Android, rather than linking an unverified binary.

`yarn verify:release-assets` is the gate for this. It downloads every asset the
podspec, the Gradle task and `prepareModels()` resolve from
`releases/download/v<version>/`, and checks each one against the manifest that
pins it. `publish.yml` runs it before npm publication. Run it again by hand if
a release is ever re-uploaded, and do not announce a version until it passes.

Note what the earlier checks do *not* cover:
`verify-vendor-checksums.mjs --require-assets` proves only that the **local**
build artifacts match their manifest. It never touches the network, and the
local files are deleted immediately after the release. Without
`verify:release-assets`, a failed or partial asset upload produces a green
release and a package that is broken for every consumer.

### Model assets

The ONNX models are not in the npm tarball either. They are uploaded as release
assets under flattened names (GitHub asset names cannot contain slashes) and
downloaded once at runtime by `prepareModels()`, verified against
`src/internal/model-manifest.json`.

Release order:

1. `yarn generate:model-manifest` — rewrites the manifest from the files on disk
2. commit `src/internal/model-manifest.json`
3. `publish.yml` runs `scripts/package-models.mjs`, which stages
   `dist-models/` and fails if any file is missing or disagrees with the
   committed manifest
4. every file in `dist-models/` is uploaded as a `v<version>` release asset

**A published version whose model assets are missing is unusable**:
`prepareModels()` fails, and `initialize()` then rejects with
`models_not_prepared`. Consumers can work around it with a `baseUrl` pointing at
their own mirror, but do not rely on that.

### Air-gapped and offline builds

Neither platform can fetch its binary without network access. Supply the files
out of band instead:

- Android: `./gradlew ... -PVoiceActivator_sherpaAarPath=/path/to/sherpa-onnx-static-link-onnxruntime-1.12.29.aar`
- iOS: set `VOICEACTIVATOR_SHERPA_BASE_URL` to anywhere the two zips live, such
  as an internal mirror, a prerelease tag, or a `file://` directory:

  ```bash
  VOICEACTIVATOR_SHERPA_BASE_URL=file:///path/to/zips pod install
  ```

  You can also place the matching verified `.zip` archives under
  `ios/Vendor/SherpaOnnx/` before `pod install`. The podspec checks each archive's
  SHA-256 and extracts it on every install. Extracted frameworks alone are not
  accepted. The environment variable works on hosted CI builders with fresh
  checkouts.

Both paths still verify the checksum.

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
- The built-in Sherpa engine remains credential-free, but that does not expand
  the proof boundary beyond the automated and manual gates listed above.

## Release Decision

Do not publish if any automated gate is red.

Do not market device reliability, noisy-environment performance, or long-run stability as proven until the manual gates are completed and the reliability result fixtures are updated with measured values.
