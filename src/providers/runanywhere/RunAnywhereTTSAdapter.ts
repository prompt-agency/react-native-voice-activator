import type {
  RunAnywhereTTSConfig,
  TextToSpeechProvider,
  TTSOptions,
} from '../../public/types';

type RunAnywhereModule = typeof import('@runanywhere/core');
type RunAnywhereONNXModule = typeof import('@runanywhere/onnx');
type NativeRunAnywhereONNXModule = ReturnType<
  RunAnywhereONNXModule['requireNativeONNXModule']
>;

type NativeTTSResult = {
  audioBase64?: string;
  audio?: string;
  sampleRate?: number;
};

export class RunAnywhereTTSAdapter implements TextToSpeechProvider {
  readonly name = 'runanywhere-onnx';
  readonly isBuiltInRunAnywhereProvider = true;

  private runAnywhere: RunAnywhereModule['RunAnywhere'] | null = null;
  private nativeONNX: NativeRunAnywhereONNXModule | null = null;
  private resolvedModelPath: string | null = null;

  constructor(private readonly config: RunAnywhereTTSConfig) {}

  /**
   * Set the resolved local filesystem path for the TTS model.
   * Called by the built-in provider orchestration layer (Story 7-2) after
   * model download and path resolution. Must be called before initialize().
   */
  setResolvedPath(path: string): void {
    this.resolvedModelPath = path;
  }

  async initialize(): Promise<void> {
    if (this.runAnywhere && this.nativeONNX) {
      return;
    }

    const [{ ONNXProvider, requireNativeONNXModule }, { RunAnywhere }] =
      await Promise.all([
        import('@runanywhere/onnx'),
        import('@runanywhere/core'),
      ]);

    const registered = await ONNXProvider.register();
    if (!registered) {
      throw new Error('RunAnywhere ONNX backend failed to register.');
    }

    if (!this.resolvedModelPath) {
      throw new Error(
        'RunAnywhereTTSAdapter: call setResolvedPath() with the downloaded model path before initialize().'
      );
    }

    const nativeONNX = requireNativeONNXModule();
    const loaded = await nativeONNX.loadTTSModel(
      this.resolvedModelPath,
      'piper'
    );

    if (!loaded) {
      throw new Error('RunAnywhere TTS model failed to load.');
    }

    this.runAnywhere = RunAnywhere;
    this.nativeONNX = nativeONNX;
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.runAnywhere || !this.nativeONNX) {
      throw new Error('RunAnywhereTTSAdapter: call initialize() first');
    }

    if (options?.language && __DEV__) {
      console.warn(
        'RunAnywhereTTSAdapter: TTSOptions.language is not supported and will be ignored. TTS language is determined by the loaded model.'
      );
    }

    const resultJson = await this.nativeONNX.synthesize(
      text,
      this.config.voice ?? '',
      options?.rate ?? this.config.rate ?? 1,
      options?.pitch ?? this.config.pitch ?? 1
    );
    const parsed = JSON.parse(resultJson) as NativeTTSResult;
    const audioBase64 = parsed.audioBase64 ?? parsed.audio;

    if (!audioBase64) {
      throw new Error('RunAnywhere TTS synthesis returned no audio.');
    }

    const wavPath = await this.runAnywhere.Audio.createWavFromPCMFloat32(
      audioBase64,
      parsed.sampleRate ?? 22050
    );
    await this.runAnywhere.Audio.playAudio(wavPath);
  }

  async stop(): Promise<void> {
    if (!this.runAnywhere) {
      return;
    }

    await this.runAnywhere.Audio.stopPlayback();
  }

  async dispose(): Promise<void> {
    if (!this.runAnywhere || !this.nativeONNX) {
      return;
    }

    await this.runAnywhere.Audio.stopPlayback();
    await this.nativeONNX.unloadTTSModel();
    this.runAnywhere = null;
    this.nativeONNX = null;
  }
}
