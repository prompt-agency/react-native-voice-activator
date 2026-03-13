import type { AudioSet } from 'react-native-audio-recorder-player';
import type {
  BuiltInProviderProgress,
  RunAnywhereSTTConfig,
  SpeechToTextProvider,
  TranscriptionResult,
} from '../../public/types';
import { RUNANYWHERE_STT_MODELS } from './catalog';

type RunAnywhereModule = typeof import('@runanywhere/core');
type AudioRecorderPlayerModule =
  typeof import('react-native-audio-recorder-player');

type ActiveTranscription = {
  cancelled: boolean;
  resolveWait: () => void;
};

export class RunAnywhereSTTCancelledError extends Error {
  readonly code = 'stt_cancelled';

  constructor() {
    super('Transcription was cancelled.');
    this.name = 'RunAnywhereSTTCancelledError';
  }
}

export class RunAnywhereSTTAdapter implements SpeechToTextProvider {
  readonly name = 'runanywhere-onnx';
  readonly isBuiltInRunAnywhereProvider = true;

  private runAnywhere: RunAnywhereModule['RunAnywhere'] | null = null;
  private AudioRecorderPlayer: AudioRecorderPlayerModule['default'] | null =
    null;
  private audioRecorderModule: AudioRecorderPlayerModule | null = null;
  private activeTranscription: ActiveTranscription | null = null;
  private modelRegistered = false;

  constructor(private readonly config: RunAnywhereSTTConfig) {}

  async initialize(
    onProgress?: (update: BuiltInProviderProgress) => void
  ): Promise<void> {
    if (this.runAnywhere && this.AudioRecorderPlayer) {
      return;
    }

    const [onnxModule, coreModule, audioRecorderModule] = await Promise.all([
      import('@runanywhere/onnx'),
      import('@runanywhere/core'),
      import('react-native-audio-recorder-player'),
    ]);

    const { RunAnywhere, SDKEnvironment, ModelCategory } = coreModule;
    const { ONNXProvider, ONNX, ModelArtifactType } = onnxModule;

    if (!RunAnywhere.isSDKInitialized) {
      onProgress?.({ message: 'Initializing RunAnywhere SDK...' });
      await RunAnywhere.initialize({ environment: SDKEnvironment.Development });
    }

    const registered = await ONNXProvider.register();
    if (!registered) {
      throw new Error('RunAnywhere ONNX backend failed to register.');
    }

    const modelEntry = RUNANYWHERE_STT_MODELS[this.config.modelId];
    const registryId = modelEntry.registryId;

    if (!this.modelRegistered) {
      await ONNX.addModel({
        id: registryId,
        name: this.config.modelId,
        url: modelEntry.url,
        modality: ModelCategory.SpeechRecognition,
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
        `RunAnywhere STT model path could not be resolved: ${this.config.modelId}`
      );
    }

    const loaded = await RunAnywhere.loadSTTModel(
      modelInfo.localPath,
      modelEntry.modelType
    );

    if (!loaded) {
      throw new Error('RunAnywhere STT model failed to load.');
    }

    this.runAnywhere = RunAnywhere;
    this.AudioRecorderPlayer = audioRecorderModule.default;
    this.audioRecorderModule = audioRecorderModule;
  }

  private getAudioSet(): AudioSet {
    if (!this.audioRecorderModule) {
      throw new Error('RunAnywhereSTTAdapter: call initialize() first');
    }

    const {
      AudioSourceAndroidType,
      OutputFormatAndroidType,
      AudioEncoderAndroidType,
      AVEncodingOption,
      AVEncoderAudioQualityIOSType,
      AVModeIOSOption,
    } = this.audioRecorderModule;

    return {
      AudioSourceAndroid: AudioSourceAndroidType.VOICE_RECOGNITION,
      OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
      AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
      AudioSamplingRateAndroid: 16_000,
      AudioChannelsAndroid: 1,
      AudioEncodingBitRateAndroid: 64_000,
      AVFormatIDKeyIOS: AVEncodingOption.wav,
      AVSampleRateKeyIOS: 16_000,
      AVNumberOfChannelsKeyIOS: 1,
      AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
      AVModeIOS: AVModeIOSOption.measurement,
    };
  }

  async transcribe(): Promise<TranscriptionResult> {
    if (!this.runAnywhere || !this.AudioRecorderPlayer) {
      throw new Error('RunAnywhereSTTAdapter: call initialize() first');
    }

    if (this.activeTranscription) {
      throw new Error(
        'RunAnywhereSTTAdapter: transcription already in progress'
      );
    }

    const recorder = new this.AudioRecorderPlayer();
    const maxRecordingMs = this.config.maxRecordingMs ?? 10_000;
    let resolveWait = () => undefined;
    const activeTranscription: ActiveTranscription = {
      cancelled: false,
      resolveWait: () => resolveWait(),
    };
    this.activeTranscription = activeTranscription;

    await recorder.startRecorder(undefined, this.getAudioSet(), false);

    if (activeTranscription.cancelled) {
      await recorder.stopRecorder();
      throw new RunAnywhereSTTCancelledError();
    }

    const waitForRecording = new Promise<void>((resolve) => {
      const timeoutId = setTimeout(resolve, maxRecordingMs);

      resolveWait = () => {
        clearTimeout(timeoutId);
        resolve();
      };
    });

    try {
      await waitForRecording;

      const audioPath = await recorder.stopRecorder();

      if (activeTranscription.cancelled) {
        throw new RunAnywhereSTTCancelledError();
      }

      const result = await this.runAnywhere.transcribeFile(audioPath);

      return {
        text: result.text,
        confidence: result.confidence,
        provider: this.name,
        durationMs:
          result.duration > 0 ? Math.round(result.duration * 1000) : undefined,
      };
    } finally {
      recorder.removeRecordBackListener();
      this.activeTranscription = null;
    }
  }

  async cancel(): Promise<void> {
    if (!this.activeTranscription) {
      return;
    }

    this.activeTranscription.cancelled = true;
    this.activeTranscription.resolveWait();
  }

  async dispose(): Promise<void> {
    await this.cancel();

    if (!this.runAnywhere) {
      return;
    }

    await this.runAnywhere.unloadSTTModel();
    this.runAnywhere = null;
    this.AudioRecorderPlayer = null;
    this.audioRecorderModule = null;
    this.modelRegistered = false;
  }
}
