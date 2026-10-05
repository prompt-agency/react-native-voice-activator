/**
 * keyword-tokenizer.test.ts
 *
 * The nine bundled presets are real ground truth: upstream generated both
 * keywords_raw.txt and keywords.txt, so reproducing them byte-exactly is
 * evidence from outside this codebase. They are read from the asset files rather
 * than copied into literals, so the ground truth cannot drift away from the test.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  encodeKeywordPhrase,
  KeywordTokenizerError,
  LONGEST_VOCABULARY_PIECE,
} from '../internal/keyword-tokenizer';
import { normalizeWakePhrase } from '../internal/wake-phrase';

const MODEL_DIR = join(
  __dirname,
  '..',
  '..',
  'ios/Assets/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
);

function lines(name: string): string[] {
  return readFileSync(join(MODEL_DIR, name), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
}

describe('reproducing the bundled presets', () => {
  const raw = lines('keywords_raw.txt');
  const expected = lines('keywords.txt');

  it('has a preset corpus to check against', () => {
    expect(raw).toHaveLength(9);
    expect(expected).toHaveLength(9);
  });

  it.each(raw.map((phrase, index) => [phrase, expected[index]!]))(
    'encodes %s byte-exactly',
    (phrase, tokenized) => {
      expect(encodeKeywordPhrase(phrase).join(' ')).toBe(tokenized);
    }
  );
});

describe('the vocabulary covers everything validation accepts', () => {
  // If this fails, some accepted phrase has no segmentation and initialize()
  // would reject a phrase the docs promise works.
  it.each([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', "'"])(
    'can encode a phrase containing %s',
    (character) => {
      expect(
        encodeKeywordPhrase(`HEY AC${character}ME`).length
      ).toBeGreaterThan(0);
    }
  );
});

describe('words that stress the segmenter', () => {
  it('segments a word longer than the longest vocabulary piece', () => {
    expect(LONGEST_VOCABULARY_PIECE).toBeLessThan('EXTRAORDINARILY'.length);
    expect(encodeKeywordPhrase('EXTRAORDINARILY LOUD').join('')).toBe(
      '\u2581EXTRAORDINARILY\u2581LOUD'
    );
  });

  it('segments a single letter repeated', () => {
    expect(encodeKeywordPhrase('ZZZZZZ NOW').join('')).toBe(
      '\u2581ZZZZZZ\u2581NOW'
    );
  });

  it('segments apostrophes at the start and end of a word', () => {
    expect(encodeKeywordPhrase("'TIS ACME'").join('')).toBe(
      "\u2581'TIS\u2581ACME'"
    );
  });

  it('round-trips every token back to the input', () => {
    // A segmentation that loses or duplicates a character would still be a
    // sequence of valid tokens, so sherpa-onnx would accept it and match the
    // wrong phrase. Concatenation is the only check that catches that.
    for (const phrase of ['HEY ACME', "WHAT'S UP NOW", 'OK COMPUTER']) {
      expect(encodeKeywordPhrase(phrase).join('')).toBe(
        `\u2581${phrase.split(' ').join('\u2581')}`
      );
    }
  });
});

describe('input the tokenizer cannot encode', () => {
  it('throws on a lowercase phrase rather than returning nothing', () => {
    // The vocabulary is uppercase-only. Callers must normalize first; a silent
    // empty result would become a blank keywords line, and a blank line is what
    // makes sherpa-onnx call exit(-1).
    expect(() => encodeKeywordPhrase('hey acme')).toThrow(
      KeywordTokenizerError
    );
    expect(() => encodeKeywordPhrase('hey acme')).toThrow(
      /normalizeWakePhrase/
    );
  });

  it('names the offending character', () => {
    expect(() => encodeKeywordPhrase('HEY ACME 2')).toThrow(/"2"/);
  });

  it('rejects an empty phrase rather than emitting a lone separator', () => {
    // U+2581 is itself a vocabulary piece, so an empty phrase has a valid
    // segmentation: a single separator. That is a keyword line that matches
    // constantly, so it is refused rather than written.
    expect(() => encodeKeywordPhrase('')).toThrow(KeywordTokenizerError);
    expect(() => encodeKeywordPhrase('')).toThrow(/empty phrase/);
  });

  it('agrees with the normalizer about what it can encode', () => {
    expect(
      encodeKeywordPhrase(normalizeWakePhrase('  hey   Acme ')).join(' ')
    ).toBe(encodeKeywordPhrase('HEY ACME').join(' '));
  });
});
