#!/usr/bin/env node
/**
 * Generates src/internal/keyword-vocab.generated.json from the model bundle's
 * bpe.model.
 *
 * bpe.model is a SentencePiece ModelProto. Despite the name its
 * trainer_spec.model_type is 1 (UNIGRAM), not 2 (BPE), so each piece's score is
 * a unigram log probability and the encoder is Viterbi maximum-score
 * segmentation. See docs/superpowers/specs/2026-10-05-wake-phrase-tokenization-design.md.
 *
 * Only three protobuf wire types appear in the fields we read, so a ~40 line
 * reader is cheaper than a protobuf dependency.
 *
 * Run: yarn generate:keyword-vocab
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MODEL_RELATIVE =
  'ios/Assets/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01';
const OUTPUT = join(ROOT, 'src/internal/keyword-vocab.generated.json');

/** SentencePiece's SentencePiece.Type enum value for an ordinary piece. */
const TYPE_NORMAL = 1;
/** SentencePiece's TrainerSpec.ModelType values. */
const MODEL_TYPES = { 1: 'UNIGRAM', 2: 'BPE', 3: 'WORD', 4: 'CHAR' };

function readVarint(buffer, offset) {
  let result = 0n;
  let shift = 0n;
  let index = offset;
  for (;;) {
    const byte = buffer[index];
    if (byte === undefined) throw new Error('truncated varint');
    index += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  return [Number(result), index];
}

/** Yields [fieldNumber, wireType, value] for every field in a message body. */
function* readFields(buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const [key, afterKey] = readVarint(buffer, offset);
    offset = afterKey;
    const field = key >>> 3;
    const wireType = key & 7;
    if (wireType === 0) {
      const [value, next] = readVarint(buffer, offset);
      offset = next;
      yield [field, wireType, value];
    } else if (wireType === 2) {
      const [length, next] = readVarint(buffer, offset);
      yield [field, wireType, buffer.subarray(next, next + length)];
      offset = next + length;
    } else if (wireType === 5) {
      yield [field, wireType, buffer.readFloatLE(offset)];
      offset += 4;
    } else if (wireType === 1) {
      yield [field, wireType, buffer.readDoubleLE(offset)];
      offset += 8;
    } else {
      throw new Error(`unsupported protobuf wire type ${wireType}`);
    }
  }
}

const modelPath = join(ROOT, MODEL_RELATIVE, 'bpe.model');
const model = readFileSync(modelPath);

const pieces = [];
let modelType = null;

for (const [field, wireType, value] of readFields(model)) {
  // ModelProto.pieces = 1 (repeated SentencePiece)
  if (field === 1 && wireType === 2) {
    let piece = null;
    let score = 0;
    let type = TYPE_NORMAL;
    for (const [sub, subWire, subValue] of readFields(value)) {
      if (sub === 1 && subWire === 2) piece = subValue.toString('utf8');
      else if (sub === 2 && subWire === 5) score = subValue;
      else if (sub === 3 && subWire === 0) type = subValue;
    }
    if (type === TYPE_NORMAL && piece !== null) pieces.push([piece, score]);
    continue;
  }
  // ModelProto.trainer_spec = 2, TrainerSpec.model_type = 3
  if (field === 2 && wireType === 2) {
    for (const [sub, subWire, subValue] of readFields(value)) {
      if (sub === 3 && subWire === 0) modelType = MODEL_TYPES[subValue] ?? String(subValue);
    }
  }
}

if (modelType !== 'UNIGRAM') {
  throw new Error(
    `Expected a UNIGRAM model, got ${modelType}. The tokenizer in ` +
      'src/internal/keyword-tokenizer.ts implements Viterbi segmentation, which ' +
      'is only correct for a unigram model. A different model type needs a ' +
      'different encoder, not a regenerated table.'
  );
}

const table = {
  source: `${MODEL_RELATIVE}/bpe.model`,
  sha256: createHash('sha256').update(model).digest('hex'),
  modelType,
  pieces,
};

const serialized = `${JSON.stringify(table, null, 2)}\n`;

// --stdout lets verify-keyword-vocab.mjs compare a fresh parse against the
// checked-in table without writing to the working tree during lint.
if (process.argv.includes('--stdout')) {
  process.stdout.write(serialized);
} else {
  writeFileSync(OUTPUT, serialized, 'utf8');
  console.log(`Wrote ${pieces.length} pieces to src/internal/keyword-vocab.generated.json`);
}
