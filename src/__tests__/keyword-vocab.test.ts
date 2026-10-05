/**
 * keyword-vocab.test.ts
 *
 * The generated table is the tokenizer's whole source of truth, and a wrong
 * table does not fail loudly: it produces a keywords file whose tokens
 * sherpa-onnx cannot find, and sherpa-onnx answers that with exit(-1) rather
 * than an error. So the table's provenance is asserted here rather than trusted.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import vocab from '../internal/keyword-vocab.generated.json';

const root = join(__dirname, '..', '..');
const MODEL_DIR = join(
  root,
  'ios/Assets/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
);

describe('the generated keyword vocabulary', () => {
  it('describes the bpe.model it was generated from', () => {
    const actual = createHash('sha256')
      .update(readFileSync(join(MODEL_DIR, 'bpe.model')))
      .digest('hex');

    expect(vocab.sha256).toBe(actual);
  });

  it('records the model type, which is unigram and not BPE', () => {
    // trainer_spec.model_type is 1 (UNIGRAM), not 2 (BPE), despite the
    // filename. The encoder is therefore Viterbi, not pair merging.
    expect(vocab.modelType).toBe('UNIGRAM');
  });

  it('holds exactly the pieces tokens.txt holds', () => {
    const tokens = readFileSync(join(MODEL_DIR, 'tokens.txt'), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.slice(0, line.lastIndexOf(' ')));

    const pieces = vocab.pieces.map(([piece]) => piece);

    // Any token the tokenizer can emit must be one EncodeBase can find, so
    // these sets are compared in both directions, not just by size.
    expect(new Set(pieces)).toEqual(
      new Set(tokens.filter((t) => !t.startsWith('<')))
    );
    expect(pieces).toHaveLength(497);
  });

  it('excludes the three pieces that are not NORMAL', () => {
    const pieces = vocab.pieces.map(([piece]) => piece);

    // These score 0 while every real piece scores negative. Left in, Viterbi
    // maximising total score emits nothing but these.
    expect(pieces).not.toContain('<blk>');
    expect(pieces).not.toContain('<sos/eos>');
    expect(pieces).not.toContain('<unk>');
  });

  it('scores every piece negatively, so no piece is a free win', () => {
    // resolveJsonModule infers a mixed-type array literal (e.g. ["AB", -3.1])
    // as (string | number)[], not the fixed-length tuple it actually is, so
    // this assertion restores the tuple shape documented in the task brief's
    // interface: pieces: [string, number][].
    const pieces = vocab.pieces as Array<[string, number]>;
    for (const [piece, score] of pieces) {
      expect(typeof score).toBe('number');
      expect(score).toBeLessThan(0);
      expect(piece.length).toBeGreaterThan(0);
    }
  });
});
