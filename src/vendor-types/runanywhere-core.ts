export interface RunAnywhereSTTResult {
  text: string;
  confidence: number;
  duration: number;
}

export interface RunAnywhereTTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  language?: string;
}

export interface RunAnywhereSpeakResult {
  duration: number;
  voice: string;
  processingTime: number;
  characterCount: number;
}

export const RunAnywhere = null as unknown as {
  loadSTTModel(
    modelPath: string,
    modelType?: string,
    config?: Record<string, unknown>
  ): Promise<boolean>;
  unloadSTTModel(): Promise<boolean>;
  transcribeFile(
    filePath: string,
    options?: { language?: string }
  ): Promise<RunAnywhereSTTResult>;
  loadTTSModel(
    modelPath: string,
    modelType?: string,
    config?: Record<string, unknown>
  ): Promise<boolean>;
  unloadTTSModel(): Promise<boolean>;
  speak(
    text: string,
    options?: RunAnywhereTTSOptions
  ): Promise<RunAnywhereSpeakResult>;
  stopSpeaking(): Promise<void>;
};
