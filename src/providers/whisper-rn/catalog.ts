// src/providers/whisper-rn/catalog.ts

export type WhisperRNSTTModelId = 'whisper-tiny-en';

interface WhisperRNModelEntry {
  filename: string;
  url: string;
  language: string;
}

// CRITICAL: Must use ggerganov/whisper.cpp HuggingFace repo.
// Self-converted GGML models silently produce empty output.
// [Source: whisper.rn Issue #278]
export const WHISPER_RN_MODELS: Record<WhisperRNSTTModelId, WhisperRNModelEntry> =
  {
    'whisper-tiny-en': {
      filename: 'ggml-tiny.en.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
      language: 'en',
    },
  };
