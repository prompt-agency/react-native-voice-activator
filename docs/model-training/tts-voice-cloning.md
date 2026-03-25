# TTS voice training (Piper ONNX for `CustomTTSAdapter`)

This guide is for **teams that need a custom on-device voice** compatible with this package’s built-in **`CustomTTSAdapter`**. Training and export run **offline** on a workstation or CI; the mobile app loads a local `.onnx` file and supplies a matching **`phonemize`** implementation.

## Prerequisites

- **Python 3.10+** (match the Piper branch you use) and a virtual environment.
- **[Piper](https://github.com/rhasspy/piper)** source checkout — follow upstream [`TRAINING.md`](https://github.com/rhasspy/piper/blob/master/TRAINING.md) for the exact install steps (`cd piper/src/python`, `pip install -e .`, run `build_monotonic_align.sh` where required).
- **[espeak-ng](https://github.com/espeak-ng/espeak-ng/)** on the training machine (Piper preprocess uses espeak phonemes by default).
- **GPU optional but recommended** for fine-tuning (PyTorch + CUDA per Piper docs); CPU training is possible but slow.
- **Disk:** checkpoints and mel caches grow quickly; plan tens of GB for medium/high quality experimentation.

Commands and flags in this doc are **illustrative**. Pin versions to a Piper commit or release you actually run, and re-verify against upstream `TRAINING.md` (last cross-checked: **2026-03-25** against Piper `master` training guide).

## What this package expects (runtime contract)

`CustomTTSAdapter` loads your `.onnx` through `TTSInferenceEngine`, which implements the **Piper TTS ONNX inference path** (VITS export from Piper training):

| ONNX tensor | Role |
|-------------|------|
| `input` | `int64` phoneme IDs, shape `[1, N]` |
| `input_lengths` | `int64` utterance length, shape `[1]` |
| `scales` | `float32` `[noise_scale, length_scale, noise_w]` — the engine uses **`[0.667, 1.0, 0.8]`** (Piper defaults) |
| `sid` | optional `int64` speaker id for **multi-speaker** models |
| `output` | `float32` mono PCM samples |

Implementation reference:

- `src/providers/tts/TTSInferenceEngine.ts`
- `src/providers/tts/CustomTTSAdapter.ts`
- `src/public/types.ts` — `CustomTTSConfig`

**Unsupported without custom native work:** ONNX graphs with different input/output names, dtypes, or tensor layouts (for example generic “any ONNX TTS” or Coqui XTTS exports) are **not** guaranteed to run through this engine.

### Sample rate

Set `CustomTTSConfig.sampleRate` to the rate your model was trained/exported for — **`22050`** is the Piper **medium** / **high** default; **`16000`** for **low** quality configs. A mismatch causes wrong playback speed.

## Planning note: Coqui XTTS vs shipped runtime

The repo planning artifact [`sprint-change-proposal-2026-03-24.md`](../../_bmad-output/planning-artifacts/sprint-change-proposal-2026-03-24.md) (not shipped with the npm package) mentions **Coqui XTTS v2** for voice cloning. **This repository’s inference path is Piper-shaped** (phoneme IDs + scales, as above). There is **no** supported, documented bridge from XTTS to this ONNX contract inside the package. If you need XTTS, plan for a **separate** `TextToSpeechProvider` adapter in your app — do not assume XTTS-exported ONNX drops into `CustomTTSAdapter`.

## Dataset and reference audio

Piper training expects a dataset directory with:

- `metadata.csv` — `|` delimited, **no header**
- `wav/` — audio files

**Single speaker** rows: `id|text` (id matches `wav/<id>.wav`).

**Multi-speaker** rows: `id|speaker|text`.

### Recording hygiene (voice cloning / fine-tune)

For small custom datasets (typical “clone” fine-tunes):

- **5–30+ minutes** of clean speech is a common starting range; more data usually improves robustness.
- **Sample rate:** preprocess with `--sample-rate` matching your target quality (**22050** for medium/high Piper configs).
- **Mono WAV**, consistent mic position, minimal room reverb; normalize loudness before training if clips vary widely.
- **Content diversity:** digits, questions, short commands, domain phrases (e.g. fitness cues) reduce brittle prosody.
- **Noise:** avoid heavy background noise in reference audio; add controlled augmentation only if you know the recipe you use supports it.

See Piper’s dataset layout and `piper_train.preprocess` in upstream [`TRAINING.md`](https://github.com/rhasspy/piper/blob/master/TRAINING.md).

## Training pipeline (Piper-native, primary path)

### 1. Install Piper training (summary)

Follow upstream: system deps, `piper/src/python` venv, `pip install -e .`, `build_monotonic_align.sh`, espeak-ng installed.

### 2. Preprocess

Example **single-speaker**, **22050 Hz** (adjust paths):

```sh
python3 -m piper_train.preprocess \
  --language en-us \
  --input-dir /path/to/dataset_dir/ \
  --output-dir /path/to/training_dir/ \
  --dataset-format ljspeech \
  --single-speaker \
  --sample-rate 22050
```

Multi-speaker: omit `--single-speaker` and use three-column `metadata.csv`.

This produces `config.json`, `dataset.jsonl`, and cached tensors under `training_dir`.

### 3. Fine-tune (recommended)

Download a matching checkpoint from [rhasspy/piper-checkpoints](https://huggingface.co/datasets/rhasspy/piper-checkpoints/tree/main) (same **quality** and **sample rate** as your preprocess). Example pattern from upstream docs:

```sh
python3 -m piper_train \
  --dataset-dir /path/to/training_dir/ \
  --accelerator gpu \
  --devices 1 \
  --batch-size 32 \
  --validation-split 0.0 \
  --num-test-examples 0 \
  --max_epochs 10000 \
  --resume_from_checkpoint /path/to/base/epoch=XXXX-step=YYYYYYY.ckpt \
  --checkpoint-epochs 1 \
  --precision 32
```

Tune `--batch-size`, `--max-phoneme-ids`, and epochs per GPU memory and loss curves (TensorBoard: `loss_disc_all`, `loss_gen_all` — see Piper docs).

### 4. Export to ONNX

```sh
python3 -m piper_train.export_onnx \
  /path/to/best.ckpt \
  /path/to/my-voice.onnx

cp /path/to/training_dir/config.json /path/to/my-voice.onnx.json
```

Keep the `.onnx.json` config next to your tooling; the mobile adapter only needs the **`.onnx`** file path for `modelPath`, but the JSON documents voice metadata for desktop Piper CLI tests.

**Smoke test on desktop** (optional):

```sh
echo 'This is a test.' | piper -m /path/to/my-voice.onnx --output_file /tmp/test.wav
```

If Piper CLI fails, fix export before mobile integration.

## Optional: quantization (smaller mobile artifact)

Post-export **dynamic quantization** can shrink `.onnx` at some quality cost. VITS / Piper graphs sometimes **fail** to quantize or produce heavy quality loss—treat the snippet below as experimental; fall back to FP32 if anything looks wrong.

Example pattern (Python, `onnxruntime` installed):

```python
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    model_input="my-voice.onnx",
    model_output="my-voice.int8.onnx",
    weight_type=QuantType.QUInt8,
)
```

**Rules:**

- **Always** listen on device after quantization; garbled or metallic audio means revert to FP32 or try a milder recipe.
- **Validate** with `onnxruntime-react-native` on a **physical** device — desktop ORT success does not guarantee identical mobile behavior.
- Treat size numbers (e.g. “~300 MB → ~80–100 MB”) as **hypotheses** until measured on **your** checkpoint.

Reference: [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html).

## Phonemize contract (application code)

`CustomTTSConfig` requires **`phonemize: (text) => BigInt64Array`**. IDs must match the **same phoneme inventory** the model was trained with (espeak-ng voice / language alignment).

- Use **`piper-phonemize`** or an app-embedded phonemizer consistent with your `config.json` / training language.
- **Do not** mix a phonemizer trained for a different table (e.g. wrong language or alphabet) — output will be silent or garbage audio.
- Multi-speaker models: pass `speakerId` in `CustomTTSConfig` aligned with Piper `speaker_id_map`.

See also: `docs/examples/custom-tts-provider.md`.

## Integration (`CustomTTSAdapter`)

```typescript
import {
  initialize,
  CustomTTSAdapter,
} from 'react-native-voice-activator';

const ttsProvider = new CustomTTSAdapter({
  modelPath: '/absolute/path/to/my-voice.onnx',
  sampleRate: 22050,
  // speakerId: 0, // only for multi-speaker Piper checkpoints
  phonemize: async (text: string) => {
    const ids = await myPhonemizer.textToIds(text);
    return new BigInt64Array(ids);
  },
});

await initialize({ ttsProvider /* , sttProvider, ... */ });
```

- **`modelPath`:** absolute path on device (download to `DocumentDirectory` / cache, or resolve bundled asset to a filesystem path per your app).
- **`onnxruntime-react-native`:** optional peer dependency — install per `docs/examples/custom-tts-provider.md`.

## Evaluation checklist (before shipping a voice)

- [ ] Short and long utterances sound natural; no truncation at max phoneme length.
- [ ] `adapter.stop()` mid-utterance stops promptly (barge-in path).
- [ ] Cold load: first `speak()` after app start meets your product latency budget.
- [ ] Memory: model size + ORT session fits target devices (watch low-RAM Android).
- [ ] **Execution providers:** `CustomTTSAdapter` calls `ttsInferenceEngine.loadModel(modelPath)` with **no** custom `executionProviders`, so TTS inference uses the engine default (**CPU**). Silero VAD may use CoreML/NNAPI separately; do not assume TTS shares that path unless you extend the adapter.

### Maintainer device gate

Before you treat this playbook as release-signed-off, load **one** real `.onnx` (your export or a [prebuilt Piper voice](https://huggingface.co/rhasspy/piper-voices)) on a **physical** iOS or Android device with matching `phonemize`, run `speak()`, and record device OS + model source in your release notes.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| ONNX load error | Wrong file, corrupt export, or incompatible graph |
| Fast/slow speech | `sampleRate` mismatch vs model |
| Noise / wrong timbre | Quantization too aggressive or wrong checkpoint resume |
| Silent audio | `phonemize` IDs out of range or wrong phoneme table |
| Crash in ORT | Unsupported ops in quantized graph for mobile ORT build |

## References

- [rhasspy/piper](https://github.com/rhasspy/piper)
- [Piper TRAINING.md](https://github.com/rhasspy/piper/blob/master/TRAINING.md)
- [Piper voices / releases](https://huggingface.co/rhasspy/piper-voices) — prebuilt `.onnx` for smoke-testing `modelPath` wiring
- [piper-phonemize](https://github.com/rhasspy/piper-phonemize)
- [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)
- `docs/examples/custom-tts-provider.md`
