/**
 * Arbitrary wake phrases, without training a model.
 *
 * The bundled Sherpa-ONNX keyword spotter is open-vocabulary: it detects phrases
 * that were never in its training data. A keywords file normally holds
 * pre-tokenized BPE output, which is why the nine bundled presets look like
 * `▁HE LL O ▁WORLD`. But `simple-sentencepiece` is statically linked into the
 * native library, so setting `modeling_unit = "bpe"` and `bpe_vocab` to the
 * `bpe.model` already in the model bundle lets the native side tokenize plain
 * text itself.
 *
 * So a custom wake phrase costs one generated text file — no GPU, no training
 * run, no per-keyword model. This module produces that file.
 */

export interface WakePhraseValidationIssue {
  phrase: string;
  reason: string;
}

export class WakePhraseError extends Error {
  constructor(
    message: string,
    readonly issues: WakePhraseValidationIssue[] = []
  ) {
    super(message);
    this.name = 'WakePhraseError';
  }
}

/**
 * Phrases shorter than this are unreliable: a keyword spotter scores a short
 * token sequence against everything else the acoustic model hears, so a
 * one-syllable trigger fires on ordinary speech. Upstream guidance for this
 * class of model is "six or more phonemes"; characters are a crude proxy but a
 * usable floor.
 */
const MIN_PHRASE_CHARACTERS = 6;

/** Longer than this and a user will not say it consistently. */
const MAX_PHRASE_CHARACTERS = 40;

/**
 * Only characters the English BPE vocabulary can represent.
 *
 * Digits and punctuation are rejected rather than silently dropped: "hey acme 2"
 * would tokenize to something that never matches what the user says, which is
 * far harder to debug than an error at configuration time.
 */
const ALLOWED = /^[A-Za-z' ]+$/;

export function normalizeWakePhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Validate and normalize one or more wake phrases.
 *
 * @throws WakePhraseError listing every problem, rather than only the first, so
 *   a caller fixing a config gets the whole picture in one go.
 */
export function normalizeWakePhrases(
  input: string | readonly string[]
): string[] {
  const raw = typeof input === 'string' ? [input] : [...input];

  if (raw.length === 0) {
    throw new WakePhraseError(
      'wakePhrase was empty — supply at least one phrase.'
    );
  }

  const issues: WakePhraseValidationIssue[] = [];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const phrase of raw) {
    if (typeof phrase !== 'string') {
      issues.push({
        phrase: String(phrase),
        reason: 'not a string',
      });
      continue;
    }

    const value = normalizeWakePhrase(phrase);

    if (value.length === 0) {
      issues.push({ phrase, reason: 'empty after trimming' });
      continue;
    }

    if (!ALLOWED.test(value)) {
      issues.push({
        phrase,
        reason:
          'contains characters outside A-Z, apostrophe and space. Digits and ' +
          'punctuation cannot be tokenized reliably — spell them out ' +
          '("hey acme two", not "hey acme 2")',
      });
      continue;
    }

    if (value.replace(/[^A-Z]/g, '').length < MIN_PHRASE_CHARACTERS) {
      issues.push({
        phrase,
        reason:
          `shorter than ${MIN_PHRASE_CHARACTERS} letters. Short phrases false-trigger ` +
          'on ordinary speech; prefer two or more distinct words',
      });
      continue;
    }

    if (value.length > MAX_PHRASE_CHARACTERS) {
      issues.push({
        phrase,
        reason: `longer than ${MAX_PHRASE_CHARACTERS} characters`,
      });
      continue;
    }

    if (seen.has(value)) {
      // Duplicates are dropped rather than rejected: two spellings of the same
      // phrase is a harmless mistake, and a duplicate keyword line would just
      // waste a decoding path.
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  if (issues.length > 0) {
    const detail = issues
      .map((issue) => `  "${issue.phrase}" — ${issue.reason}`)
      .join('\n');
    throw new WakePhraseError(
      `Invalid wakePhrase value${issues.length > 1 ? 's' : ''}:\n${detail}`,
      issues
    );
  }

  return normalized;
}

/**
 * Body of the keywords file sherpa-onnx reads: one phrase per line.
 *
 * With `modeling_unit = "bpe"` the native side tokenizes each line, so this is
 * plain text rather than the pre-tokenized form the bundled presets use.
 */
export function buildKeywordsFileContents(phrases: readonly string[]): string {
  return `${phrases.join('\n')}\n`;
}

/**
 * Stable file name for a set of phrases.
 *
 * Content-addressed so changing the phrase produces a different file, and
 * re-initialising with the same phrase reuses one. Deliberately not a
 * cryptographic hash — this only needs to avoid collisions between a handful of
 * phrases in one app.
 */
/**
 * A normalized phrase only contains A-Z, apostrophe and space, so NUL cannot
 * appear inside one. Joining on a space would let ['A B', 'C'] and
 * ['A', 'B C'] hash identically.
 */
const SEPARATOR = '\u0000';

export function wakePhraseFileName(phrases: readonly string[]): string {
  const joined = phrases.join(SEPARATOR);

  // FNV-1a, 32-bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  const slug =
    phrases[0]!
      .toLowerCase()
      .replace(/[^a-z]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'phrase';

  return `${slug}-${(hash >>> 0).toString(16).padStart(8, '0')}.txt`;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

type RNFS = typeof import('react-native-fs');

let cachedRnfs: RNFS | null = null;

async function loadRnfs(): Promise<RNFS> {
  if (cachedRnfs) return cachedRnfs;
  try {
    cachedRnfs = (await import('react-native-fs')) as RNFS;
  } catch (cause) {
    throw new WakePhraseError(
      'react-native-fs is required to use wakePhrase, because the generated ' +
        'keywords file is written to app storage. Install it, or generate the ' +
        'keywords file yourself and pass engineConfig.assetKeys.keywordAssetKey.',
      [{ phrase: '(all)', reason: String(cause) }]
    );
  }
  return cachedRnfs;
}

export interface WakePhraseKeywordsFile {
  /** Absolute path to pass as keywordAssetKey. */
  path: string;
  /** Normalized phrases the file contains. */
  phrases: string[];
}

/**
 * Write (or reuse) the keywords file for a set of phrases.
 *
 * Content-addressed, so re-initialising with the same phrase is a no-op beyond a
 * stat, and changing the phrase never reuses a stale file. Written next to the
 * model bundle so clearing app storage clears both together.
 */
export async function writeWakePhraseKeywords(
  input: string | readonly string[],
  baseDirectory: string
): Promise<WakePhraseKeywordsFile> {
  const phrases = normalizeWakePhrases(input);
  const rnfs = await loadRnfs();

  const directory = `${baseDirectory}/generated-keywords`;
  const path = `${directory}/${wakePhraseFileName(phrases)}`;
  const contents = buildKeywordsFileContents(phrases);

  // Reuse only when the contents match: a file whose name collided, or that was
  // truncated, must be rewritten rather than trusted.
  try {
    const existing = await rnfs.readFile(path, 'utf8');
    if (existing === contents) {
      return { path, phrases };
    }
  } catch {
    /* not written yet, or unreadable — fall through and write it */
  }

  await rnfs.mkdir(directory);
  await rnfs.writeFile(path, contents, 'utf8');

  return { path, phrases };
}

/** @internal Test seam for the lazily-imported peer. */
export function __resetWakePhraseForTests(): void {
  cachedRnfs = null;
}
