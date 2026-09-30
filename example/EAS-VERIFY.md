# Verifying the install path on EAS Build

This exists to answer one question before the first publish: **does a consumer's
build actually succeed on Expo's hosted infrastructure?** It is the last
unverified install path, and it is the one our primary audience uses.

## Why it can fail for reasons unrelated to our code

Both platforms fetch their sherpa-onnx binary from this project's GitHub release
assets at build time, and EAS has documented failures reaching external hosts
during `pod install`
([expo/eas-cli#2321](https://github.com/expo/eas-cli/issues/2321),
[#2032](https://github.com/expo/eas-cli/issues/2032)). No Expo-published
allowlist of reachable hosts exists, so this cannot be settled by reading docs.
It has to be run.

There is a third network dependency people forget: `lib/` is gitignored, so EAS
builds the library from source during install, and the `prepare` script
downloads the Silero VAD model from `raw.githubusercontent.com`.

## The prerequisite that is now satisfied

Both platforms resolve `releases/download/v<version>/...`, so this could not be
run until a release existed. **v0.1.0 is cut**, with all 19 assets uploaded and
their digests verified, so the profile points at it.

One thing still gates it: **the repository must be public.** Release assets on a
private repo return 404 to anonymous requests, which is what an EAS builder
makes. Verify before spending build minutes:

```bash
yarn verify:release-assets        # must pass unauthenticated
cd example
npx eas-cli build --profile verify --platform all
```

The `verify` profile points both platforms at that tag:

| Override | Platform | What it does |
| --- | --- | --- |
| `VOICEACTIVATOR_SHERPA_BASE_URL` | iOS | Where the podspec fetches the XCFrameworks |
| `ORG_GRADLE_PROJECT_VoiceActivator_packageVersion` | Android | Which release tag the Gradle task resolves |

Both change *where the bytes come from*, never *which bytes are accepted*: the
SHA-256 pins in `ios/vendor-checksums.json` and `android/vendor-checksums.json`
still govern, and both paths still fail closed.

## What a pass and a failure each mean

- **Both platforms build.** The install path works on hosted CI. This blocker is
  closed, and npm publish is the next step.
- **iOS fails during `pod install` fetching the XCFrameworks.** That is the
  documented EAS egress problem, not our bug. The fix is to stop depending on
  build-time egress to github.com: publish the frameworks as a CocoaPods pod, or
  mirror them somewhere EAS reaches.
- **Install fails fetching the Silero model.** Same class of problem, different
  host. `SKIP_SILERO_VAD_FETCH=1` proves it, since it skips that download.
- **Android fails, iOS passes.** Look at the Gradle task's own output; it fails
  closed on a checksum mismatch and says so explicitly.

Record the outcome in `research/public-release-readiness.md`, blocker 5.
