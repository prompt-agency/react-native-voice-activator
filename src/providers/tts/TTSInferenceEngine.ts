import type { InferenceSession } from 'onnxruntime-react-native';

type OrtModule = {
  Tensor: typeof import('onnxruntime-react-native').Tensor;
};

type LoadModelOptions = {
  /** ORT execution providers. Defaults to ['cpu']. Use ['coreml'] on iOS for battery-efficient VAD. */
  executionProviders?: Array<'cpu' | 'coreml' | 'nnapi'>;
};

// ─── Engine ───────────────────────────────────────────────────────────────────

export class TTSInferenceEngine {
  private session: InferenceSession | null = null;
  private loadedModelPath: string | null = null;
  private ort: OrtModule | null = null;

  /**
   * Load an ONNX voice model from an absolute local file path.
   * Idempotent: calling with the same path a second time is a no-op.
   * Calling with a different path reloads the session.
   *
   * @param modelPath - Absolute local file path to the `.onnx` model
   * @param options   - Optional ORT session configuration (e.g. executionProviders)
   */
  async loadModel(
    modelPath: string,
    options?: LoadModelOptions
  ): Promise<void> {
    if (this.session !== null && this.loadedModelPath === modelPath) {
      return; // idempotent — already loaded
    }

    // Release existing session if switching models
    if (this.session !== null) {
      await this.session.release();
      this.session = null;
      this.loadedModelPath = null;
    }

    // Dynamic import — onnxruntime-react-native is an optional peer dep
    const ort = await import('onnxruntime-react-native');
    this.ort = { Tensor: ort.Tensor };

    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: options?.executionProviders ?? ['cpu'],
    });
    this.loadedModelPath = modelPath;
  }

  /**
   * Run TTS inference on pre-computed phoneme IDs.
   * Returns a Float32Array of PCM audio samples at 22050 Hz mono.
   *
   * @param phonemeIds - Piper TTS phoneme IDs as BigInt64Array
   * @param speakerId  - Optional speaker ID for multi-speaker models
   */
  async synthesize(
    phonemeIds: BigInt64Array,
    speakerId?: number
  ): Promise<Float32Array> {
    if (!this.session || !this.ort) {
      throw new Error('TTSInferenceEngine: call loadModel() first');
    }

    const { Tensor } = this.ort;

    // Piper TTS input tensors (ONNX v1 format)
    const inputTensor = new Tensor('int64', phonemeIds, [
      1,
      phonemeIds.length,
    ]) as InstanceType<typeof Tensor>;

    const lengthTensor = new Tensor(
      'int64',
      BigInt64Array.from([BigInt(phonemeIds.length)]),
      [1]
    ) as InstanceType<typeof Tensor>;

    // scales: [noise_scale, length_scale, noise_scale_w]
    const scalesTensor = new Tensor(
      'float32',
      new Float32Array([0.667, 1.0, 0.8]),
      [3]
    ) as InstanceType<typeof Tensor>;

    const feeds: Record<string, InstanceType<typeof Tensor>> = {
      input: inputTensor,
      input_lengths: lengthTensor,
      scales: scalesTensor,
    };

    if (speakerId !== undefined) {
      feeds.sid = new Tensor(
        'int64',
        BigInt64Array.from([BigInt(speakerId)]),
        [1]
      ) as InstanceType<typeof Tensor>;
    }

    const output = await this.session.run(
      feeds as Record<string, InstanceType<typeof Tensor>>
    );
    const audioData = output.output?.data as Float32Array | undefined;

    if (!audioData) {
      throw new Error('TTSInferenceEngine: inference produced no audio output');
    }

    return audioData;
  }

  /**
   * Release the ORT session and free native memory.
   * After dispose(), loadModel() must be called again before synthesize().
   */
  async dispose(): Promise<void> {
    await this.session?.release();
    this.session = null;
    this.loadedModelPath = null;
    this.ort = null;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/**
 * Module-level singleton — shared by CustomTTSAdapter (Story 11-4) and
 * SileroVADEngine (Story 12) to avoid duplicate ORT InferenceSession creation.
 */
export const ttsInferenceEngine = new TTSInferenceEngine();
