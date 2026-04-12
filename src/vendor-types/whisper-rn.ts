// Hand-written type declarations for whisper.rn (mybigday/whisper.rn)
// Derived from the public API documentation and whisper.rn v0.5.2 source.
//
// CRITICAL: ctx.transcribe() is NOT async — it returns { stop, promise } synchronously.
// [Source: whisper.rn Issue #183, #278]

export interface WhisperTranscribeResult {
  result: string;
}

export interface WhisperTranscribeOptions {
  language?: string;
  maxLen?: number;
  translate?: boolean;
  noContext?: boolean;
  beamSize?: number;
  bestOf?: number;
  speedUp?: boolean;
  tdrzEnable?: boolean;
  prompt?: string;
  /** no_speech_thold: probability above which a segment is suppressed as non-speech (default 0.6) */
  noSpeechThold?: number;
  /** temperature for sampling; 0 = greedy decoding (no randomness, prevents hallucination loops) */
  temperature?: number;
}

export interface WhisperTranscription {
  /** Stop the transcription early. May throw if transcription already completed. */
  stop: () => Promise<void>;
  /** Resolves with the final transcription result. */
  promise: Promise<WhisperTranscribeResult>;
}

export interface WhisperContext {
  /**
   * Transcribe an audio file. NOTE: this method is synchronous and returns
   * { stop, promise } immediately. Do NOT await the call itself.
   */
  transcribe(
    filePath: string,
    options?: WhisperTranscribeOptions
  ): WhisperTranscription;
  /** Release the native context. Call when done. Irreversible. */
  release(): Promise<void>;
}

export interface WhisperInitOptions {
  filePath: string;
  /** iOS only: use Core ML for inference acceleration */
  isCoreMLEnabled?: boolean;
  /** Android only: number of threads for inference */
  nThreads?: number;
}

export declare function initWhisper(
  options: WhisperInitOptions
): Promise<WhisperContext>;

export declare function releaseAllWhisper(): Promise<void>;
