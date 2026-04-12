/**
 * sherpa-tts-utils.ts
 *
 * Downloads and caches the asset files needed by SherpaOnnxTTSAdapter
 * for the en_US-ryan-low Piper voice model:
 *
 *   1. en_US-ryan-low.onnx  (~63 MB)  — the VITS model weights
 *   2. tokens.txt            (~1 KB)   — espeak-ng phoneme symbol list
 *   3. espeak-ng-data/                 — phoneme data dir (from app bundle or
 *                                        sherpa-onnx GitHub releases)
 *
 * All assets land in DocumentDirectory/sherpa-tts/ and are cached across
 * app launches.
 */

import RNFS from 'react-native-fs';

// ─── Constants ────────────────────────────────────────────────────────────────

const DIR_NAME = 'sherpa-tts';
const MODEL_FILENAME = 'en_US-ryan-low.onnx';
const MODEL_JSON_FILENAME = 'en_US-ryan-low.onnx.json';
const TOKENS_FILENAME = 'tokens.txt';

// HuggingFace URL for the ryan-low model (same source as CustomTTSAdapter demo)
const HF_BASE =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/low';

// Minimum size for a valid Piper model file (~63 MB expected)
const MIN_MODEL_BYTES = 5_000_000; // 5 MB lower bound

// ─── Embedded tokens.txt ──────────────────────────────────────────────────────
// Standard espeak-ng phoneme symbol list used by all en_US Piper models.
// Source: sherpa-onnx Piper model releases (same across all en_US voices).
// One token per line; line number is the token ID.

const TOKENS_CONTENT = `_ 0
^ 1
$ 2
  3
! 4
' 5
( 6
) 7
, 8
- 9
. 10
: 11
; 12
? 13
a 14
b 15
c 16
d 17
e 18
f 19
h 20
i 21
j 22
k 23
l 24
m 25
n 26
o 27
p 28
q 29
r 30
s 31
t 32
u 33
v 34
w 35
x 36
y 37
z 38
æ 39
ç 40
ð 41
ø 42
ħ 43
ŋ 44
œ 45
ǀ 46
ǁ 47
ǂ 48
ǃ 49
ɐ 50
ɑ 51
ɒ 52
ɓ 53
ɔ 54
ɕ 55
ɖ 56
ɗ 57
ɘ 58
ə 59
ɚ 60
ɛ 61
ɜ 62
ɞ 63
ɟ 64
ɠ 65
ɡ 66
ɢ 67
ɣ 68
ɤ 69
ɥ 70
ɦ 71
ɧ 72
ɨ 73
ɪ 74
ɫ 75
ɬ 76
ɭ 77
ɮ 78
ɯ 79
ɰ 80
ɱ 81
ɲ 82
ɳ 83
ɴ 84
ɵ 85
ɶ 86
ɸ 87
ɹ 88
ɺ 89
ɻ 90
ɽ 91
ɾ 92
ʀ 93
ʁ 94
ʂ 95
ʃ 96
ʄ 97
ʈ 98
ʉ 99
ʊ 100
ʋ 101
ʌ 102
ʍ 103
ʎ 104
ʏ 105
ʐ 106
ʑ 107
ʒ 108
ʔ 109
ʕ 110
ʘ 111
ʙ 112
ʛ 113
ʜ 114
ʝ 115
ʟ 116
ʡ 117
ʢ 118
ʲ 119
ˈ 120
ˌ 121
ː 122
ˑ 123
˞ 124
β 125
θ 126
χ 127
ᵻ 128
ⱱ 129
`;

// ─── Asset paths ─────────────────────────────────────────────────────────────

export type SherpaAssets = {
  modelPath: string;
  tokensPath: string;
  /** Path to espeak-ng-data/ directory. May be inside the app bundle. */
  dataDir: string;
};

// ─── ensureRyanSherpaAssets ───────────────────────────────────────────────────

/**
 * Ensure all three assets required by SherpaOnnxTTSAdapter are present on
 * device and return their absolute paths.
 *
 * @param onProgress  Optional callback for progress messages and percent (0–100)
 */
export async function ensureRyanSherpaAssets(
  onProgress?: (message: string, progress?: number) => void
): Promise<SherpaAssets> {
  const dir = `${RNFS.DocumentDirectoryPath}/${DIR_NAME}`;
  await RNFS.mkdir(dir);

  // ── Model ──────────────────────────────────────────────────────────────────
  // Priority:
  //   1. App bundle (added via setup-sherpa-tts.sh + Xcode) — sherpa-onnx build
  //      with required ONNX metadata. This is the ONLY reliable source.
  //   2. Cached in Documents — only reused if bundled model is absent AND the
  //      cached file is large enough (may still lack metadata and crash).
  //
  // WARNING: The rhasspy/piper-voices HuggingFace release does NOT include
  // the sherpa-onnx ONNX metadata (sample_rate etc.) required by this library.
  // sherpa-onnx will call exit(-1) if sample_rate is missing. Always use the
  // model from the sherpa-onnx tarball (setup-sherpa-tts.sh handles this).

  const bundleModelPath = `${RNFS.MainBundlePath}/${MODEL_FILENAME}`;
  const docModelPath = `${dir}/${MODEL_FILENAME}`;

  let modelPath: string;

  if (await RNFS.exists(bundleModelPath)) {
    // Use bundled sherpa-onnx model (has correct metadata)
    modelPath = bundleModelPath;
  } else {
    // Fall back to cached Documents copy — re-download if missing or too small
    const docExists = await RNFS.exists(docModelPath);
    if (docExists) {
      const stat = await RNFS.stat(docModelPath);
      if (Number(stat.size) < MIN_MODEL_BYTES) {
        console.warn('[SherpaAssets] Cached model too small, re-downloading…');
        await RNFS.unlink(docModelPath);
      }
    }

    if (!(await RNFS.exists(docModelPath))) {
      console.warn(
        '[SherpaAssets] Bundle model not found — downloading from HuggingFace.\n' +
          'WARNING: rhasspy/piper-voices models lack sherpa-onnx metadata and will\n' +
          'crash at runtime. Run example/scripts/setup-sherpa-tts.sh and add\n' +
          'en_US-ryan-low.onnx to Xcode bundle resources to fix this.'
      );
      onProgress?.('Downloading ryan-low model…', 0);
      const url = `${HF_BASE}/${MODEL_FILENAME}`;
      const result = await RNFS.downloadFile({
        fromUrl: url,
        toFile: docModelPath,
        headers: { 'User-Agent': 'react-native-voice-activator/1.0' },
        progress: (res) => {
          if (res.contentLength > 0) {
            const pct = Math.round((res.bytesWritten / res.contentLength) * 100);
            onProgress?.('Downloading ryan-low model…', pct);
          }
        },
      }).promise;

      if (result.statusCode !== 200 || result.bytesWritten < MIN_MODEL_BYTES) {
        await RNFS.exists(docModelPath).then((e) =>
          e ? RNFS.unlink(docModelPath) : Promise.resolve()
        );
        throw new Error(
          `Model download failed (HTTP ${result.statusCode}, ${result.bytesWritten} bytes). ` +
            'Check your network connection.'
        );
      }
    }
    modelPath = docModelPath;
  }

  // ── Model JSON config ───────────────────────────────────────────────────────
  // sherpa-onnx Piper loader reads <model>.onnx.json (sample rate, num_speakers)
  // from the same directory as the .onnx file.
  const modelJsonPath = `${dir}/${MODEL_JSON_FILENAME}`;
  if (!(await RNFS.exists(modelJsonPath))) {
    onProgress?.('Downloading model config…');
    const jsonResult = await RNFS.downloadFile({
      fromUrl: `${HF_BASE}/${MODEL_JSON_FILENAME}`,
      toFile: modelJsonPath,
      headers: { 'User-Agent': 'react-native-voice-activator/1.0' },
    }).promise;
    if (jsonResult.statusCode !== 200 || jsonResult.bytesWritten < 100) {
      await RNFS.exists(modelJsonPath).then((e) =>
        e ? RNFS.unlink(modelJsonPath) : Promise.resolve()
      );
      throw new Error(
        `Model JSON config download failed (HTTP ${jsonResult.statusCode}). ` +
          'Check your network connection.'
      );
    }
  }

  // ── tokens.txt ─────────────────────────────────────────────────────────────
  // Priority:
  //   1. App bundle piper-tokens.txt (added via setup-sherpa-tts.sh + Xcode)
  //   2. Previously written file in Documents
  //   3. Embedded fallback constant (written to Documents)
  const bundleTokens = `${RNFS.MainBundlePath}/piper-tokens.txt`;
  const docTokens = `${dir}/${TOKENS_FILENAME}`;

  let tokensPath: string;
  if (await RNFS.exists(bundleTokens)) {
    tokensPath = bundleTokens;
  } else {
    // Write (or rewrite) tokens.txt if it's missing or in the old format
    // (old format had tokens only, no IDs — e.g. "_\n^\n$\n…")
    let needsWrite = !(await RNFS.exists(docTokens));
    if (!needsWrite) {
      const firstLine = await RNFS.readFile(docTokens, 'utf8').then(
        (c) => c.split('\n')[0] ?? ''
      );
      if (!firstLine.includes(' ')) {
        console.warn('[SherpaAssets] tokens.txt is old format, rewriting…');
        needsWrite = true;
      }
    }
    if (needsWrite) {
      onProgress?.('Writing tokens.txt…');
      await RNFS.writeFile(docTokens, TOKENS_CONTENT, 'utf8');
    }
    tokensPath = docTokens;
  }

  // ── espeak-ng-data ─────────────────────────────────────────────────────────
  // Required by sherpa-onnx for espeak-ng text normalisation.
  // Priority:
  //   1. App bundle  → added via example/scripts/setup-sherpa-tts.sh + Xcode
  //   2. Documents   → manually extracted to DocumentDirectory/sherpa-tts/espeak-ng-data
  //
  // To set up: run `bash example/scripts/setup-sherpa-tts.sh` then add the
  // generated espeak-ng-data/ folder to Xcode → Copy Bundle Resources.
  const bundleDataDir = `${RNFS.MainBundlePath}/espeak-ng-data`;
  const downloadedDataDir = `${dir}/espeak-ng-data`;

  let dataDir: string;
  if (await RNFS.exists(bundleDataDir)) {
    dataDir = bundleDataDir;
  } else if (await RNFS.exists(downloadedDataDir)) {
    dataDir = downloadedDataDir;
  } else {
    console.warn(
      '[SherpaAssets] espeak-ng-data not found.\n' +
        'Run: bash example/scripts/setup-sherpa-tts.sh\n' +
        'Then add espeak-ng-data/ to Xcode → Copy Bundle Resources and rebuild.'
    );
    dataDir = downloadedDataDir; // native layer will report a clear error
  }

  return { modelPath, tokensPath, dataDir };
}
