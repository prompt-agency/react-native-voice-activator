# react-native-voice-activator: architecture and positioning review

**Date:** 2026-09-25
**Branch reviewed:** `chore/rn-0.86-upgrade` (v0.1.0, unpublished)
**Method:** six parallel research agents (competitive landscape, wake-word engine state of the art, realtime speech-to-speech landscape, unprimed adversarial code audit, distribution risk, scope/positioning), plus direct verification of every load-bearing claim against the code and primary sources.

---

## Recommendation

**Publish, but not this month, and not as a wake-word library.**

Confidence: **high** on the strategic verdict, **high** on the code defects (verified directly), **medium** on the market sizing (download counts are solid, but no primary demand data exists).

Three findings drive this:

1. **The market window is real and it opened three months ago.** Picovoice killed its free tier on 2026-06-30. openWakeWord's models are CC BY-NC-SA, so they cannot be used commercially. As of today there is **no free, commercially-licensable, custom-phrase wake word engine available to a React Native app**. Sherpa-ONNX KWS is the only one that qualifies, and no published RN wrapper exposes it. This repo does.

2. **The headline feature is already built and deliberately hidden.** Arbitrary English wake phrases work with the model already in the tarball, with zero training. The docs instead describe a GPU training pipeline. This is the single highest-leverage change available and it is roughly a day of work.

3. **There are ship-blocking defects, including a permanent deadlock and a biometric check that ignores its input.** These are not polish items. Publishing before fixing them would burn the credibility the package is meant to build.

The positioning should change from "wake word library" to **"the on-device wake word and mic gate for voice agents"** — the missing front half of ElevenLabs / OpenAI Realtime / LiveKit / Pipecat, none of which have one.

---

## Kill criteria, written before evidence arrived, checked honestly

| Criterion | Verdict |
|---|---|
| A maintained, permissive RN package already does this at scale → contribute, don't publish | **Not hit.** Nothing combines on-device wake word with a managed session loop. `react-native-spokestack` did, and was archived in 2022 at 60 stars. |
| Custom wake words need training consumers can't do → stuck on built-in phrases | **Not hit, and inverted.** Zero-training arbitrary phrases are available *and already shipped*. The barrier is self-imposed documentation. |
| Realtime S2S RN clients ship their own wake/VAD → only the wake-word front-end survives | **Partially hit.** They all do turn-taking and VAD server-side, so the orchestrator is redundant for the cloud case. But none ship wake word. This reshapes the positioning rather than killing the project. |
| Nitro Modules is niche/unstable → hard peer dep is an adoption tax | **Moot.** The package does not use Nitro at all. See defect D4. |

Nothing hit hard enough to stop. One reshaped the plan.

---

## The competitive position

### Wake word engines, as of 2026-09-25

| Engine | Code license | Model license | Custom phrase | Commercial use |
|---|---|---|---|---|
| Picovoice Porcupine | Apache-2.0 | proprietary, AccessKey-gated | Console, seconds | **Paid only since 2026-06-30** |
| openWakeWord | Apache-2.0 | **CC BY-NC-SA 4.0** | ~1 hr Colab training | **Models not commercially usable** |
| microWakeWord | Apache-2.0 | unclear | expert-only; docs warn output "will most likely not be usable!" | ESP32-focused, no iOS integration found |
| **Sherpa-ONNX KWS** | **Apache-2.0** | Apache-2.0 | **zero training, `text2token`** | **Free** |

Picovoice's own FAQ now reads only: *"Picovoice offers a Free Trial for enterprise developers"* and *"the Free Trial is a one-time offer, and it doesn't renew automatically once the trial ends."* Compare their [2022 announcement of a "completely free usage tier"](https://www.hackster.io/news/picovoice-launches-completely-free-usage-tier-for-offline-voice-recognition-for-up-to-three-users-e1eafbc97bb0). Corroborated on [Hacker News](https://news.ycombinator.com/item?id=48248969) and the [Home Assistant forums](https://community.home-assistant.io/t/porcupine-free-tier-shutdown-alternatives-for-home-assistant-voice-users/1012382). Source: <https://picovoice.ai/docs/faq/general/>

**Both RN competitors wrap openWakeWord and therefore inherit its non-commercial model license:** `react-native-openwakeword` (1,129/wk) and `react-native-nitro-wakeword` (40/wk). That is a licensing defect in the competition, not merely a feature gap.

### Where the demand actually is

Weekly npm downloads, week of 2026-09-15:

| Package | Downloads | Category |
|---|---|---|
| `expo-audio` | 1,545,912 | generic audio |
| `expo-speech-recognition` | 421,952 | OS STT |
| `expo-speech` | 350,658 | OS TTS |
| `@livekit/react-native` | 229,119 | realtime transport |
| `react-native-webrtc` | 175,478 | transport |
| `@elevenlabs/react-native` | 83,205 | **managed cloud session** |
| `react-native-tts` | 32,425 | **abandoned since 2024-06** |
| `react-native-wakeword` (DaVoice) | 24,937 | wake word, commercial-license-on-request |
| `whisper.rn` | 24,019 | on-device STT |
| `@react-native-voice/voice` | 23,105 | **archived since 2022** |
| `react-native-executorch` | 10,422 | on-device AI (Software Mansion) |
| `@picovoice/porcupine-react-native` | 4,716 | wake word |
| `react-native-openwakeword` | 1,129 | wake word |
| `react-native-nitro-wakeword` | 40 | wake word |

Read this carefully, because it cuts against a wake-word-first pitch. The wake-word slice is 1k-25k/wk. The realtime-session slice is 83k-229k/wk. The OS-speech slice is 350k-420k/wk. **Wake word is the differentiator, not the market.** The package should lead with what it plugs into.

Two caveats on DaVoice's 24,937: 192 published versions, no GitHub repo in its npm metadata, and a six-week trend of 34,952 → 14,860 → 24,937. Treat it as soft.

### The gap, stated precisely

No speech-to-speech platform surveyed (OpenAI Realtime, Gemini Live, ElevenLabs Agents, AWS Nova Sonic, Azure Voice Live, Hume EVI, Ultravox, Cartesia, Deepgram Voice Agent) documents wake-word activation as a first-party feature. All assume the session is open and the mic already hot. The only documented pattern anywhere is [LiveKit's "hello-wakeword" blog post](https://livekit.com/blog/livekit-wakeword) bolting an on-device ONNX model in front of Agents.

Separately, Software Mansion's `react-native-executorch` covers on-device STT, TTS and LLMs and has **no wake word capability and no roadmap item for one** (agent searched release notes and discussions #2, #116, #736). The strongest agency player in on-device RN AI has left this slot open.

### Is the cascaded pipeline obsolete? No.

Both 2026 comparison writeups found (Deepgram, AssemblyAI — note both sell cascade components, so discount) argue cascade wins on transcript auditing, LLM swappability, cost predictability and debuggability. Decisively: **no S2S foundation model has any on-device deployment mode.** Moshi is open-weight but needs more compute than a phone. So for the offline case, cascaded is not merely better, it is the only option that exists.

The orchestrator is therefore defensible — but only for the offline/on-device case and for apps not using an S2S vendor. For an app using ElevenLabs or OpenAI Realtime, the orchestrator is dead weight, because those platforms do turn-taking server-side. That argues for making the orchestrator opt-in and shipping a thin "wake → hand off the hot mic" path as a first-class alternative.

---

## Status: what has been fixed since this report

Branch `fix/pre-publish-hardening`, 2026-09-25. Full gate green throughout: 39 suites / 429 tests, lint and typecheck clean (all three were red on `main`).

| Defect | Status |
|---|---|
| D1 queue deadlock | Fixed — `providerTimeoutMs` bound plus queue reset on teardown. 5 regression tests. |
| D2 `verifySpeaker` ignored its audio | Fixed. 2 regression tests. |
| D3 anti-spoofing always passed | Adapter throws on construction; the `antiSpoofingProvider` option is unaffected. |
| D4 spurious Nitro peer dep | Removed. Never used in any commit in the repo's history. |
| D5 `recoverable` decorative | Fixed — configuration and `runtime_unavailable` are now non-recoverable, with a guard test. |
| D6 barge-in no-op during listening | Fixed — aborts the capture and restarts the turn. 2 regression tests. |
| D7 unproven "~300ms" claims | Removed from all four locations. |
| D9 concurrent `initialize()` orphaning handles | Fixed via an init token. 2 regression tests. |
| D9 global event buses not exception-safe | Fixed. 4 regression tests. |
| D10 14 MB dead weight | Was not a real finding — see the correction below. |
| Jest resolving from the in-repo worktree | Fixed. Was masking the suite as 40 failing suites out of 104. |

Not yet addressed: D8 (no measured FA/hr for zero-shot phrases — needs devices), the `wakePhrase` API, the hook snapshot reset on remount, Android STT being blocked by `@fugood/react-native-audio-pcm-stream` needing the old architecture, and the native-layer audit.

A pattern worth recording: three separate contract checks were **enforcing** false claims — the STT/TTS ownership framing in both the README and getting-started, and a claim that `getStatus()` returns an event history it has never carried. Each had to be updated before the docs could be corrected. Tests derived from a design cannot find errors in that design.

## Verified defects

All confirmed by reading the code directly.

### D1 — CRITICAL: one hung provider promise permanently deadlocks all future wake words

`src/public/voice-activator.ts:55,264` — `providerOrchestrationQueue` is a single module-level serially-chained promise. Every wake word chains its callback onto whatever the queue currently references. If any callback body never settles, **every subsequent wake word's callback never runs, for the remaining lifetime of the process.**

The `providerOrchestrationGeneration` guard cannot save this: the generation check sits *inside* the `.then()` body (line 269), so a wedged chain means the check is never reached.

This is concretely reachable, not theoretical:
- `src/providers/whisper-rn/WhisperRNSTTAdapter.ts:471-480` — `cancel()`'s own comment cites whisper.rn issue #183, acknowledging `stop()` may not reliably unblock the pending transcription promise.
- `src/providers/tts/CustomTTSAdapter.ts:34-37` — `stop()` sets a flag checked only at await boundaries; it never cancels the blocking ONNX `session.run()` in `TTSInferenceEngine.ts:64-117`.
- No timeout exists anywhere on this path.

**No test covers it.** Every mocked `transcribe()`/`speak()` in the ~12k-line suite settles promptly. No test constructs a never-settling provider and asserts a subsequent wake word still fires.

Fix: per-turn timeouts with a typed timeout error, and replace the single chained promise with a cancellable per-turn task holding an abort signal.

### D2 — CRITICAL: `verifySpeaker()` compares the enrollment against itself

`src/providers/speaker-verification/SherpaOnnxSpeakerVerificationAdapter.ts:118-142`, verified verbatim:

```ts
const pcmBase64 = arrayBufferToBase64(audioBuffer);
// Extract query embedding from audio (used for native extraction pipeline)
await NativeVoiceActivator!.extractSpeakerEmbedding(pcmBase64, sampleRate);  // discarded

const avgEmbedding = averageEmbeddings(stored);
const result = await NativeVoiceActivator!.verifySpeaker(userId, avgEmbedding, threshold);
```

The freshly extracted embedding is computed and thrown away; the stored enrollment average is sent as the thing to verify. **The result is independent of who is actually speaking.** `identifySpeaker()` in the same file (150-167) does it correctly, which confirms this is a bug rather than a pattern.

`verifySpeaker` is public API (`types.ts:459-464`). The internal wake-word gate uses `identifySpeaker`, so the built-in gate is unaffected — this hits direct consumers only. A biometric API that always passes is worse than no API.

### D3 — CRITICAL: anti-spoofing always passes, and is documented as a security feature

Native `detectSpoofing` is a stub returning `0.0` on both platforms (`VoiceActivatorModule.kt:315-318`, `VoiceActivator.mm:668-675`). The gate is `spoofScore <= threshold` (`voice-activator.ts:337-340`), so it can never fail.

`SherpaOnnxAntiSpoofingAdapter` is exported from the package root and `antiSpoofingProvider`/`spoofingThreshold` are documented public options, presented in the README's **Privacy & Compliance** section beside real speaker verification, with no runtime warning. Either remove it from the public API until the model lands, or make it throw on construction.

### D4 — HIGH: the first install instruction is wrong; the Nitro peer dep is spurious

`README.md:72-78` Step 2 tells users to install `react-native-nitro-modules`, stating "without it, the native bridge will not load." `package.json:124` declares it a peer dep.

**The package does not use Nitro.** `src/NativeVoiceActivator.ts` uses `TurboModuleRegistry.get<Spec>('VoiceActivator')` with RN's own Codegen. `grep -rniE "nitro" src/ ios/ android/ *.podspec` returns **zero matches**. The same error is in this repo's `CLAUDE.md`.

This also means the entire class of Nitro risk (pre-1.0 at 0.37.1, unbounded `>=0.31.3` range, the version-conflict crashes that hit react-native-mmkv) evaporates the moment the dep is deleted. Delete the peer dep, delete Step 2, fix CLAUDE.md.

### D5 — HIGH: `recoverable` is decorative

Six construction sites in `src/`, all hardcoded `true`. Zero `recoverable: false`. `createConfigurationFailure` (`voice-activator.ts:725`) *overwrites* its input's value with `true` — in the one category where non-recoverability matters most, a missing model asset no retry will fix.

`docs/getting-started.md` instructs developers to branch on this flag. Error `category` is similarly flattened: every session and provider error is hardcoded `'internal'` (`session-orchestrator.ts:497`, and every `createProviderErrorFromCause` call site). The documented six-category taxonomy is unused on the path consumers actually hit.

### D6 — HIGH: barge-in doesn't interrupt listening or transcription

`src/runtime/session-orchestrator.ts:192-206` — `bargeIn()` only acts when state is `'speaking'`. For `'listening'`/`'transcribing'` it sets a flag and returns; `_abortActiveListen()` is never called from it. The flag is checked only after `aiHandler()` resolves (398) and after `speak()` resolves (422), never right after transcription (369-377).

A wake word during listening is absorbed: the utterance is transcribed and sent to the AI handler anyway, and only after that full round-trip does barge-in apply. The method's own doc comment (186-191) claims otherwise.

This is locked in by a passing test titled `"during listening — is a no-op (session continues normally)"` (`voice-session-orchestrator.test.ts:494-516`), so it can never regress toward a fix.

### D7 — HIGH: no acoustic validation exists, yet the docs make acoustic claims

`tests/fixtures/reliability/latest-results.json` has `latencyMsP95`, `falseTriggerCount`, `interruptionCount`, `teardownIssueCount` as `null` for **every** physical-device scenario on both platforms. The only `passed` result is `android-native-compile`, evidence type `compile-only`.

Meanwhile `README.md:46`, `docs/index.md:25`, `docs/conversation-session.md:289` and `docs/llm-context.md:34` all assert barge-in is "~300ms" or "under 300ms". That is a design target presented as a measurement.

`docs/reliability-validation.md` is admirably honest about this internally ("compile-only validation is not the same as device validation"). The README does not inherit that honesty.

For reference on what the numbers need to be: Google's published KWS work reports 0.006-0.03 FA/hr at 3.1-5.6% FRR (arXiv:1712.03603); Apple targeted ~1 false alarm/week for "Hey Siri". Porcupine self-reports <1 per 10 hours; openWakeWord targets <0.5/hr.

### D8 — CRITICAL for the differentiator: the zero-shot accuracy tradeoff is unquantified anywhere

Sherpa-ONNX docs confirm open-vocabulary keyword spotting and expose `boostingScore` / `keywordsThreshold` as the tradeoff knobs, but publish **no numbers** for how detection rate or FA/hr degrade for an arbitrary `keywords.txt` phrase versus an evaluated one. Agent searched docs and issues; the only data point found is an unrelated anecdote (issue #2678) comparing two different language models.

This is the crux: the differentiator is real, legally clean, and **unmeasured**. D7 and D8 are the same problem, and measuring is the highest-value engineering work available after the crash fixes.

### D9 — MEDIUM/HIGH: state model, lifecycle, misc

- **Concurrent `initialize()` orphans native handles.** `voice-activator.ts:797-892` — no per-call token or mutex; two overlapping calls both initialize engines, last writer wins `activeEngineRuntime`, the loser's handle is never disposed. Reachable via StrictMode double-invoke or two screens mounting.
- **No reference counting** on `initialize`/`dispose`/`startDetection`/`stopDetection`. Two components silently tear down each other's runtime.
- **Unremoved module-load listener** at `voice-activator.ts:155-159`, re-registered on every Fast Refresh with no removal path.
- **Neither hook cleans up on unmount** (`useWakeWord.ts:262-269`, `useVoiceSession.ts:97-103`) — navigating away leaves mic capture and the native engine running with zero subscribers.
- **Global event buses are not exception-safe** (`runtime-events.ts:40-51`, `session-events.ts:42-53`) — a throwing listener aborts the dispatch loop. The per-session bus (`session-orchestrator.ts:118-142`) *does* wrap listeners in try/catch with a comment explaining the hazard. The fix exists and was never applied to the two buses the public API actually uses.
- **`aiHandler()` is unbounded and uncancellable** (`session-orchestrator.ts:393-414`). The silence timeout only arms during listening. A hung handler strands the session and, per D1, wedges the global queue.
- **Dead architectural layer.** Every method in `src/engines/native-managed-engine-runtime.ts:7-26` is an empty no-op; real detection bypasses it via `setWakeWordDetectedHandler`. `engineContracts` has exactly one entry. `CLAUDE.md` documents `src/engines/porcupine/` which does not exist. `resolveEngineContract` silently falls back on an unknown engine id, so `engine: { id: 'porcupine' }` is discarded with no error.
- **README contradicts the code on ownership.** `README.md:349-358` says "the package itself does not own transcription or synthesis... those speech flows remain outside the package runtime." Passing `sttProvider` to `initialize()` makes the package call `transcribe()` on every wake word and emit four lifecycle events. It absolutely owns them.
- **Expo plugin silently no-ops.** `withOnnxruntimeRegistration.ts:50-94` returns content unmodified if no regex anchor matches, reports success, and the consumer hits "Cannot read property 'install' of null" at runtime — the exact failure the file's own comment says it prevents.
- **`autoSpeak` is undocumented** in README and getting-started; it defaults to `false` and gates the auto-speak step.
- **Three `__reset...ForTests()` escape hatches** exist, each warning that omitting the call leaks state into the next test — direct evidence the singleton fights the suite.

### D10 — MEDIUM: packaging waste and inconsistency

- ~~**~14 MB of dead weight.**~~ **Corrected 2026-09-25:** the fp32 models are already excluded from the tarball by the `!**/*-epoch-12-avg-2-chunk-16-left-64.onnx` glob in `package.json`. `npm pack --dry-run` ships int8 only. Consumers never download them; they are repo weight alone. No action needed.
- **Two different binary strategies.** iOS downloads XCFrameworks at `pod install` (checksum-pinned, 3 retries — good hygiene); Android commits a 28.1 MB AAR into the tarball. The precedent to weigh is ffmpeg-kit, which removed all binaries from Maven/CocoaPods/npm in 2025 and broke CI across the ecosystem. Your checksum pinning against your own release tag is meaningfully safer than onnxruntime-react-native's unpinned `latest.integration` (which shipped 1.30.0 to an app pinned at 1.24.3), so this is a real strength — just make the two platforms consistent.
- **Optional peers are fragile by ecosystem default.** RN CLI autolinking does not pick up `optionalDependencies` ([cli#874](https://github.com/react-native-community/cli/issues/874), open since 2019), and `peerDependenciesMeta.optional` is inconsistently honored by yarn Berry and pnpm (six separate open pnpm issues). Seven optional peers is more than any comparable library the agent could find.
- **A genuinely broken path.** `@fugood/react-native-audio-pcm-stream` needs the old `RCTEventEmitter` bridge; the repo's own docs (`README.md:273`, `docs/expo-setup.md:154`) suggest `newArchEnabled: false`, an option **Expo SDK 55 removed entirely**. The workaround cannot be followed on the minimum supported SDK.

---

## What to do, in order

### Before publishing anything

1. **Fix D1** (queue deadlock): per-turn timeout + cancellable task with an abort signal. Add the regression test that fires a never-settling provider and asserts the next wake word still processes.
2. **Fix D2** (`verifySpeaker`): use the extracted query embedding. Add a test with two different speakers asserting a non-match.
3. **Resolve D3** (anti-spoofing): remove from public API, or throw on construction while stubbed.
4. **Fix D4** (Nitro): delete the peer dep, delete README Step 2, fix `CLAUDE.md`. This removes a whole risk class for free.
5. **Fix D7** (unproven claims): remove every "~300ms" until measured, or label it explicitly as a target.
6. **Fix D9's README contradiction** about STT/TTS ownership.

### The feature that changes the package's value

7. **Ship `wakePhrase: string`.** `bpe.model` (245 KB) is already in both platform asset dirs. Native config currently has `modelingUnit = ""` and `bpeVocab = ""` (`SherpaOnnxDetector.kt:53-54`); set them to `"bpe"` and the bundled model path so sherpa-onnx tokenizes text itself. Then:
   ```ts
   await initialize({ wakePhrase: 'hey acme' })
   ```
   Keep `keywordAssetKey` for advanced use. Retire the nine stock demo keywords from the headline docs — no real app ships "Merry Christmas", and "Hey Siri" / "Hi Google" are trademarked phrases you should not be suggesting.
8. **Rewrite `docs/model-training/wake-word-training.md`.** Lead with "any English phrase works, no training." Demote Icefall to an appendix for teams wanting a phrase-specific fine-tune.

### The work that makes the claim defensible

9. **Measure, on real devices.** Fill in the nulls: detection rate and FA/hr for ~10 arbitrary phrases across quiet/noisy/far-field, plus battery drain per hour and barge-in p95. Publish the harness and the numbers. Nobody in this space publishes independent numbers, so **being the only project with a reproducible benchmark is itself the differentiator** — and it directly closes D8.
10. **Publish a sensitivity/FA-rate curve** so consumers can pick an operating point. This is the knob the whole product rests on and it is currently one undocumented `sensitivity` number.

### Positioning

11. **Reposition as the front half of a voice agent.** Headline: on-device wake word and mic gating; MIT; no API key; any phrase. Then ship three example integrations that are the actual demand: **ElevenLabs Agents** (83k/wk, official RN SDK, WebRTC), **LiveKit Agents** (229k/wk, and their own blog already wants this), and a fully-offline whisper.rn + local-LLM loop. Each example is a blog post and each blog post reaches an audience 10x the wake-word search term.
12. **Make the orchestrator opt-in, not the identity.** It is genuinely valuable offline, and redundant for anyone using an S2S vendor's server-side turn detection. Sell it as one of two modes.
13. **Move speaker verification, anti-spoofing and noise suppression out of the core story.** `react-native-camera` was deprecated for "lack of maintainers and increased code complexity"; the react-native-modal maintainer's [five-year retrospective](https://dev.to/mmazzarolo/mistakes-i-made-while-maintaining-an-open-source-react-native-library-for-five-years-9g9) names exactly this: "without a defined goal, the library became a huge catch-all." Two of these three features are currently non-functional or broken anyway (D2, D3).
14. **Keep the consultancy signal exactly where it is.** Every case examined (Software Mansion, Margelo→Callstack at reportedly >€20M, Callstack, Infinite Red) keeps the OSS fully free with no in-library gate and signals commercial availability on a separate page. `docs/professional-services.md` already matches that pattern. Do not gate features.
15. **Trim the version floor if cheap.** RN 0.83+/Expo 55+ is defensible (Expo SDK 55 removed `newArchEnabled`; legacy arch was frozen 2025-06-02), but no data exists on what share of real apps that excludes. Supporting one SDK lower would widen reach if it costs little.

---

## What would change this recommendation

- **Picovoice reinstating a free commercial tier.** The licensing window is the strongest single argument here. Watch it.
- **openWakeWord relicensing its models permissively.** That would immediately legitimise both RN competitors.
- **Any S2S vendor shipping first-party wake word.** ElevenLabs is the one to watch: official RN SDK, WebRTC, 83k/wk. If they add wake word, the gap closes.
- **Measured FA/hr coming back bad** for zero-shot phrases. If arbitrary-phrase accuracy is poor and only trained phrases work, the differentiator collapses to Porcupine's model with worse ergonomics. **Measure before building the launch around it.**
- **Software Mansion adding wake word to `react-native-executorch`.** They have distribution and reputation you cannot outrun.

---

## What I could not find out

- **Any primary demand evidence.** No Stack Overflow question, Reddit thread, or Expo forum post asking for on-device RN wake word was located. The only demand signal is behavioral: dead packages still pulling 23k-32k/wk (`@react-native-voice/voice` archived since 2022, `react-native-tts` abandoned since 2024). Treat market-size claims as inference, not fact.
- **Independent benchmarks for any wake word engine.** Every FA/hr figure in this report is self-published by the vendor or project on its own dataset. No neutral replication exists for Porcupine, openWakeWord, microWakeWord or sherpa-onnx. A benchmarking-methodology paper (10.3233/FAIA230695) warns of "a general lack of realism in benchmarking the false alarm rate in real environments."
- **Whether continuous background wake word is actually App Store compliant.** Guideline 2.5.4 limits background audio to "intended purposes"; a documented rejection pattern exists for misusing the audio background mode, but no case naming wake-word detection specifically was found. Neither a clear permission nor a clear prohibition. **This is an unquantified risk sitting under the whole product** and worth resolving with a real submission before marketing background detection.
- **Current Apple OTA cellular download limit** (doc 404'd) and the **Play base-module limit** (two readings of the same official page gave 200MB and 500MB).
- **Whether native errors ever produce a real `recoverable: false`.** Native source was grep-swept, not read.
- **The two largest iOS native files** (`WakeWordSessionCoordinator.mm` 584 lines, `VoiceActivator.mm` 699 lines) were not reviewed. `AVAudioSession` interruption/route handling, native threading safety, and ONNX handle lifecycle are unverified on both platforms. **Given that D1, D2 and D3 were all found in the JS layer, the native layer deserves its own audit before 1.0.**
