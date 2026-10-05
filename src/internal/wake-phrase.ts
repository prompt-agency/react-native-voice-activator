/**
 * Arbitrary wake phrases, without training a model.
 *
 * The bundled Sherpa-ONNX keyword spotter is open-vocabulary: it detects phrases
 * that were never in its training data. What it needs is a keywords file of
 * pre-tokenized vocabulary pieces, which is why the nine bundled presets look
 * like `▁HE LL O ▁WORLD`. This module validates a phrase, tokenizes it through
 * keyword-tokenizer.ts, and writes that file.
 *
 * So a custom wake phrase costs one generated text file: no GPU, no training
 * run, no per-keyword model.
 *
 * Earlier versions wrote plain text and asked the native side to tokenize it by
 * setting `modeling_unit = "bpe"`. That does not work, and sherpa-onnx answers
 * an untokenized line by calling exit(-1), which kills the host app with no
 * crash report and nothing on the JS error path. See
 * https://github.com/prompt-agency/react-native-voice-activator/issues/31.
 */

import { encodeKeywordPhrase } from './keyword-tokenizer';

export interface WakePhraseValidationIssue {
  phrase: string;
  reason: string;
}

/**
 * The model bundle on disk does not share the vocabulary this package tokenizes
 * against, so at least one generated token is absent from its `tokens.txt`.
 *
 * Distinct from WakePhraseError because the phrase is fine and the caller's only
 * remedies are different: use the on-demand bundle, or supply a keywords file
 * generated for their own model.
 */
export class WakePhraseModelMismatchError extends Error {
  constructor(
    message: string,
    readonly missingTokens: string[]
  ) {
    super(message);
    this.name = 'WakePhraseModelMismatchError';
  }
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

export interface WakePhraseValidation {
  valid: boolean;
  /** Uppercased, whitespace-collapsed form that would be written to disk. */
  normalized: string | null;
  /** Human-readable reasons, empty when valid. */
  problems: string[];
}

/**
 * Validate a phrase without throwing, for live feedback in a settings UI.
 *
 * `initialize({ wakePhrase })` rejects on an invalid phrase, which is the right
 * behaviour for a programming error but a poor way to drive a text field — an app
 * letting a user choose their own wake word needs to say "too short" as they type,
 * not after a failed initialize.
 */
export function validateWakePhrase(phrase: string): WakePhraseValidation {
  try {
    const [normalized] = normalizeWakePhrases(phrase);
    return { valid: true, normalized: normalized ?? null, problems: [] };
  } catch (cause) {
    if (cause instanceof WakePhraseError) {
      return {
        valid: false,
        normalized: null,
        problems: cause.issues.length
          ? cause.issues.map((issue) => issue.reason)
          : [cause.message],
      };
    }
    throw cause;
  }
}

/**
 * Body of the keywords file sherpa-onnx reads: one pre-tokenized phrase per
 * line, space-separated vocabulary pieces, exactly like the bundled presets.
 *
 * @throws KeywordTokenizerError if a phrase cannot be tokenized. Callers pass
 *   normalized phrases, for which this is unreachable, so an exception here is
 *   a programming error rather than bad user input.
 * @throws WakePhraseError if the phrase list is empty, for the same reason: the
 *   only alternative output would be a file holding one blank line.
 */
export function buildKeywordsFileContents(phrases: readonly string[]): string {
  // Guarded explicitly, symmetrically with encodeKeywordPhrase's empty-phrase
  // guard: joining no lines would produce "\n", a keywords file whose only line
  // is blank, and a blank line is exactly what sherpa-onnx answers by calling
  // exit(-1). normalizeWakePhrases makes this unreachable today, but a future
  // caller reaching it must not get a process-killing file.
  if (phrases.length === 0) {
    throw new WakePhraseError(
      'Cannot build a keywords file from an empty phrase list.'
    );
  }

  const lines = phrases.map((phrase) => encodeKeywordPhrase(phrase).join(' '));
  return `${lines.join('\n')}\n`;
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

type RNFS = typeof import('@dr.pogodin/react-native-fs');

let cachedRnfs: RNFS | null = null;

async function loadRnfs(): Promise<RNFS> {
  if (cachedRnfs) return cachedRnfs;
  try {
    cachedRnfs = (await import('@dr.pogodin/react-native-fs')) as RNFS;
  } catch (cause) {
    throw new WakePhraseError(
      '@dr.pogodin/react-native-fs is required to use wakePhrase, because the generated ' +
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
 * Verify the tokens we are about to write against the vocabulary the native
 * detector will actually consult.
 *
 * The tokenizer segments against a table baked from the on-demand bundle's
 * `bpe.model`, but the detector points `tokens` at `<baseDirectory>/tokens.txt`,
 * and an app may pass its own absolute `modelAssetKey`: a fine-tuned or
 * replacement Sherpa-ONNX keyword-spotter bundle has a different vocabulary.
 * Without this check such a mismatch reaches sherpa-onnx's EncodeBase, which
 * calls exit(-1) and kills the host app with no signal, no crash report and
 * nothing on the JS error path. That is issue #31 reproduced:
 * https://github.com/prompt-agency/react-native-voice-activator/issues/31.
 *
 * So the real file is read rather than a proxy for it, which costs one read of a
 * roughly 5 KB file per initialize() that uses wakePhrase.
 */
async function assertTokensAreInModelVocabulary(
  rnfs: RNFS,
  baseDirectory: string,
  phrases: readonly string[],
  contents: string
): Promise<void> {
  const tokensPath = `${baseDirectory}/tokens.txt`;

  let raw: string;
  try {
    raw = await rnfs.readFile(tokensPath, 'utf8');
  } catch {
    // Deliberately skipped, not failed. The on-demand bundle is hash-verified,
    // so its tokens.txt is always present, and the native asset loader already
    // fails with a clean, catchable error when a model file is missing. Blocking
    // on a read error would turn a filesystem hiccup into a hard failure on the
    // known-good path.
    return;
  }

  // One entry per line, "<piece> <id>": the token is everything before the last
  // space, matching how scripts/verify-keyword-vocab.mjs parses the same file.
  const vocabulary = new Set<string>();
  for (const line of raw.split('\n')) {
    if (line.length === 0) continue;
    vocabulary.add(line.slice(0, line.lastIndexOf(' ')));
  }

  const missing: string[] = [];
  for (const token of contents.split(/\s+/)) {
    if (token.length === 0) continue;
    if (!vocabulary.has(token) && !missing.includes(token)) {
      missing.push(token);
    }
  }

  if (missing.length === 0) return;

  const sample = missing.slice(0, 5).join(', ');
  throw new WakePhraseModelMismatchError(
    `The model bundle at ${baseDirectory} has a different vocabulary than the one ` +
      `this package tokenizes wakePhrase against: ${missing.length} token` +
      `${missing.length > 1 ? 's' : ''} of ${phrases.map((phrase) => `"${phrase}"`).join(', ')} ` +
      `${missing.length > 1 ? 'are' : 'is'} missing from its tokens.txt (${sample}). ` +
      'Writing them would make sherpa-onnx terminate the app. Either use the ' +
      'on-demand model bundle, or generate a pre-tokenized keywords file for your ' +
      'own model and pass it as engineConfig.assetKeys.keywordAssetKey instead of ' +
      'wakePhrase.',
    missing
  );
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

  await assertTokensAreInModelVocabulary(
    rnfs,
    baseDirectory,
    phrases,
    contents
  );

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
