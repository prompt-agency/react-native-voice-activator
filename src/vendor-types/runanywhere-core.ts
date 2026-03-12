export interface RunAnywhereSTTResult {
  text: string;
  confidence: number;
  duration: number;
}

export enum SDKEnvironment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
}

export enum ModelCategory {
  SpeechRecognition = 'speech-recognition',
  SpeechSynthesis = 'speech-synthesis',
}

export interface RunAnywhereModelInfo {
  id: string;
  name?: string;
  downloadURL?: string;
  localPath?: string;
  isDownloaded?: boolean;
}

export interface RunAnywhereDownloadProgress {
  modelId: string;
  bytesDownloaded: number;
  totalBytes: number;
  progress: number;
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

export interface RunAnywhereAudioModule {
  createWavFromPCMFloat32(
    audioBase64: string,
    sampleRate?: number
  ): Promise<string>;
  playAudio(uri: string): Promise<void>;
  stopPlayback(): Promise<void>;
}

export const RunAnywhere = null as unknown as {
  readonly isSDKInitialized: boolean;
  initialize(options: {
    environment: SDKEnvironment;
    apiKey?: string;
    baseURL?: string;
    supabaseURL?: string;
    supabaseKey?: string;
  }): Promise<void>;
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
  downloadModel(
    modelId: string,
    onProgress?: (progress: RunAnywhereDownloadProgress) => void
  ): Promise<string>;
  getModelInfo(modelId: string): Promise<RunAnywhereModelInfo | null>;
  isModelDownloaded(modelId: string): Promise<boolean>;
  Audio: RunAnywhereAudioModule;
};
