import type {
  CustomTTSConfig,
  TextToSpeechProvider,
  TTSOptions,
} from '../../public/types';
import { audioPlaybackManager } from './AudioPlaybackManager';
import { ttsInferenceEngine } from './TTSInferenceEngine';

export class CustomTTSAdapter implements TextToSpeechProvider {
  readonly name = 'custom-tts-onnx';

  private _stopped = false;

  constructor(private readonly config: CustomTTSConfig) {}

  async speak(text: string, _options?: TTSOptions): Promise<void> {
    this._stopped = false;

    await ttsInferenceEngine.loadModel(this.config.modelPath);
    if (this._stopped) return;

    const phonemeIds = await this.config.phonemize(text);
    if (this._stopped) return;

    const pcm = await ttsInferenceEngine.synthesize(
      phonemeIds,
      this.config.speakerId
    );
    if (this._stopped) return;

    await audioPlaybackManager.playChunk(pcm, this.config.sampleRate ?? 22050);
  }

  async stop(): Promise<void> {
    this._stopped = true;
    await audioPlaybackManager.stop();
  }
}
