/**
 * wake-phrase.test.ts
 *
 * Validation is the whole point of this module. The bundled keyword spotter is
 * open-vocabulary, so a bad phrase does not fail loudly at the native layer — it
 * produces a keyword that simply never matches, or one that fires constantly.
 * Both are miserable to debug, so they are rejected at configuration time.
 */

import {
  buildKeywordsFileContents,
  normalizeWakePhrase,
  normalizeWakePhrases,
  WakePhraseError,
  wakePhraseFileName,
} from '../internal/wake-phrase';

describe('normalizing a wake phrase', () => {
  it('uppercases and collapses whitespace', () => {
    expect(normalizeWakePhrase('  hey   Acme  ')).toBe('HEY ACME');
  });

  it('accepts a single phrase or an array', () => {
    expect(normalizeWakePhrases('hey acme')).toEqual(['HEY ACME']);
    expect(normalizeWakePhrases(['hey acme', 'ok acme'])).toEqual([
      'HEY ACME',
      'OK ACME',
    ]);
  });

  it('keeps apostrophes, which the English vocabulary handles', () => {
    expect(normalizeWakePhrases("what's up")).toEqual(["WHAT'S UP"]);
  });

  it('drops duplicates rather than failing on them', () => {
    expect(normalizeWakePhrases(['hey acme', 'HEY  acme '])).toEqual([
      'HEY ACME',
    ]);
  });
});

describe('rejecting phrases that cannot work', () => {
  it('rejects digits, which cannot be tokenized as spoken', () => {
    expect(() => normalizeWakePhrases('hey acme 2')).toThrow(WakePhraseError);
    expect(() => normalizeWakePhrases('hey acme 2')).toThrow(/spell them out/);
  });

  it('rejects punctuation', () => {
    expect(() => normalizeWakePhrases('hey, acme!')).toThrow(WakePhraseError);
  });

  it('rejects a phrase too short to be reliable', () => {
    expect(() => normalizeWakePhrases('go')).toThrow(/shorter than/);
    expect(() => normalizeWakePhrases('hi')).toThrow(/shorter than/);
  });

  it('rejects an over-long phrase', () => {
    expect(() =>
      normalizeWakePhrases('hey acme please start listening to me right now')
    ).toThrow(/longer than/);
  });

  it('rejects an empty input', () => {
    expect(() => normalizeWakePhrases([])).toThrow(/at least one phrase/);
    expect(() => normalizeWakePhrases('   ')).toThrow(WakePhraseError);
  });

  it('reports every problem at once, not just the first', () => {
    const error = (() => {
      try {
        normalizeWakePhrases(['go', 'hey acme 2', 'hey acme']);
        return null;
      } catch (cause) {
        return cause as WakePhraseError;
      }
    })();

    expect(error).toBeInstanceOf(WakePhraseError);
    expect(error!.issues).toHaveLength(2);
    expect(error!.message).toContain('go');
    expect(error!.message).toContain('hey acme 2');
  });

  it('accepts a phrase that is short in characters but long enough in letters', () => {
    // Six letters exactly, the documented floor.
    expect(normalizeWakePhrases('ok acme')).toEqual(['OK ACME']);
  });
});

describe('the generated keywords file', () => {
  it('writes one plain-text phrase per line', () => {
    expect(buildKeywordsFileContents(['HEY ACME', 'OK ACME'])).toBe(
      'HEY ACME\nOK ACME\n'
    );
  });

  it('is not pre-tokenized — native tokenizes it via bpe.model', () => {
    // The bundled presets look like "▁HE LL O ▁WORLD"; generated files must not.
    expect(buildKeywordsFileContents(['HEY ACME'])).not.toContain('▁');
  });

  it('names the file from the phrase, so it is recognisable on disk', () => {
    expect(wakePhraseFileName(['HEY ACME'])).toMatch(
      /^hey-acme-[0-9a-f]{8}\.txt$/
    );
  });

  it('is content addressed — same phrases give the same name', () => {
    expect(wakePhraseFileName(['HEY ACME'])).toBe(
      wakePhraseFileName(['HEY ACME'])
    );
  });

  it('changes name when the phrase changes', () => {
    expect(wakePhraseFileName(['HEY ACME'])).not.toBe(
      wakePhraseFileName(['OK ACME'])
    );
  });

  it('distinguishes phrase order, since it changes the file contents', () => {
    expect(wakePhraseFileName(['HEY ACME', 'OK ACME'])).not.toBe(
      wakePhraseFileName(['OK ACME', 'HEY ACME'])
    );
  });

  it('does not collide when a phrase boundary shifts', () => {
    // A space separator would hash these identically.
    expect(wakePhraseFileName(['HEY THERE', 'ACME NOW'])).not.toBe(
      wakePhraseFileName(['HEY', 'THERE ACME NOW'])
    );
  });

  it('produces a filesystem-safe name', () => {
    const name = wakePhraseFileName(["WHAT'S UP THERE"]);
    expect(name).toMatch(/^[a-z0-9-]+\.txt$/);
    expect(name).not.toContain("'");
  });
});
