import { NativeModules } from 'react-native';

import type { TextToSpeechProvider, TTSOptions } from '../../public/types';

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Configuration for SherpaOnnxTTSAdapter.
 *
 * All path properties must be absolute local file paths. The model assets
 * (`.onnx`, `tokens.txt`, `espeak-ng-data/`) must be present on-device before
 * the first `speak()` call — download them with your preferred file-transfer
 * library (e.g. @dr.pogodin/react-native-fs) or bundle them via the Expo config plugin.
 *
 * Compatible Piper VITS models are available from the sherpa-onnx releases:
 * https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html
 */
export interface SherpaOnnxTTSConfig {
  /**
   * Absolute local path to the Piper VITS `.onnx` model file.
   * @example `${RNFS.DocumentDirectoryPath}/piper-tts/en_US-ryan-low.onnx`
   */
  modelPath: string;

  /**
   * Absolute local path to `tokens.txt` shipped with the Piper model.
   * @example `${RNFS.DocumentDirectoryPath}/piper-tts/tokens.txt`
   */
  tokensPath: string;

  /**
   * Absolute local path to the `espeak-ng-data/` directory.
   * This directory contains phoneme data used by sherpa-onnx for text
   * normalization. It is bundled in the sherpa-onnx model tarballs from
   * https://github.com/k2-fsa/sherpa-onnx/releases
   * @example `${RNFS.DocumentDirectoryPath}/piper-tts/espeak-ng-data`
   */
  dataDir: string;

  /**
   * Speaker ID for multi-speaker models. Default: 0 (first/only speaker).
   */
  speakerId?: number;

  /**
   * Speech speed multiplier. Values > 1 are faster; < 1 are slower.
   * Default: 1.0.
   */
  speed?: number;

  /** VITS noise_scale — controls phoneme duration variation. Default: 0.667. */
  noiseScale?: number;

  /** VITS noise_scale_w — controls pitch variation. Default: 0.8. */
  noiseScaleW?: number;

  /** VITS length_scale — sets base speech rate (inverse of speed). Default: 1.0. */
  lengthScale?: number;
}

// ─── Native module access ─────────────────────────────────────────────────────

type SherpaOnnxNative = {
  synthesizeTTS(options: object): Promise<void>;
  stopPlayback(): Promise<void>;
};

function getNativeModule(): SherpaOnnxNative {
  const mod = NativeModules.VoiceActivator as SherpaOnnxNative | undefined;
  if (!mod?.synthesizeTTS) {
    throw new Error(
      'SherpaOnnxTTSAdapter: the VoiceActivator native module is not ' +
        'available or does not expose synthesizeTTS. Ensure the library is linked.'
    );
  }
  return mod;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * TextToSpeechProvider that uses the sherpa-onnx native layer to run Piper VITS
 * models entirely on-device.
 *
 * On iOS this calls into the bundled XCFramework C API; on Android it calls into
 * the sherpa-onnx JNI layer from the bundled AAR. Both platforms synthesize to a
 * temporary WAV file which is played back via the native audio layer.
 *
 * @example
 * ```ts
 * import { SherpaOnnxTTSAdapter } from 'react-native-voice-activator';
 * import * as RNFS from '@dr.pogodin/react-native-fs';
 *
 * const tts = new SherpaOnnxTTSAdapter({
 *   modelPath:  `${RNFS.DocumentDirectoryPath}/piper-tts/en_US-ryan-low.onnx`,
 *   tokensPath: `${RNFS.DocumentDirectoryPath}/piper-tts/tokens.txt`,
 *   dataDir:    `${RNFS.DocumentDirectoryPath}/piper-tts/espeak-ng-data`,
 * });
 *
 * await initialize({ ttsProvider: tts, ... });
 * ```
 */
export class SherpaOnnxTTSAdapter implements TextToSpeechProvider {
  readonly name = 'sherpa-onnx-tts';

  constructor(private readonly config: SherpaOnnxTTSConfig) {}

  async speak(text: string, _options?: TTSOptions): Promise<void> {
    await getNativeModule().synthesizeTTS({
      modelPath: this.config.modelPath,
      tokensPath: this.config.tokensPath,
      dataDir: this.config.dataDir,
      text,
      speakerId: this.config.speakerId ?? 0,
      speed: this.config.speed ?? 1.0,
      noiseScale: this.config.noiseScale ?? 0.667,
      noiseScaleW: this.config.noiseScaleW ?? 0.8,
      lengthScale: this.config.lengthScale ?? 1.0,
    });
  }

  async stop(): Promise<void> {
    const mod = NativeModules.VoiceActivator as
      | { stopPlayback?: () => Promise<void> }
      | undefined;
    await mod?.stopPlayback?.();
  }
}
