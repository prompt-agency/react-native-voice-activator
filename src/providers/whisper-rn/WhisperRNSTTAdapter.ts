import { Platform } from 'react-native';
import type { AudioSet } from 'react-native-audio-recorder-player';
import type {
  BuiltInProviderProgress,
  SpeechToTextProvider,
  TranscriptionResult,
  WhisperRNSTTConfig,
} from '../../public/types';
import { WHISPER_RN_MODELS } from './catalog';

import type { WhisperContext } from '../../vendor-types/whisper-rn';

type AudioRecorderPlayerModule = typeof import('react-native-audio-recorder-player');
type RNFSModule = typeof import('react-native-fs');
type LiveAudioStreamModule =
  typeof import('@fugood/react-native-audio-pcm-stream');
type LiveAudioStreamType = LiveAudioStreamModule['default'];
type LiveAudioStreamSubscription = ReturnType<
  LiveAudioStreamType['addListener']
>;

type ActiveTranscription = {
  cancelled: boolean;
  resolveWait: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Assemble a valid 16kHz mono 16-bit PCM WAV file from raw base64 PCM chunks
 * and return the result as a base64 string suitable for RNFS.writeFile(..., 'base64').
 */
function buildWavBase64(pcmChunks: string[]): string {
  const pcmArrays = pcmChunks.map(base64ToUint8Array);
  const pcmLength = pcmArrays.reduce((sum, arr) => sum + arr.length, 0);

  const sampleRate = 16_000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8); // 32000
  const blockAlign = numChannels * (bitsPerSample / 8); // 2

  // 44-byte RIFF/WAV header + PCM data
  const wavBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(wavBuffer);

  // RIFF chunk
  view.setUint8(0, 0x52); // R
  view.setUint8(1, 0x49); // I
  view.setUint8(2, 0x46); // F
  view.setUint8(3, 0x46); // F
  view.setUint32(4, 36 + pcmLength, true); // ChunkSize
  view.setUint8(8, 0x57); // W
  view.setUint8(9, 0x41); // A
  view.setUint8(10, 0x56); // V
  view.setUint8(11, 0x45); // E

  // fmt sub-chunk
  view.setUint8(12, 0x66); // f
  view.setUint8(13, 0x6d); // m
  view.setUint8(14, 0x74); // t
  view.setUint8(15, 0x20); //  (space)
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat: PCM = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk header
  view.setUint8(36, 0x64); // d
  view.setUint8(37, 0x61); // a
  view.setUint8(38, 0x74); // t
  view.setUint8(39, 0x61); // a
  view.setUint32(40, pcmLength, true);

  // Copy PCM data into the buffer
  const wavBytes = new Uint8Array(wavBuffer);
  let offset = 44;
  for (const arr of pcmArrays) {
    wavBytes.set(arr, offset);
    offset += arr.length;
  }

  return uint8ArrayToBase64(wavBytes);
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class WhisperRNSTTCancelledError extends Error {
  readonly code = 'stt_cancelled';

  constructor() {
    super('Transcription was cancelled.');
    this.name = 'WhisperRNSTTCancelledError';
  }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class WhisperRNSTTAdapter implements SpeechToTextProvider {
  readonly name = 'whisper-rn';

  private ctx: WhisperContext | null = null;
  private AudioRecorderPlayer: AudioRecorderPlayerModule['default'] | null =
    null;
  private audioRecorderModule: AudioRecorderPlayerModule | null = null;
  private rnfs: RNFSModule | null = null;
  private audioPcmStream: LiveAudioStreamType | null = null; // Android only
  private activeTranscription: ActiveTranscription | null = null;
  private activeStop: (() => Promise<void>) | null = null;

  constructor(private readonly config: WhisperRNSTTConfig) {}

  async initialize(
    onProgress?: (update: BuiltInProviderProgress) => void
  ): Promise<void> {
    if (this.ctx) {
      return; // idempotent — already initialized
    }

    const modelEntry = WHISPER_RN_MODELS[this.config.modelId];

    const [whisperModule, rnfsModule] = await Promise.all([
      import('whisper.rn'),
      import('react-native-fs'),
    ]);

    const { initWhisper } = whisperModule;
    this.rnfs = rnfsModule;

    const modelDir = `${this.rnfs.DocumentDirectoryPath}/whisper-rn`;
    const modelPath = `${modelDir}/${modelEntry.filename}`;

    await this.rnfs.mkdir(modelDir);

    const alreadyDownloaded = await this.rnfs.exists(modelPath);
    if (!alreadyDownloaded) {
      onProgress?.({
        message: `Downloading ${this.config.modelId}...`,
        progress: 0,
      });
      await this.rnfs.downloadFile({
        fromUrl: modelEntry.url,
        toFile: modelPath,
        progress: (res) => {
          onProgress?.({
            message: `Downloading ${this.config.modelId}...`,
            progress: Math.round((res.bytesWritten / res.contentLength) * 100),
          });
        },
      }).promise;
    }

    onProgress?.({ message: 'Loading model...' });

    try {
      this.ctx = await initWhisper({ filePath: modelPath });
    } catch (e) {
      throw new Error(`WhisperRNSTTAdapter: model failed to load: ${e}`);
    }

    if (Platform.OS === 'ios') {
      const audioRecorderModule = await import('react-native-audio-recorder-player');
      this.AudioRecorderPlayer = audioRecorderModule.default;
      this.audioRecorderModule = audioRecorderModule;
    }

    if (Platform.OS === 'android') {
      const pcmModule = await import('@fugood/react-native-audio-pcm-stream');
      this.audioPcmStream = pcmModule.default;
      this.audioPcmStream.init({
        sampleRate: 16_000,
        channels: 1,
        bitsPerSample: 16,
        bufferSize: 4096,
      });
    }
  }

  private getAudioSet(): AudioSet {
    if (!this.audioRecorderModule) {
      throw new Error('WhisperRNSTTAdapter: call initialize() first');
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
      AVFormatIDKeyIOS: AVEncodingOption.wav, // whisper.cpp requires WAV
      AVSampleRateKeyIOS: 16_000, // must be 16 kHz
      AVNumberOfChannelsKeyIOS: 1, // mono
      AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
      AVModeIOS: AVModeIOSOption.measurement,
    };
  }

  async transcribe(): Promise<TranscriptionResult> {
    if (!this.ctx) {
      throw new Error('WhisperRNSTTAdapter: call initialize() first');
    }

    if (this.activeTranscription) {
      throw new Error('WhisperRNSTTAdapter: transcription already in progress');
    }

    return Platform.OS === 'android'
      ? this._transcribeAndroid()
      : this._transcribeIOS();
  }

  private async _transcribeIOS(): Promise<TranscriptionResult> {
    const recorder = new this.AudioRecorderPlayer!();
    const maxRecordingMs = this.config.maxRecordingMs ?? 10_000;
    let resolveWait = () => undefined as void;

    const activeTranscription: ActiveTranscription = {
      cancelled: false,
      resolveWait: () => resolveWait(),
    };
    this.activeTranscription = activeTranscription;

    const wavPath = await recorder.startRecorder(
      undefined,
      this.getAudioSet(),
      false
    );

    if (activeTranscription.cancelled) {
      await recorder.stopRecorder();
      this.activeTranscription = null;
      throw new WhisperRNSTTCancelledError();
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

      const recordedPath = await recorder.stopRecorder();

      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      // CRITICAL: ctx.transcribe() is NOT async — returns { stop, promise } synchronously
      const { stop, promise } = this.ctx!.transcribe(
        `file://${recordedPath}`,
        { language: WHISPER_RN_MODELS[this.config.modelId].language }
      );
      this.activeStop = stop;

      const { result } = await promise;

      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      return { text: result.trim(), provider: this.name };
    } finally {
      this.activeStop = null;
      this.activeTranscription = null;
      recorder.removeRecordBackListener();
      if (wavPath) {
        try {
          await this.rnfs!.unlink(wavPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  private async _transcribeAndroid(): Promise<TranscriptionResult> {
    const maxRecordingMs = this.config.maxRecordingMs ?? 10_000;
    const pcmChunks: string[] = [];
    let resolveWait = () => undefined as void;
    let subscription: LiveAudioStreamSubscription | null = null;

    const activeTranscription: ActiveTranscription = {
      cancelled: false,
      resolveWait: () => resolveWait(),
    };
    this.activeTranscription = activeTranscription;

    const rnfs = this.rnfs!;
    const tmpDir = `${rnfs.CachesDirectoryPath}/voice-activator`;
    const wavPath = `${tmpDir}/recording.wav`;

    await rnfs.mkdir(tmpDir);

    subscription = this.audioPcmStream!.addListener(
      'data',
      (data: string) => {
        if (!activeTranscription.cancelled) {
          pcmChunks.push(data);
        }
      }
    );

    this.audioPcmStream!.start();

    const waitForRecording = new Promise<void>((resolve) => {
      const timeoutId = setTimeout(resolve, maxRecordingMs);
      resolveWait = () => {
        clearTimeout(timeoutId);
        resolve();
      };
    });

    try {
      await waitForRecording;

      this.audioPcmStream!.stop();
      subscription.remove();
      subscription = null;

      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      // Assemble PCM chunks into a valid WAV file
      const wavBase64 = buildWavBase64(pcmChunks);
      await rnfs.writeFile(wavPath, wavBase64, 'base64');

      // Android: bare path — NO file:// prefix
      const { stop, promise } = this.ctx!.transcribe(wavPath, {
        language: WHISPER_RN_MODELS[this.config.modelId].language,
      });
      this.activeStop = stop;

      const { result } = await promise;

      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      return { text: result.trim(), provider: this.name };
    } finally {
      this.activeStop = null;
      this.activeTranscription = null;
      if (subscription) {
        subscription.remove();
      }
      try {
        await rnfs.unlink(wavPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  async cancel(): Promise<void> {
    if (!this.activeTranscription) {
      return;
    }

    this.activeTranscription.cancelled = true;
    this.activeTranscription.resolveWait();

    if (Platform.OS === 'android' && this.audioPcmStream) {
      try {
        this.audioPcmStream.stop();
      } catch {
        // ignore — may not be running
      }
    }

    if (this.activeStop) {
      try {
        await this.activeStop();
      } catch {
        // stop() may throw if transcription already completed — safe to ignore
        // [Source: whisper.rn Issue #183]
      } finally {
        this.activeStop = null;
      }
    }
  }

  async dispose(): Promise<void> {
    await this.cancel();
    await this.ctx?.release();
    this.ctx = null;
    this.AudioRecorderPlayer = null;
    this.audioRecorderModule = null;
    this.audioPcmStream = null;
    this.rnfs = null;
  }
}
