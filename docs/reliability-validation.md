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

## Measuring Detection Rate and False Accepts

Two numbers decide whether a wake phrase is usable:

| Metric | What it means | Reference points |
|---|---|---|
| **Detection rate** (TPR) | Fraction of genuine utterances that fire | Google reports 94-97% at their operating points |
| **False accepts per hour** (FA/hr) | Spurious firings per hour of non-target audio | Google 0.006-0.03; Apple targeted ~1/week for "Hey Siri"; Picovoice self-reports <1 per 10 hours; openWakeWord targets <0.5/hr |

Anything above a few per hour is not shippable as an always-on trigger: at 5/hr a
user is interrupted roughly every twelve minutes.

**Sherpa-ONNX publishes neither figure for its open-vocabulary path**, and nor do
we yet. Until they are measured, treat `sensitivity` as untuned.

### Corpus-based measurement (reproducible)

`evaluateWakeWordCorpus` runs the detector over WAV files and reports both
numbers. It feeds audio straight to the spotter, so it does **not** exercise the
microphone, the audio session, the hardware front-end or room acoustics — an
acoustic run is still the ground truth. What it gives you is a number that is
reproducible, comparable between phrases, and regressable in CI, which an
acoustic rig cannot provide.

```typescript
import {
  evaluateWakeWordCorpus,
  sweepWakeWordSensitivity,
  chooseOperatingPoint,
  getModelStatus,
} from 'react-native-voice-activator';

const { directory } = await getModelStatus();

const sweep = await sweepWakeWordSensitivity({
  positives: positiveWavPaths,   // one utterance of the phrase per file
  negatives: negativeWavPaths,   // must never fire
  modelPath: directory,
  keywordsPath: generatedKeywordsPath,
  keywordsAreRawText: true,
});

// Highest detection rate that stays under 0.5 false accepts per hour.
const operatingPoint = chooseOperatingPoint(sweep, 0.5);
```

`chooseOperatingPoint` returning `null` is a real answer: no sensitivity meets
that budget, so the phrase needs changing rather than the threshold.

### Corpus requirements

| | Minimum | Why |
|---|---|---|
| Positives | 100+ utterances, 10+ speakers | Fewer and the detection rate has a confidence interval wider than the number |
| Negatives | **2+ hours** | FA/hr is a rate. One false accept in 6 minutes extrapolates to 10/hr, which is noise, not a measurement |
| Negative content | Conversational speech, TV and podcast audio, background noise, **and phrases that sound like the wake phrase** | Near-miss phrases are what actually cause false accepts; generic noise flatters the result |
| Positive conditions | Quiet, ~65 dB background, and far-field at 3 m | A single quiet-room number is not what users experience |

Report the corpus size alongside every figure. A FA/hr derived from ten minutes of
audio should be labelled as such.

### Acoustic validation (ground truth)

The corpus run cannot tell you whether the microphone path works. For that:

1. Fixed rig: device at a measured distance from a calibrated speaker, same room,
   same volume, recorded and repeated per device.
2. Play the positive corpus and count detections via `wakeWordDetected`.
3. Play the negative corpus for its full duration with detection running.
4. Measure barge-in latency separately — from playback of the wake word starting
   to `ttsProvider.stop()` being called — since that is the figure the docs used
   to assert without evidence.
5. Record battery drain over a 30-minute continuous run, screen off.

Fill the null fields in `tests/fixtures/reliability/latest-results.json` from the
acoustic run, not the corpus run, and say which device and which conditions.

**Fix the iOS audio session arbitration before measuring barge-in.** Until
recently TTS playback set a category with no input, which silently broke the
wake-word tap during playback — any barge-in figure taken before that was
measuring a broken path. See `research/native-layer-followups.md`.

### Running it: the Accuracy tab

The example app ships the harness so a measurement run is setup plus one button,
not a scripting exercise. It runs on device because `evaluateWavFile` is a native
call and because the answer only means anything on real hardware.

**1. Build the corpus.** Two directories in the app's Documents folder:

```
<Documents>/wake-word-corpus/positives/*.wav   one utterance of the phrase per file
<Documents>/wake-word-corpus/negatives/*.wav   audio that must never fire
```

What to put in each:

Sizes and conditions are specified in [Corpus requirements](#corpus-requirements)
above: 100+ positive utterances across 10+ speakers, and **2+ hours** of
negatives. Those are the minimums, not targets.

The part worth emphasising, because it is the part usually skipped: the negative
corpus must contain *phrases that sound like the wake phrase*. For "hey acme"
that means "hey", "okay", "hey and then", "acne", "hey akmi". Near-miss speech is
what produces real false accepts. A negative corpus of podcasts and silence
yields a flattering number that collapses in the field.

Get files onto the device with Finder (iOS, Files sharing) or `adb push`
(Android).

**2. Run it.** Open the example app, **Accuracy** tab. Set the device label (it
prefills, but write the actual model, it ends up in the record), the wake phrase,
and the false-accept budget. Scan the corpus, then run the sweep. It walks
sensitivities 0.2 to 0.8 sequentially, which is slow on purpose: concurrent
decodes compete for the same cores and make the device hot, which distorts the
battery measurement you want next.

**3. Export and import.** Export JSON from the app, then:

```bash
node scripts/import-evaluation-results.mjs ~/Downloads/wake-word-evaluation-*.json
```

That writes `tests/fixtures/reliability/wake-word-accuracy.json`. It **refuses** a
run with under the documented 2 hours of negative audio, and refuses one with no
device label.
Both refusals are the point: FA/hr over ten minutes is an extrapolation wearing a
measurement's clothes, and a result that does not say what it ran on cannot be
reproduced or defended. `--allow-short` imports anyway and flags the record
`indicativeOnly`.

This is kept in its own file rather than merged into
`latest-results.json`, whose schema models latency percentiles and false-trigger
counts for scenario runs. Detection rate and FA/hr are different measurements,
and writing them into fields that mean something else would manufacture exactly
the kind of number this document exists to prevent.

**4. Publish the curve.** The sweep, not just the chosen point, is the useful
output: it lets a consumer pick their own operating point instead of trusting
our default. No wake-word project publishes an independent one, so this is worth
more as a differentiator than the number itself.

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
