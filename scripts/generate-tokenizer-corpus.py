#!/usr/bin/env python3
"""Generates the tokenizer's oracle fixture using the real sentencepiece library.

Run once, by hand, in a throwaway virtualenv. The output is checked in so CI
needs no Python:

    python3 -m venv /tmp/va-sp && /tmp/va-sp/bin/pip install sentencepiece
    /tmp/va-sp/bin/python scripts/generate-tokenizer-corpus.py

This exists so the tokenizer is checked against an implementation we did not
write. A corpus generated from our own encoder could not find an error in it.
"""

import hashlib
import json
import pathlib
import random

import sentencepiece

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODEL = (
    ROOT
    / "ios/Assets/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
    / "bpe.model"
)
OUTPUT = ROOT / "src/__tests__/fixtures/keyword-tokenizer-corpus.json"

WORDS = [
    "HEY", "OK", "ACME", "COMPUTER", "ASSISTANT", "HELLO", "THERE", "FRIEND",
    "START", "STOP", "LISTEN", "WAKE", "SLEEP", "NOW", "PLEASE", "THANKS",
    "ORBIT", "NEBULA", "QUARTZ", "ZEPHYR", "JUNIPER", "MARIGOLD", "SPARROW",
    "EXTRAORDINARILY", "UNBELIEVABLE", "RHYTHM", "SYZYGY", "QUEUE", "AWKWARD",
    "WHAT'S", "THAT'S", "IT'S", "DON'T", "O'CLOCK", "ACME'S",
    "ZZZZZZ", "AAAAAA", "XYLOPHONE", "JAZZ", "BUZZ", "FIZZ",
]

random.seed(31)  # The issue number, so the corpus is reproducible.


def phrases():
    seen = set()
    # Every pair of adjacent words, then random pairs and triples, so the corpus
    # covers both short and long phrases and every letter of the alphabet.
    for first in WORDS:
        for second in WORDS:
            if first != second:
                candidate = f"{first} {second}"
                if len(candidate) <= 40 and candidate not in seen:
                    seen.add(candidate)
                    yield candidate
    for _ in range(400):
        candidate = " ".join(random.sample(WORDS, 3))
        if len(candidate) <= 40 and candidate not in seen:
            seen.add(candidate)
            yield candidate
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        candidate = f"HEY AC{letter}ME"
        if candidate not in seen:
            seen.add(candidate)
            yield candidate


processor = sentencepiece.SentencePieceProcessor()
processor.Load(str(MODEL))

cases = [
    {"phrase": phrase, "tokens": processor.EncodeAsPieces(phrase)}
    for phrase in phrases()
]

fixture = {
    "generatedBy": f"sentencepiece {sentencepiece.__version__} via scripts/generate-tokenizer-corpus.py",
    "sha256": hashlib.sha256(MODEL.read_bytes()).hexdigest(),
    "cases": cases,
}

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n")
print(f"Wrote {len(cases)} cases to {OUTPUT.relative_to(ROOT)}")
