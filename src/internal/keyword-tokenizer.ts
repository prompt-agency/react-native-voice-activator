/**
 * Tokenizes a wake phrase the way the keyword spotter's model expects.
 *
 * sherpa-onnx's keywords file holds pre-tokenized output: one line of
 * space-separated vocabulary pieces, which is why the bundled presets look like
 * `▁HE Y ▁S I RI`. Its EncodeBase looks each token up in tokens.txt and, on a
 * miss, calls exit(-1): no signal, no crash report, no catchable error. So the
 * tokenization has to be right before the file is written, and a token outside
 * the vocabulary must never reach it.
 *
 * The model bundle's `bpe.model` is misnamed. Its trainer_spec.model_type is 1
 * (UNIGRAM), not 2 (BPE), so each piece carries a unigram log probability and
 * the correct encoder is Viterbi maximum-score segmentation, not pair merging.
 * Pair merging reproduces only 4 of the 9 bundled presets; Viterbi reproduces
 * all 9 byte-exactly, which is what keyword-tokenizer.test.ts pins.
 *
 * Earlier versions of this package tried to have the native side tokenize plain
 * text by setting `modeling_unit = "bpe"` and `bpe_vocab`. It does not work: see
 * https://github.com/prompt-agency/react-native-voice-activator/issues/31.
 */

import vocabulary from './keyword-vocab.generated.json';

/** SentencePiece's space marker, written escaped so an editor cannot mangle it. */
const SPACE_MARKER = '\u2581';

export class KeywordTokenizerError extends Error {
  constructor(
    message: string,
    readonly phrase: string
  ) {
    super(message);
    this.name = 'KeywordTokenizerError';
  }
}

const PIECE_SCORES = new Map<string, number>(
  vocabulary.pieces as Array<[string, number]>
);

/**
 * Longest piece in code points, bounding the candidate lengths Viterbi tries.
 * 11 for the bundled vocabulary.
 */
export const LONGEST_VOCABULARY_PIECE = Math.max(
  ...[...PIECE_SCORES.keys()].map((piece) => [...piece].length)
);

/**
 * Encode one normalized phrase into vocabulary pieces.
 *
 * @param phrase Uppercase, single-spaced, as `normalizeWakePhrase` produces.
 *   Not normalized here on purpose: the vocabulary is uppercase-only, so a
 *   lowercase phrase has no segmentation at all, and failing loudly is better
 *   than quietly accepting a caller who skipped validation.
 * @throws KeywordTokenizerError when no segmentation exists.
 */
export function encodeKeywordPhrase(phrase: string): string[] {
  // Guarded explicitly, because SPACE_MARKER is itself a vocabulary piece: an
  // empty phrase would otherwise segment happily into a lone `▁`, and a keywords
  // line holding one separator is a keyword that matches constantly.
  if (phrase.length === 0) {
    throw new KeywordTokenizerError('Cannot tokenize an empty phrase.', phrase);
  }

  const text = SPACE_MARKER + phrase.split(' ').join(SPACE_MARKER);
  // Code points, not UTF-16 units: a surrogate pair must never be split across
  // two candidate pieces, even though validation rejects astral characters.
  const characters = [...text];
  const count = characters.length;

  const bestScore = new Array<number>(count + 1).fill(-Infinity);
  const previousIndex = new Array<number>(count + 1).fill(-1);
  const pieceAt = new Array<string | null>(count + 1).fill(null);
  bestScore[0] = 0;

  for (let start = 0; start < count; start += 1) {
    const scoreHere = bestScore[start]!;
    // Nothing reached this position, so no candidate can start here. Happens
    // when an unknown character earlier in the phrase left a gap.
    if (scoreHere === -Infinity) continue;

    const limit = Math.min(LONGEST_VOCABULARY_PIECE, count - start);
    // Candidates competing for one bestScore[end] differ in their start, not
    // their length: for a fixed start each length lands on a different end. The
    // outer loop ascends start, so a strict comparison keeps the first candidate
    // seen, which is the earliest start and therefore the longest piece.
    //
    // The rule is not load-bearing for real input: instrumenting the real
    // vocabulary finds zero exact-score ties across all nine bundled presets and
    // all 2066 cases of the SentencePiece oracle corpus, and swapping `>` for
    // `>=` changes no output anywhere. The presets are reproduced by the unigram
    // scoring itself, not by the tie-break.
    for (let length = 1; length <= limit; length += 1) {
      const candidate = characters.slice(start, start + length).join('');
      const score = PIECE_SCORES.get(candidate);
      if (score === undefined) continue;

      const end = start + length;
      if (scoreHere + score > bestScore[end]!) {
        bestScore[end] = scoreHere + score;
        previousIndex[end] = start;
        pieceAt[end] = candidate;
      }
    }
  }

  if (bestScore[count] === -Infinity) {
    const unknown = characters.find(
      (character) => !PIECE_SCORES.has(character)
    );
    throw new KeywordTokenizerError(
      unknown === undefined
        ? `Could not tokenize "${phrase}" with the bundled keyword vocabulary.`
        : `Cannot tokenize "${phrase}": the character "${unknown}" is not in the ` +
            'keyword vocabulary. Phrases must be uppercase A-Z, apostrophes and ' +
            'spaces, as normalizeWakePhrase produces.',
      phrase
    );
  }

  const tokens: string[] = [];
  for (let index = count; index > 0; index = previousIndex[index]!) {
    tokens.unshift(pieceAt[index]!);
  }
  return tokens;
}
