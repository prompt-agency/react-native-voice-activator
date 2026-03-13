import type {
  BuiltInProviderProgress,
  RunAnywhereTTSConfig,
  TextToSpeechProvider,
  TTSOptions,
} from '../../public/types';
import { RUNANYWHERE_TTS_MODELS } from './catalog';

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

async function findOnnxInDirectory(
  dirPath: string,
  rnfs: {
    readDir(path: string): Promise<
      Array<{
        isFile(): boolean;
        isDirectory(): boolean;
        name: string;
        path: string;
      }>
    >;
  }
): Promise<string> {
  const items = await rnfs.readDir(dirPath);
  for (const item of items) {
    if (item.isFile() && item.name.endsWith('.onnx')) {
      return item.path;
    }
  }
  for (const item of items) {
    if (item.isDirectory()) {
      try {
        return await findOnnxInDirectory(item.path, rnfs);
      } catch {
        // try next directory
      }
    }
  }
  throw new Error(`No .onnx file found in directory: ${dirPath}`);
}

export class RunAnywhereTTSAdapter implements TextToSpeechProvider {
  readonly name = 'runanywhere-onnx';
  readonly isBuiltInRunAnywhereProvider = true;

  private runAnywhere: RunAnywhereModule['RunAnywhere'] | null = null;
  private nativeONNX: NativeRunAnywhereONNXModule | null = null;
  private modelRegistered = false;

  constructor(private readonly config: RunAnywhereTTSConfig) {}

  async initialize(
    onProgress?: (update: BuiltInProviderProgress) => void
  ): Promise<void> {
    if (this.runAnywhere && this.nativeONNX) {
      return;
    }

    const [onnxModule, coreModule] = await Promise.all([
      import('@runanywhere/onnx'),
      import('@runanywhere/core'),
    ]);

    const { RunAnywhere, SDKEnvironment, ModelCategory } = coreModule;
    const { ONNXProvider, ONNX, ModelArtifactType, requireNativeONNXModule } =
      onnxModule;

    if (!RunAnywhere.isSDKInitialized) {
      onProgress?.({ message: 'Initializing RunAnywhere SDK...' });
      await RunAnywhere.initialize({ environment: SDKEnvironment.Development });
    }

    const registered = await ONNXProvider.register();
    if (!registered) {
      throw new Error('RunAnywhere ONNX backend failed to register.');
    }

    const modelEntry = RUNANYWHERE_TTS_MODELS[this.config.modelId];
    const registryId = modelEntry.registryId;

    if (!this.modelRegistered) {
      await ONNX.addModel({
        id: registryId,
        name: this.config.modelId,
        url: modelEntry.url,
        modality: ModelCategory.SpeechSynthesis,
        artifactType: ModelArtifactType.TarGzArchive,
        memoryRequirement: modelEntry.memoryRequirement,
      });
      this.modelRegistered = true;
    }

    const alreadyDownloaded = await RunAnywhere.isModelDownloaded(registryId);
    if (!alreadyDownloaded) {
      onProgress?.({
        message: `Downloading ${this.config.modelId}...`,
        progress: 0,
      });
      await RunAnywhere.downloadModel(
        registryId,
        (progress: { progress: number }) => {
          onProgress?.({
            message: `Downloading ${this.config.modelId}...`,
            progress: Math.round(progress.progress * 100),
          });
        }
      );
    }

    const modelInfo = await RunAnywhere.getModelInfo(registryId);
    if (!modelInfo?.localPath) {
      throw new Error(
        `RunAnywhere TTS model path could not be resolved: ${this.config.modelId}`
      );
    }

    // Piper TTS archives extract to a directory; locate the .onnx file inside.
    const rnfsModule = await import('react-native-fs');
    const rnfs = rnfsModule.default;
    const onnxPath = await findOnnxInDirectory(modelInfo.localPath, rnfs);

    const nativeONNX = requireNativeONNXModule();
    const loaded = await nativeONNX.loadTTSModel(
      onnxPath,
      modelEntry.modelType
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
    this.modelRegistered = false;
  }
}
