# Wake word model training (Sherpa-ONNX KWS)

> [!IMPORTANT]
> **You almost certainly do not need this guide.**
>
> A custom English wake phrase needs no training at all:
>
> ```typescript
> await initialize({ wakePhrase: 'hey acme' });
> ```
>
> The bundled keyword spotter is open-vocabulary, and the phrase is tokenized on
> device using the `bpe.model` already in the model bundle. See
> [Wake Words](../../README.md#wake-words).
>
> This guide covers the remaining cases: fine-tuning the acoustic model for a
> phrase the open-vocabulary path detects poorly, a non-English language, or a
> domain with unusual acoustics. That is a real training run — a GPU, hundreds of
> positive utterances and thousands of negatives — so exhaust `wakePhrase` and
> `engineConfig.sensitivity` tuning first.

This guide is for **teams that need a fine-tuned model** compatible with this package’s built-in **Sherpa-ONNX keyword spotter**. Training runs **offline** on a workstation or CI; the mobile app only loads ONNX artifacts and a keyword file.

## Prerequisites

- A machine with enough disk and (optionally) a CUDA-capable GPU for Icefall training runs.
- Python environment matching the **Icefall** recipe you follow (see [Icefall installation](https://k2-fsa.github.io/icefall/installation/index.html)).
- **sherpa-onnx** command-line tools for export testing and `text2token` (e.g. `pip install sherpa-onnx` or build from [source](https://github.com/k2-fsa/sherpa-onnx)) — confirm `sherpa-onnx-cli --help` works.
- Familiarity with **Lhotse** / recipe-specific data prep for the checkpoint you fine-tune from.

## What this package expects (runtime contract)

Do **not** use generic single-file wake models (for example openWakeWord-style single `.onnx` classifiers). This library loads a **streaming Zipformer transducer** bundle used by Sherpa-ONNX KWS.

### Required files in the model directory

| File | Purpose |
|------|---------|
| `encoder` + `.onnx` | Encoder (see [filename rules](#onnx-filename-rules-this-repo) below) |
| `decoder` + `.onnx` | Decoder |
| `joiner` + `.onnx` | Joiner |
| `tokens.txt` | Token table for the transducer |
| `keywords.txt` | Keyword lines in the format expected for your modeling unit (BPE for the default English bundle) |

Optional in upstream bundles (keep if your export produces it):

- `bpe.model` — needed to **generate** `keywords.txt` for BPE models via `sherpa-onnx-cli text2token`.

The keyword list path is **not** part of the transducer bundle in the public API: you pass it separately as `engineConfig.assetKeys.keywordAssetKey`.

References:

- Planning contract: `_bmad-output/planning-artifacts/sherpa-onnx-kws-model-strategy.md`
- Upstream pretrained docs: [Sherpa-ONNX KWS pretrained models](https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html)

### ONNX filename rules (this repo)

Native loaders resolve each of `encoder`, `decoder`, and `joiner` by trying, in order:

1. `{prefix}.onnx` (e.g. `encoder.onnx`)
2. `{prefix}-epoch-12-avg-2-chunk-16-left-64.int8.onnx`
3. `{prefix}-epoch-12-avg-2-chunk-16-left-64.onnx`

So after you export from Icefall with a different epoch suffix, either **rename** files to one of the patterns above or use the generic `encoder.onnx` / `decoder.onnx` / `joiner.onnx` names. The **chunk-16** / **left-64** naming matches the default bundled model and is what upstream uses for ~320 ms streaming chunks.

Implementation reference:

- iOS: `ios/Engines/SherpaOnnx/SherpaOnnxAssetLoader.mm` (`SherpaCandidateFiles`)
- Android: `android/src/main/java/com/voiceactivator/Engines/SherpaOnnx/SherpaOnnxAssetLoader.kt`

### Platform differences for `modelAssetKey` / `keywordAssetKey`

- **iOS:** You may use an **absolute filesystem path** (or `file://` URL) to a directory containing the bundle, or a **bundle-relative** subdirectory name for assets shipped inside the app.
- **Android (current implementation):** Custom keys must be **paths relative to `android/app/src/main/assets/`** (no leading `/`, no `file://`). Copy your bundle under something like `android/app/src/main/assets/my-kws-bundle/` and set `modelAssetKey` to that folder path.

## Data requirements

Targets below align with product goals for on-device KWS; treat them as **guidelines** and tune per domain.

| Topic | Guidance |
|-------|-----------|
| Audio format for training clips | Match recipe expectations; for deployment this runtime uses **16 kHz**, **mono**, **16-bit PCM** at inference (see native detector config). |
| Positive clips | At least **500+** phrase utterances, diverse speakers, mic positions, and rooms. |
| Negative / garbage audio | **5,000+** clips of speech without the phrase, background noise, TV, other wake words, etc. |
| Split | Hold out a **validation** set (e.g. 10–15%) never seen during training; report TPR/FPR on it. |
| Quality goals (noisy environments) | Aim for **TPR > 90%** and **FPR < 1 false trigger per hour** under gym / street / office noise once mapped to device — measure on real hardware, not only offline WER. |

Augmentation (noise, reverb, RIR, codec simulation) is strongly recommended; Icefall/Lhotse pipelines typically support this — follow the recipe you adopt.

## Training pipeline (Sherpa-ONNX KWS, English Zipformer)

The default bundled English model `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` was trained with **Icefall** on **GigaSpeech** and exported to ONNX for Sherpa-ONNX. Upstream documents the **same architecture** and keyword customization for that release.

### 1. Start from upstream training references

- **GigaSpeech English KWS (matches default bundle family):** see the **English** GigaSpeech Zipformer KWS section on [Sherpa-ONNX KWS pretrained models](https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html) (training code pointer links to [icefall PR #1428](https://github.com/k2-fsa/icefall/pull/1428)).
- **Icefall:** [https://github.com/k2-fsa/icefall](https://github.com/k2-fsa/icefall) — install deps, prepare data in the recipe’s Lhotse format, train, decode, and export.
- **ONNX export (general):** [Icefall — Export to ONNX](https://k2-fsa.github.io/icefall/model-export/export-onnx.html) — your recipe’s `export-onnx.py` (or equivalent) must emit **encoder / decoder / joiner** ONNX files compatible with **streaming chunk size** used on device (for this repo, align with **chunk-16** artifacts unless you change native export assumptions).

Exact CLI flags change between Icefall commits. Pin a **commit hash** in your internal runbook and re-verify export filenames against [ONNX filename rules](#onnx-filename-rules-this-repo).

### 2. Fine-tuning vs training from scratch

For most product phrases, **fine-tune** from a released GigaSpeech KWS checkpoint (or your own baseline) rather than training from random init: less data, faster convergence, better stability.

### 3. Map export artifacts to the app bundle

After export, assemble a single directory:

```text
my-kws-bundle/
  encoder.onnx          # or encoder-epoch-…-chunk-16-left-64.onnx (see rules above)
  decoder.onnx
  joiner.onnx
  tokens.txt
  bpe.model             # if BPE — keep for keyword generation
```

Generate `keywords.txt` for **BPE** English models with:

```bash
sherpa-onnx-cli text2token \
  --tokens ./my-kws-bundle/tokens.txt \
  --tokens-type bpe \
  --bpe-model ./my-kws-bundle/bpe.model \
  keywords_raw.txt keywords.txt
```

`keywords_raw.txt` is one phrase per line (spaces allowed in the phrase, e.g. `HELLO WORLD`). See [Sherpa docs — customize keywords (GigaSpeech)](https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html#customize-your-own-keywords).

Other modeling units (e.g. Chinese phone + pinyin) use different `--tokens-type` and lexicon flags — follow the section for **your** pretrained family on the same docs page.

### Keyword file and app provisioning (`keywordAssetKey`)

- **`keywordAssetKey`** names a file resolved **relative to the model bundle directory** when it is a simple filename (e.g. `keywords.txt`). The preset files shipped with the default bundle (e.g. `keywords-hello-world.txt`) follow the same rule: set `keywordAssetKey` to that filename.
- **Bare React Native:** copy your bundle directory and keyword file into the iOS app resource / Android `assets` tree as your scaffold requires; see `docs/bare-react-native-setup.md` (**Built-In Sherpa Asset Model** / custom asset keys).
- **Expo:** custom ONNX trees must appear in the generated native project at prebuild time. Use `docs/expo-setup.md` and the package config plugin / `src/expo/withBundledAssets.ts` (manifest + copied files) as the reference for how bundled Sherpa assets are provisioned today — mirror that pattern for your own bundle root and keyword file.

## Integration (`initialize`)

`WakeWordEngineConfiguration` is defined in `src/public/types.ts`. Minimal patterns:

### iOS — absolute path to bundle on disk

Use a real absolute path on device or simulator (the path below is **illustrative only**):

```typescript
await initialize({
  engineConfig: {
    assetKeys: {
      modelAssetKey:
        '/var/mobile/Containers/Data/Application/<APP_UUID>/Documents/my-kws-bundle',
      keywordAssetKey: 'keywords.txt',
    },
    sensitivity: 0.5,
  },
});
```

If `keywordAssetKey` is a simple filename, it is resolved **inside** the model directory. If it contains `/`, resolution follows native rules in `SherpaOnnxAssetLoader.mm`.

### Android — assets-relative bundle

Copy `my-kws-bundle/` under `android/app/src/main/assets/` (nested paths allowed). Example:

```typescript
await initialize({
  engineConfig: {
    assetKeys: {
      modelAssetKey: 'my-kws-bundle',
      keywordAssetKey: 'keywords.txt',
    },
    sensitivity: 0.5,
  },
});
```

Expo prebuild: use the config plugin / asset copying patterns described in `docs/expo-setup.md` and `src/expo/withBundledAssets.ts` so the ONNX directory and keyword file land in the generated native project.

## Evaluation checklist (before shipping)

1. **Offline:** Validation TPR/FPR, confusion with negative audio, per-keyword stats.
2. **Desktop Sherpa-ONNX:** Run `sherpa-onnx-keyword-spotter` (see upstream docs) with your three ONNX paths, `tokens.txt`, and `keywords.txt` on recorded WAV files.
3. **On device:** Install the bundle, run detection in the **example app** or your host app; sweep `engineConfig.sensitivity` (maps to native keyword threshold — see `SherpaThresholdFromSensitivity` in `SherpaOnnxDetector.mm` / Android counterpart).
4. **Noise:** Re-test in gym / street / car cabin; log false accepts per hour for a fixed session length.
5. **Regression:** Confirm default built-in path still works if you keep both bundled and custom models in the same app.

## Verification gate (maintainer)

Before treating this documentation as “release complete” for your team, run **one** end-to-end cycle: train or fine-tune → export → generate `keywords.txt` → load on a **physical** iOS or Android device through `initialize({ engineConfig })` and record commit hash, model ID, and device OS in your story or internal release notes. This repository’s **shipped** default bundle under `ios/Assets/SherpaOnnxKws/…` and `android/src/main/assets/voice-activator-sherpa-onnx/…` demonstrates the same on-disk layout the loaders expect.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Native error about missing encoder/decoder/joiner | Filenames vs [ONNX filename rules](#onnx-filename-rules-this-repo); all three present in the same directory |
| Keywords never fire | `keywords.txt` line format matches modeling unit (BPE vs phone); regenerate with `text2token` from the **same** `tokens.txt` / `bpe.model` as the model |
| Android `IllegalArgumentException` on custom path | Do not use absolute or `file://` keys — use assets-relative paths only |
| Poor FPR | More negative data, augmentation, threshold / `sensitivity` tuning |

## Need help?

Training a custom wake word involves Icefall, Lhotse data prep, ONNX export, and mobile integration — it's a lot. If you'd rather have someone handle it for you, [professional services are available](../professional-services.md).

## References

- [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx)
- [Sherpa-ONNX KWS pretrained models](https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html)
- [Icefall](https://github.com/k2-fsa/icefall) and [Export to ONNX](https://k2-fsa.github.io/icefall/model-export/export-onnx.html)
- [Icefall PR #1428](https://github.com/k2-fsa/icefall/pull/1428) (GigaSpeech English KWS — upstream pointer)
