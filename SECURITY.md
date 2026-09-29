# Security Policy

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/prompt-agency/react-native-voice-activator/security/advisories/new),
which keeps the report non-public until a fix ships. Please do not open a public
issue for a vulnerability.

Include the affected version, the platform, and the smallest reproduction you
can manage. You will get an acknowledgement within a week. This is a small
project, so that is a realistic commitment rather than an aspirational one.

## Supported versions

Until 1.0, only the latest published version receives fixes. Backports to older
minors are not provided.

## What this package downloads, and how it is verified

The package has a larger supply-chain surface than a pure-JavaScript library,
because neither the native binaries nor the ONNX models fit in an npm tarball.
Three artifacts are fetched from this project's GitHub release assets rather
than shipped inside it:

| Artifact | When | Pinned by |
| --- | --- | --- |
| sherpa-onnx XCFrameworks (iOS) | `pod install` | [`ios/vendor-checksums.json`](./ios/vendor-checksums.json) |
| sherpa-onnx AAR (Android) | Gradle build | [`android/vendor-checksums.json`](./android/vendor-checksums.json) |
| ONNX model bundle | first `prepareModels()` call at runtime | [`src/internal/model-manifest.json`](./src/internal/model-manifest.json) |

Every one is verified against a SHA-256 recorded in a manifest that **ships
inside the npm tarball**. That is the part that matters: the manifests travel
through npm's own integrity chain, so the pins cannot be altered by someone who
controls the GitHub release without also controlling the npm publish.

All three paths **fail closed**. A checksum mismatch or a missing asset aborts
the build or rejects the download; none of them falls back to using an
unverified binary. A tampered or truncated artifact produces a failed build, not
a silently compromised one.

`yarn verify:release-assets` re-checks every published asset against its
manifest over the network, and runs automatically after a release.

## Reducing the surface

- **Air-gapped or restricted networks.** Supply the binaries out of band instead
  of letting the build fetch them; both paths still verify the checksum. See
  [Air-gapped and offline builds](./docs/release-readiness.md).
- **Mirroring the model bundle.** `prepareModels({ baseUrl })` accepts your own
  host. The manifest still governs verification, so a mirror cannot substitute
  different weights.
- **Microphone access.** Wake-word detection runs entirely on device. The
  package sends no audio anywhere. If you add a cloud STT or TTS provider, that
  provider's network behaviour is yours to document to your users.
