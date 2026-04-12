/**
 * amy-tts-utils.ts
 *
 * Utilities for the en_US-amy-medium Piper TTS voice:
 *   - ensureAmyModel(): download model to device cache on first use
 *   - phonemize(text): convert English text to Piper phoneme ID BigInt64Array
 *
 * The phonemize implementation uses:
 *   1. A word-level lookup dictionary for common English words
 *   2. A simple G2P rule set for unknown words (digraphs + per-letter fallback)
 *
 * This is sufficient for demo sentences. For production, replace with
 * a proper espeak-ng binding or server-side phonemizer.
 */

import RNFS from 'react-native-fs';

// ─── Model download ───────────────────────────────────────────────────────────

const HF_BASE =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/low';
const MODEL_FILENAME = 'en_US-ryan-low.onnx';
const MODEL_DIR_NAME = 'piper-tts';

// Minimum expected size for a valid Piper low ONNX model (~15 MB).
// Anything smaller is a failed/partial download (e.g. an HTML redirect page).
const MIN_MODEL_BYTES = 5_000_000; // 5 MB lower bound

/** Download the Amy medium model to DocumentDirectory/piper-tts/ if not cached.
 *  Returns the absolute path to the .onnx file.
 *  Throws a descriptive Error if the download fails or produces a corrupt file. */
export async function ensureAmyModel(
  onProgress?: (message: string, progress?: number) => void
): Promise<string> {
  const dir = `${RNFS.DocumentDirectoryPath}/${MODEL_DIR_NAME}`;
  await RNFS.mkdir(dir);
  const modelPath = `${dir}/${MODEL_FILENAME}`;

  // Check for a previously cached valid file
  if (await RNFS.exists(modelPath)) {
    const stat = await RNFS.stat(modelPath);
    if (Number(stat.size) >= MIN_MODEL_BYTES) {
      return modelPath; // already downloaded and valid
    }
    // Cached file is too small (partial/corrupt) — delete and re-download
    console.warn(
      `[AmyTTS] Cached model too small (${stat.size} bytes), re-downloading…`
    );
    await RNFS.unlink(modelPath);
  }

  onProgress?.('Downloading Amy TTS model…', 0);
  const url = `${HF_BASE}/${MODEL_FILENAME}`;

  let result: { statusCode: number; bytesWritten: number };
  try {
    result = await RNFS.downloadFile({
      fromUrl: url,
      toFile: modelPath,
      headers: { 'User-Agent': 'react-native-voice-activator/1.0' },
      progress: (res) => {
        if (res.contentLength > 0) {
          const pct = Math.round((res.bytesWritten / res.contentLength) * 100);
          onProgress?.('Downloading Amy TTS model…', pct);
        }
      },
    }).promise;
  } catch (e) {
    // Clean up any partial file on error
    await RNFS.exists(modelPath).then((exists) =>
      exists ? RNFS.unlink(modelPath) : Promise.resolve()
    );
    throw new Error(`Amy TTS model download error: ${e}`);
  }

  if (result.statusCode !== 200) {
    await RNFS.exists(modelPath).then((exists) =>
      exists ? RNFS.unlink(modelPath) : Promise.resolve()
    );
    throw new Error(
      `Amy TTS model download failed: HTTP ${result.statusCode}. Check network connection.`
    );
  }

  // Final size check — catches HTML redirect pages stored as .onnx
  if (result.bytesWritten < MIN_MODEL_BYTES) {
    await RNFS.unlink(modelPath);
    throw new Error(
      `Amy TTS model download produced an unexpected file ` +
        `(${result.bytesWritten} bytes, expected ≥${MIN_MODEL_BYTES}). ` +
        `This usually means the download URL redirected to an HTML page. ` +
        `Try again on a different network.`
    );
  }

  return modelPath;
}

// ─── Phoneme ID map ────────────────────────────────────────────────────────────
// Hardcoded from en_US-amy-medium.onnx.json — phoneme_id_map.
// These are espeak IPA characters → integer IDs.

const P: Record<string, number> = {
  _: 0,  '^': 1, $: 2,  ' ': 3,  '!': 4,  "'": 5,
  ',': 8, '-': 9, '.': 10, ':': 11, ';': 12, '?': 13,
  a: 14, b: 15, c: 16, d: 17, e: 18, f: 19, h: 20,
  i: 21, j: 22, k: 23, l: 24, m: 25, n: 26, o: 27,
  p: 28, q: 29, r: 30, s: 31, t: 32, u: 33, v: 34,
  w: 35, x: 36, y: 37, z: 38,
  æ: 39, ç: 40, ð: 41, ø: 42, ŋ: 44,
  ɐ: 50, ɑ: 51, ɒ: 52, ɔ: 54,
  ə: 59, ɚ: 60, ɛ: 61, ɜ: 62,
  ɡ: 66, ɣ: 68,
  ɪ: 74, ɫ: 75,
  ɹ: 88,
  ʃ: 96,
  ʊ: 100, ʋ: 101, ʌ: 102,
  ʒ: 108, ʔ: 109,
  ˈ: 120, ˌ: 121, ː: 122,
  β: 125, θ: 126, χ: 127, ᵻ: 128,
};

// ─── Word dictionary ───────────────────────────────────────────────────────────
// Maps lowercase English words → espeak en-us IPA phoneme strings.
// Characters used must all exist in P above.

const DICT: Record<string, string> = {
  // Articles / determiners
  a: 'ə', the: 'ðə', this: 'ðɪs', that: 'ðæt', these: 'ðiːz', those: 'ðoʊz',
  an: 'æn', my: 'mˈaɪ', your: 'jˈɔːɹ', our: 'ˈaʊɹ', its: 'ɪts',

  // Common verbs
  is: 'ɪz', are: 'ɑːɹ', was: 'wɑz', were: 'wɜːɹ',
  be: 'biː', been: 'bɪn', have: 'hæv', has: 'hæz',
  do: 'duː', does: 'dʌz', did: 'dɪd',
  can: 'kæn', will: 'wɪl', would: 'wʊd', could: 'kʊd', should: 'ʃʊd',
  get: 'ɡˈɛt', got: 'ɡɑt', go: 'ɡoʊ', going: 'ɡoʊɪŋ',
  say: 'sˈeɪ', said: 'sɛd', use: 'jˈuːz', used: 'juːzd',
  start: 'stˈɑːɹt', stop: 'stˈɑp', play: 'plˈeɪ', work: 'wˈɜːk',
  listen: 'lˈɪsən', speak: 'spˈiːk', record: 'ɹɪkˈɔːɹd', transcribe: 'tɹænskɹˈaɪb',

  // Common nouns
  voice: 'vˈɔɪs', speech: 'spˈiːtʃ', text: 'tˈɛkst', word: 'wˈɜːd',
  model: 'mˈɑːdəl', app: 'ˈæp', test: 'tˈɛst', time: 'tˈaɪm',
  system: 'sˈɪstəm', device: 'dɪvˈaɪs', phone: 'foʊn',

  // Greetings / social
  hello: 'həˈloʊ', hi: 'hˈaɪ', hey: 'hˈeɪ', bye: 'bˈaɪ', goodbye: 'ɡʊdbˈaɪ',
  yes: 'jˈɛs', no: 'nˈoʊ', okay: 'oʊkˈeɪ', ok: 'oʊkˈeɪ', sure: 'ʃʊɹ',
  please: 'plˈiːz', thanks: 'θˈæŋks', thank: 'θˈæŋk',

  // Pronouns
  i: 'ˈaɪ', we: 'wiː', you: 'juː', he: 'hiː', she: 'ʃiː', they: 'ðeɪ',
  me: 'miː', us: 'ʌs', him: 'hɪm', her: 'hɜːɹ', them: 'ðɛm', it: 'ɪt',

  // Prepositions / conjunctions
  in: 'ɪn', on: 'ˈɑn', at: 'æt', to: 'tə', of: 'əv', for: 'fəɹ',
  with: 'wɪð', from: 'fɹʌm', by: 'bˈaɪ', up: 'ʌp', out: 'ˈaʊt',
  and: 'ænd', or: 'ɔːɹ', but: 'bʌt', not: 'nˈɑt', so: 'soʊ',

  // Adjectives
  good: 'ɡˈʊd', great: 'ɡɹˈeɪt', new: 'njuː', first: 'fˈɜːɹst',
  ready: 'ɹˈɛdi', done: 'dˈʌn', working: 'wˈɜːkɪŋ',

  // Numbers
  one: 'wˈʌn', two: 'tuː', three: 'θɹˈiː', four: 'fˈɔːɹ', five: 'fˈaɪv',
  six: 'sˈɪks', seven: 'sˈɛvən', eight: 'ˈeɪt', nine: 'nˈaɪn', ten: 'tˈɛn',

  // Voice assistant context
  wake: 'wˈeɪk', detection: 'dɪtˈɛkʃən',
  synthesis: 'sˈɪnθəsɪs', recognition: 'ɹɛkəɡnˈɪʃən',
  download: 'daʊnloʊd', loading: 'loʊdɪŋ',

  // Common extras
  world: 'wˈɜːld', here: 'hˈɪɹ', there: 'ðˈɛɹ', now: 'nˈaʊ', how: 'hˈaʊ',
  what: 'wˈʌt', when: 'wˈɛn', where: 'wˈɛɹ', why: 'wˈaɪ', who: 'huː',
  help: 'hˈɛlp', try: 'tɹˈaɪ', make: 'mˈeɪk', take: 'tˈeɪk',
  just: 'dʒˈʌst', like: 'lˈaɪk', know: 'nˈoʊ', think: 'θˈɪŋk',
  see: 'siː', look: 'lˈʊk', need: 'niːd', want: 'wˈɑnt',
};

// ─── Simple G2P fallback ───────────────────────────────────────────────────────
// For words not in DICT: digraphs first, then per-letter mapping.

const DIGRAPH: Array<[string, string]> = [
  ['th', 'θ'], ['sh', 'ʃ'], ['ch', 'tʃ'], ['ng', 'ŋ'], ['ph', 'f'],
  ['wh', 'w'], ['ck', 'k'], ['qu', 'kw'], ['gh', ''],
];

const LETTER_MAP: Record<string, string> = {
  a: 'æ', b: 'b', c: 'k', d: 'd', e: 'ɛ',
  f: 'f', g: 'ɡ', h: 'h', i: 'ɪ', j: 'dʒ',
  k: 'k', l: 'l', m: 'm', n: 'n', o: 'ɑ',
  p: 'p', q: 'k', r: 'ɹ', s: 's', t: 't',
  u: 'ʌ', v: 'v', w: 'w', x: 'ks', y: 'j', z: 'z',
};

function simpleG2P(word: string): string {
  let result = '';
  let i = 0;
  const w = word.toLowerCase();
  while (i < w.length) {
    let matched = false;
    for (const [digraph, ipa] of DIGRAPH) {
      if (w.startsWith(digraph, i)) {
        result += ipa;
        i += digraph.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result += LETTER_MAP[w[i]!] ?? '';
      i++;
    }
  }
  return result;
}

// ─── wordToPhonemes ────────────────────────────────────────────────────────────

function wordToPhonemes(word: string): string {
  const lower = word.toLowerCase();
  return DICT[lower] ?? simpleG2P(lower);
}

// ─── phonemize ────────────────────────────────────────────────────────────────

/**
 * Convert English text to a Piper-compatible phoneme ID BigInt64Array.
 *
 * Format: [1(^), ...phoneme_ids..., 2($)]
 * Words are separated by space token (3).
 * Punctuation is mapped where possible; unknown characters are skipped.
 */
export function phonemize(text: string): BigInt64Array {
  // Normalize and tokenize into words + punctuation tokens
  const normalized = text
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .trim();

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const ids: number[] = [1]; // ^ start

  for (let ti = 0; ti < tokens.length; ti++) {
    if (ti > 0) ids.push(3); // space between words

    const token = tokens[ti]!;
    // Split trailing punctuation from word
    const match = token.match(/^([a-zA-Z'-]*)([^a-zA-Z]*)$/);
    const wordPart = match?.[1] ?? '';
    const punctPart = match?.[2] ?? '';

    if (wordPart) {
      const phonemeStr = wordToPhonemes(wordPart.replace(/['-]/g, ''));
      for (const ch of phonemeStr) {
        const id = P[ch];
        if (id !== undefined) ids.push(id);
      }
    }

    // Map trailing punctuation
    for (const ch of punctPart) {
      const id = P[ch];
      if (id !== undefined) ids.push(id);
    }
  }

  ids.push(2); // $ end
  return BigInt64Array.from(ids.map(BigInt));
}
