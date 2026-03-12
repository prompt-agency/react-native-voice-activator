import type {
  RunAnywhereTTSConfig,
  TextToSpeechProvider,
  TTSOptions,
} from '../../public/types';

type RunAnywhereModule = typeof import('@runanywhere/core');

export class RunAnywhereTTSAdapter implements TextToSpeechProvider {
  readonly name = 'runanywhere-onnx';
  readonly isBuiltInRunAnywhereProvider = true;

  private runAnywhere: RunAnywhereModule['RunAnywhere'] | null = null;

  constructor(private readonly config: RunAnywhereTTSConfig) {}

  async initialize(): Promise<void> {
    if (this.runAnywhere) {
      return;
    }

    const [{ ONNX }, { RunAnywhere }] = await Promise.all([
      import('@runanywhere/onnx'),
      import('@runanywhere/core'),
    ]);

    ONNX.register();

    const loaded = await RunAnywhere.loadTTSModel(
      this.config.modelPath,
      this.config.modelType ?? 'piper'
    );

    if (!loaded) {
      throw new Error('RunAnywhere TTS model failed to load.');
    }

    this.runAnywhere = RunAnywhere;
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.runAnywhere) {
      throw new Error('RunAnywhereTTSAdapter: call initialize() first');
    }

    if (options?.language && __DEV__) {
      console.warn(
        'RunAnywhereTTSAdapter: TTSOptions.language is not supported and will be ignored. TTS language is determined by the loaded model.'
      );
    }

    await this.runAnywhere.speak(text, {
      voice: this.config.voice,
      rate: options?.rate ?? this.config.rate,
      pitch: options?.pitch ?? this.config.pitch,
      language: undefined,
    });
  }

  async stop(): Promise<void> {
    if (!this.runAnywhere) {
      return;
    }

    await this.runAnywhere.stopSpeaking();
  }

  async dispose(): Promise<void> {
    if (!this.runAnywhere) {
      return;
    }

    await this.runAnywhere.stopSpeaking();
    await this.runAnywhere.unloadTTSModel();
    this.runAnywhere = null;
  }
}
