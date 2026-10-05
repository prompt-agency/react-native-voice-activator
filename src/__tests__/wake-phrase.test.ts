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
  validateWakePhrase,
  normalizeWakePhrase,
  normalizeWakePhrases,
  WakePhraseError,
  wakePhraseFileName,
} from '../internal/wake-phrase';
import { KeywordTokenizerError } from '../internal/keyword-tokenizer';
import vocabulary from '../internal/keyword-vocab.generated.json';

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
  it('writes one pre-tokenized phrase per line', () => {
    // Matches the shape of the bundled presets: sherpa-onnx reads the keywords
    // file as space-separated vocabulary pieces and calls exit(-1) on a token
    // it cannot find, so plain text here terminates the host app.
    expect(buildKeywordsFileContents(['HEY ACME', 'OK ACME'])).toBe(
      '\u2581HE Y \u2581A C ME\n\u2581O K \u2581A C ME\n'
    );
  });

  it('is pre-tokenized, like the bundled presets', () => {
    expect(buildKeywordsFileContents(['HEY ACME'])).toContain('\u2581');
  });

  it('rejects a phrase it cannot tokenize rather than writing a blank line', () => {
    // A blank or partial line is what reaches EncodeBase and exits the process.
    expect(() => buildKeywordsFileContents(['hey acme'])).toThrow(
      KeywordTokenizerError
    );
  });

  it('refuses an empty phrase list rather than writing a blank line', () => {
    // "\n" is a keywords file whose only line is blank, and a blank line is what
    // sherpa-onnx answers with exit(-1).
    expect(() => buildKeywordsFileContents([])).toThrow(WakePhraseError);
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

describe('validateWakePhrase (non-throwing, for UI feedback)', () => {
  it('accepts a good phrase and returns the normalized form', () => {
    expect(validateWakePhrase('  hey   Acme ')).toEqual({
      valid: true,
      normalized: 'HEY ACME',
      problems: [],
    });
  });

  it('reports problems instead of throwing', () => {
    const result = validateWakePhrase('hey acme 2');

    expect(result.valid).toBe(false);
    expect(result.normalized).toBeNull();
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/spell them out/);
  });

  it('reports a reason for an empty phrase rather than an empty problem list', () => {
    const result = validateWakePhrase('   ');

    expect(result.valid).toBe(false);
    // An empty problems array would render as "invalid, but no reason given".
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('agrees with what initialize() would accept', () => {
    // The two must not drift: this delegates to the same normalizer.
    expect(validateWakePhrase('ok acme').valid).toBe(true);
    expect(validateWakePhrase('go').valid).toBe(false);
  });
});

describe('upgrading from a version that wrote plain text', () => {
  const stored = new Map<string, string>();

  beforeEach(() => {
    jest.resetModules();
    stored.clear();
  });

  async function loadModule() {
    jest.doMock('@dr.pogodin/react-native-fs', () => ({
      mkdir: jest.fn(async () => undefined),
      exists: jest.fn(async (path: string) => stored.has(path)),
      readFile: jest.fn(async (path: string) => {
        const value = stored.get(path);
        if (value === undefined) throw new Error(`ENOENT: ${path}`);
        return value;
      }),
      writeFile: jest.fn(async (path: string, contents: string) => {
        stored.set(path, contents);
      }),
    }));
    return import('../internal/wake-phrase');
  }

  it('rewrites a stale plain-text file at the same path', async () => {
    const { writeWakePhraseKeywords, wakePhraseFileName } = await loadModule();
    const base = '/models';
    const stalePath = `${base}/generated-keywords/${wakePhraseFileName(['HEY ACME'])}`;

    // Exactly what 0.1.1 and 0.1.2 wrote, at the path this version also picks.
    stored.set(stalePath, 'HEY ACME\n');

    const result = await writeWakePhraseKeywords('hey acme', base);

    expect(result.path).toBe(stalePath);
    expect(stored.get(stalePath)).toBe('\u2581HE Y \u2581A C ME\n');
    expect(stored.get(stalePath)).not.toBe('HEY ACME\n');
  });

  it('reuses a file that is already tokenized', async () => {
    const { writeWakePhraseKeywords } = await loadModule();
    const rnfs = jest.requireMock('@dr.pogodin/react-native-fs') as {
      writeFile: jest.Mock;
    };

    await writeWakePhraseKeywords('hey acme', '/models');
    await writeWakePhraseKeywords('hey acme', '/models');

    expect(rnfs.writeFile).toHaveBeenCalledTimes(1);
  });
});

describe('verifying the phrase against the model bundle vocabulary', () => {
  const stored = new Map<string, string>();

  beforeEach(() => {
    jest.resetModules();
    stored.clear();
  });

  async function loadModule() {
    jest.doMock('@dr.pogodin/react-native-fs', () => ({
      mkdir: jest.fn(async () => undefined),
      exists: jest.fn(async (path: string) => stored.has(path)),
      readFile: jest.fn(async (path: string) => {
        const value = stored.get(path);
        if (value === undefined) throw new Error(`ENOENT: ${path}`);
        if (value === UNREADABLE) throw new Error(`EIO: ${path}`);
        return value;
      }),
      writeFile: jest.fn(async (path: string, contents: string) => {
        stored.set(path, contents);
      }),
    }));
    return import('../internal/wake-phrase');
  }

  /** Sentinel contents the readFile mock turns into a read error. */
  const UNREADABLE = '\u0000unreadable';

  /**
   * A tokens.txt built from the real vocabulary, so the fixture cannot drift from
   * the table the tokenizer segments against. `omit` removes one entry, which is
   * how a different keyword-spotter bundle looks from here.
   */
  function tokensFile(omit?: string): string {
    return (vocabulary.pieces as Array<[string, number]>)
      .map(([piece], index) => (piece === omit ? null : `${piece} ${index}`))
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  it('writes the file when the bundle vocabulary contains every token', async () => {
    const { writeWakePhraseKeywords } = await loadModule();
    stored.set('/models/tokens.txt', tokensFile());

    const result = await writeWakePhraseKeywords('hey acme', '/models');

    expect(stored.get(result.path)).toBe('\u2581HE Y \u2581A C ME\n');
  });

  it('throws when the bundle vocabulary is missing a token the phrase needs', async () => {
    const { writeWakePhraseKeywords, WakePhraseModelMismatchError } =
      await loadModule();
    // The real vocabulary minus one piece "HEY ACME" actually tokenizes to.
    stored.set('/models/tokens.txt', tokensFile('\u2581HE'));

    const error = await writeWakePhraseKeywords('hey acme', '/models').then(
      () => null,
      (cause: unknown) => cause
    );

    expect(error).toBeInstanceOf(WakePhraseModelMismatchError);
    expect(
      (error as InstanceType<typeof WakePhraseModelMismatchError>).missingTokens
    ).toEqual(['\u2581HE']);
    expect((error as Error).message).toContain('\u2581HE');
    expect((error as Error).message).toContain('/models');
  });

  it('writes nothing at all when the vocabulary mismatches', async () => {
    const { writeWakePhraseKeywords } = await loadModule();
    const rnfs = jest.requireMock('@dr.pogodin/react-native-fs') as {
      writeFile: jest.Mock;
      mkdir: jest.Mock;
    };
    stored.set('/models/tokens.txt', tokensFile('\u2581HE'));

    await expect(
      writeWakePhraseKeywords('hey acme', '/models')
    ).rejects.toThrow();

    // A partially written keywords file would be worse than none: sherpa-onnx
    // reads whatever is there and exits the process on a token it cannot find.
    expect(rnfs.writeFile).not.toHaveBeenCalled();
    expect(rnfs.mkdir).not.toHaveBeenCalled();
    expect([...stored.keys()]).toEqual(['/models/tokens.txt']);
  });

  it('fails rather than skipping verification when tokens.txt exists but cannot be read', async () => {
    const { writeWakePhraseKeywords, WakePhraseModelMismatchError } =
      await loadModule();
    const rnfs = jest.requireMock('@dr.pogodin/react-native-fs') as {
      writeFile: jest.Mock;
      mkdir: jest.Mock;
    };
    stored.set('/models/tokens.txt', UNREADABLE);

    const error = await writeWakePhraseKeywords('hey acme', '/models').then(
      () => null,
      (cause: unknown) => cause
    );

    expect(error).toBeInstanceOf(WakePhraseModelMismatchError);
    expect(
      (error as InstanceType<typeof WakePhraseModelMismatchError>).missingTokens
    ).toEqual([]);
    expect((error as Error).message).toContain('tokens.txt');
    expect((error as Error).message).toContain('/models');
    // This is exactly the path the check protects: a mismatch here reaches
    // exit(-1), so nothing is written on an unverifiable vocabulary either.
    expect(rnfs.writeFile).not.toHaveBeenCalled();
    expect(rnfs.mkdir).not.toHaveBeenCalled();
  });

  it('skips verification when there is no tokens.txt at all', async () => {
    const { writeWakePhraseKeywords } = await loadModule();

    const result = await writeWakePhraseKeywords('hey acme', '/models');

    expect(stored.get(result.path)).toBe('\u2581HE Y \u2581A C ME\n');
  });

  it('skips verification when exists() itself fails', async () => {
    jest.doMock('@dr.pogodin/react-native-fs', () => ({
      mkdir: jest.fn(async () => undefined),
      exists: jest.fn(async () => {
        throw new Error('EPERM: cannot stat');
      }),
      readFile: jest.fn(async (path: string) => {
        const value = stored.get(path);
        if (value === undefined) throw new Error(`ENOENT: ${path}`);
        return value;
      }),
      writeFile: jest.fn(async (path: string, contents: string) => {
        stored.set(path, contents);
      }),
    }));
    const { writeWakePhraseKeywords } = await import('../internal/wake-phrase');
    stored.set('/models/tokens.txt', tokensFile('\u2581HE'));

    const result = await writeWakePhraseKeywords('hey acme', '/models');

    expect(stored.get(result.path)).toBe('\u2581HE Y \u2581A C ME\n');
  });
});
