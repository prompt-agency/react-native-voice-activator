import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { AudioSet } from 'react-native-audio-recorder-player';
import type {
  BuiltInProviderProgress,
  SpeechToTextProvider,
  TranscriptionResult,
  WhisperRNSTTConfig,
} from '../../public/types';
import { WHISPER_RN_MODELS } from './catalog';
import {
  acquireNativeCapture,
  releaseNativeCapture,
  requireVADNativeModule,
  VAD_NATIVE_PCM_FRAME_EVENT,
  type VADPCMFrameEvent,
} from '../../internal/native-pcm-capture';
import { float32PcmBase64ChunksToWavBase64 } from '../../internal/vad-float32-pcm-to-wav';

/**
 * Unique suffix per recording. A fixed filename collides when two
 * transcriptions overlap, and the loser silently transcribes the winner's audio.
 */
let recordingSequence = 0;

function nextRecordingId(): string {
  recordingSequence += 1;
  return `${Date.now()}-${recordingSequence}`;
}

import type { WhisperContext } from '../../vendor-types/whisper-rn';

type AudioRecorderPlayerModule =
  typeof import('react-native-audio-recorder-player');
type RNFSModule = typeof import('@dr.pogodin/react-native-fs');

type ActiveTranscription = {
  cancelled: boolean;
  resolveWait: () => void;
};

function stripFileScheme(path: string | undefined): string {
  return (path ?? '').replace(/^file:\/\//, '');
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class WhisperRNSTTCancelledError extends Error {
  readonly code = 'stt_cancelled';

  constructor() {
    super('Transcription was cancelled.');
    this.name = 'WhisperRNSTTCancelledError';
  }
}

export class WhisperRNSTTUnreadableAudioError extends Error {
  readonly code = 'stt_unreadable_audio';

  /**
   * `hint` carries the platform-specific suspicion. The base message stays
   * neutral because this error is now raised from every path: the iOS
   * recorder, the Android native capture, and a caller-supplied WAV file.
   * Adding a parameter keeps one exported type rather than introducing a
   * second one, which would be a public API addition.
   */
  constructor(cause?: unknown, hint?: string) {
    super(
      'WhisperRNSTTAdapter: whisper could not read the audio it was given.' +
        (hint ? ` ${hint}` : '')
    );
    this.name = 'WhisperRNSTTUnreadableAudioError';
    this.cause = cause;
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
      import('@dr.pogodin/react-native-fs'),
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
      const audioRecorderModule =
        await import('react-native-audio-recorder-player');
      this.AudioRecorderPlayer = audioRecorderModule.default;
      this.audioRecorderModule = audioRecorderModule;
    }

    // Android records through the package's own native capture — see
    // _transcribeAndroid. No third-party audio module is needed.
  }

  private getAudioSet(): AudioSet {
    if (!this.audioRecorderModule) {
      throw new Error('WhisperRNSTTAdapter: call initialize() first');
    }

    const {
      AudioSourceAndroidType,
      OutputFormatAndroidType,
      AudioEncoderAndroidType,
      AVEncoderAudioQualityIOSType,
      AVLinearPCMBitDepthKeyIOSType,
    } = this.audioRecorderModule;

    return {
      AudioSourceAndroid: AudioSourceAndroidType.VOICE_RECOGNITION,
      OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
      AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
      AudioSamplingRate: 16_000,
      AudioChannels: 1,
      AudioEncodingBitRate: 64_000,
      // v4 dropped AVEncodingOption.wav from its union; 'lpcm' maps to
      // kAudioFormatLinearPCM, and AVAudioRecorder takes the CONTAINER from the
      // URL's extension, not from this key. Measured with these exact settings:
      // a .wav path produces `RIFF....WAVE`, Int16 mono 16 kHz, which is what
      // whisper.cpp wants. The same settings on v4's default .m4a filename
      // produce an MPEG-4 container holding the same LPCM data, which whisper
      // cannot read as a wav; that is why the .wav URI below is explicit.
      AVFormatIDKeyIOS: 'lpcm',
      AVSampleRateKeyIOS: 16_000, // 16 kHz — required by whisper.cpp
      AVNumberOfChannelsKeyIOS: 1, // mono
      AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
      // v4's iOS recorder (AudioRecorderPlayer.swift) only reads
      // AVSampleRateKeyIOS, AVNumberOfChannelsKeyIOS, AVEncoderAudioQualityKeyIOS
      // and AVFormatIDKeyIOS off this object; the three keys below are set here
      // for a future version that may honor them, but v4 ignores them. The
      // measurement above confirms the defaults already match what they ask
      // for (16-bit, little-endian, signed integer), so their being ignored
      // costs nothing today.
      AVLinearPCMBitDepthKeyIOS: AVLinearPCMBitDepthKeyIOSType.bit16,
      AVLinearPCMIsBigEndianKeyIOS: false,
      AVLinearPCMIsFloatKeyIOS: false,
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

  async transcribeFromWavPath(filePath: string): Promise<TranscriptionResult> {
    if (!this.ctx) {
      throw new Error('WhisperRNSTTAdapter: call initialize() first');
    }

    if (this.activeTranscription) {
      throw new Error('WhisperRNSTTAdapter: transcription already in progress');
    }

    const activeTranscription: ActiveTranscription = {
      cancelled: false,
      resolveWait: () => undefined,
    };
    this.activeTranscription = activeTranscription;

    try {
      // Inside the try so that a bad argument clears activeTranscription via
      // the finally rather than stranding it for the life of the adapter.
      const bare = filePath.replace(/^file:\/\//, '');
      const uri = Platform.OS === 'ios' ? `file://${bare}` : bare;

      const { stop, promise } = this.ctx.transcribe(uri, {
        language: WHISPER_RN_MODELS[this.config.modelId].language,
      });
      this.activeStop = stop;

      let result: string;
      try {
        ({ result } = await promise);
      } catch (e) {
        // cancel() awaits activeStop(), which aborts the native transcription
        // and can make the whisper promise reject. Checked first so a
        // cancellation surfaces as WhisperRNSTTCancelledError rather than
        // being misreported as unreadable audio.
        if (activeTranscription.cancelled) {
          throw new WhisperRNSTTCancelledError();
        }
        throw new WhisperRNSTTUnreadableAudioError(
          e,
          'The file may not be 16 kHz mono PCM WAV.'
        );
      }

      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      return { text: result.trim(), provider: this.name };
    } finally {
      this.activeStop = null;
      this.activeTranscription = null;
    }
  }

  private async _transcribeIOS(): Promise<TranscriptionResult> {
    // v4's default export is a process-wide singleton instance, not a
    // constructor. Its record-back listener is therefore global: every path out
    // of this method must remove it, or the next transcription inherits it.
    const recorder = this.AudioRecorderPlayer!;
    const rnfs = this.rnfs!;
    const maxRecordingMs = this.config.maxRecordingMs ?? 10_000;
    let resolveWait = () => undefined as void;
    // Hoisted so finally can clean up whichever path was actually recorded
    let recordedPath: string | undefined;
    let wavBarePathForCleanup: string | undefined;

    const activeTranscription: ActiveTranscription = {
      cancelled: false,
      resolveWait: () => resolveWait(),
    };
    this.activeTranscription = activeTranscription;

    // v4's default recording filename is `sound_<timestamp>.m4a`. Passing
    // `undefined` here would leave 'lpcm' data written to an .m4a-extensioned
    // path, so an explicit .wav URI is required. Uses the same cache
    // directory as the Android path's temp files.
    const tmpDir = `${rnfs.CachesDirectoryPath}/voice-activator`;
    const recordingUri = `${tmpDir}/whisper-ios-${nextRecordingId()}.wav`;

    try {
      await rnfs.mkdir(tmpDir);
      await recorder.startRecorder(recordingUri, this.getAudioSet(), false);
    } catch (e) {
      // startRecorder() can reject (denied mic permission, unwritable
      // directory). If activeTranscription were left set, every later
      // transcribe() would throw "transcription already in progress"
      // forever, since nothing else would ever clear it.
      this.activeTranscription = null;
      throw e;
    }
    recorder.addRecordBackListener(() => {});

    if (activeTranscription.cancelled) {
      // Free the listener and clear active-transcription state before the
      // stopRecorder() await below, not after: stopRecorder() can reject
      // (the native side throws when the recorder isn't in a recording
      // state, exactly the race this branch exists to handle). If either
      // cleanup ran after that await, a rejection would skip it, leaking
      // the listener on the shared singleton and wedging every future
      // transcribe() behind "already in progress" for the life of the
      // adapter. Removal is unconditionally safe regardless of ordering.
      recorder.removeRecordBackListener();
      this.activeTranscription = null;
      try {
        recordedPath = await recorder.stopRecorder();
      } catch {
        // Already cancelling; a failed stop here doesn't change the outcome.
      }
      try {
        const bare = stripFileScheme(recordedPath);
        if (bare) await this.rnfs!.unlink(bare);
      } catch {
        // ignore cleanup errors
      }
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

      // Use the path returned by stopRecorder() for both transcription and cleanup
      recordedPath = await recorder.stopRecorder();
      wavBarePathForCleanup = stripFileScheme(recordedPath);
      if (!wavBarePathForCleanup) {
        throw new Error('WhisperRNSTTAdapter: recorder returned no file path');
      }

      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      // CRITICAL: ctx.transcribe() is NOT async — returns { stop, promise } synchronously
      // noSpeechThold: segments suppressed when no_speech_prob > threshold (0.95 = maximally permissive)
      // temperature: 0 = greedy decoding, prevents hallucination/repetition loops on trailing silence
      const { stop, promise } = this.ctx!.transcribe(
        `file://${wavBarePathForCleanup}`,
        {
          language: WHISPER_RN_MODELS[this.config.modelId].language,
          beamSize: 5,
          noSpeechThold: 0.95,
          temperature: 0,
        }
      );
      this.activeStop = stop;

      let result: string;
      try {
        ({ result } = await promise);
      } catch (e) {
        // cancel() awaits activeStop(), which aborts the native
        // transcription and can make the whisper promise reject. Checked
        // first so a cancellation surfaces as WhisperRNSTTCancelledError
        // rather than being misreported as unreadable audio.
        if (activeTranscription.cancelled) {
          throw new WhisperRNSTTCancelledError();
        }
        throw new WhisperRNSTTUnreadableAudioError(
          e,
          'The iOS recording container may not be PCM WAV.'
        );
      }

      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      return { text: result.trim(), provider: this.name };
    } finally {
      this.activeStop = null;
      this.activeTranscription = null;
      recorder.removeRecordBackListener();
      if (wavBarePathForCleanup) {
        try {
          await this.rnfs!.unlink(wavBarePathForCleanup);
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
    let subscription: { remove: () => void } | null = null;
    let captureHeld = false;

    const activeTranscription: ActiveTranscription = {
      cancelled: false,
      resolveWait: () => resolveWait(),
    };
    this.activeTranscription = activeTranscription;

    const rnfs = this.rnfs!;
    const tmpDir = `${rnfs.CachesDirectoryPath}/voice-activator`;
    // Unique per call: a fixed name collides when two transcriptions overlap,
    // and the loser silently transcribes the winner's audio.
    const wavPath = `${tmpDir}/whisper-android-${nextRecordingId()}.wav`;

    // Setup that runs before the main try/finally still has to clear
    // activeTranscription on failure. mkdir() rejects on an unwritable or full
    // cache directory and requireVADNativeModule() throws when the consumer has
    // not linked the native module; either one would otherwise leave
    // activeTranscription set with nothing to clear it, so every later
    // transcribe() would throw "transcription already in progress" for the life
    // of the adapter. Mirrors the startRecorder() guard on the iOS path.
    let native: ReturnType<typeof requireVADNativeModule>;
    try {
      await rnfs.mkdir(tmpDir);

      native = requireVADNativeModule();
      const emitter = new NativeEventEmitter(NativeModules.VoiceActivator);
      subscription = emitter.addListener(VAD_NATIVE_PCM_FRAME_EVENT, ((
        event: VADPCMFrameEvent
      ) => {
        if (!activeTranscription.cancelled) {
          pcmChunks.push(event.pcm);
        }
      }) as (...args: readonly object[]) => unknown);
    } catch (e) {
      this.activeTranscription = null;
      if (subscription) {
        subscription.remove();
        subscription = null;
      }
      throw e;
    }

    // Acquisition happens inside the try so the finally always releases it.
    // Throwing between acquire and try would leak the capture refcount, and a
    // leaked reference suppresses stopVADCapture for every other consumer for
    // the rest of the process.
    try {
      await acquireNativeCapture(native);
      captureHeld = true;

      // cancel() may have arrived while capture was being acquired. Without this
      // check its resolveWait() call is a no-op — the timer below is not armed
      // yet — so the cancellation would be lost and the recording would run its
      // full maxRecordingMs before anyone noticed.
      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      const waitForRecording = new Promise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, maxRecordingMs);
        resolveWait = () => {
          clearTimeout(timeoutId);
          resolve();
        };
      });

      await waitForRecording;

      // Release before assembling the WAV so the mic is not held during
      // transcription. Refcounted, so other consumers keep their frames.
      if (captureHeld) {
        captureHeld = false;
        await releaseNativeCapture();
      }
      subscription?.remove();
      subscription = null;

      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      // Native capture emits 16 kHz float32 frames, unlike the 16-bit stream the
      // previous third-party module produced.
      const wavBase64 = float32PcmBase64ChunksToWavBase64(pcmChunks);
      await rnfs.writeFile(wavPath, wavBase64, 'base64');

      // Android: bare path — NO file:// prefix
      const { stop, promise } = this.ctx!.transcribe(wavPath, {
        language: WHISPER_RN_MODELS[this.config.modelId].language,
      });
      this.activeStop = stop;

      let result: string;
      try {
        ({ result } = await promise);
      } catch (e) {
        // cancel() awaits activeStop(), which aborts the native transcription
        // and can make the whisper promise reject. Checked first so a
        // cancellation surfaces as WhisperRNSTTCancelledError rather than
        // being misreported as unreadable audio.
        if (activeTranscription.cancelled) {
          throw new WhisperRNSTTCancelledError();
        }
        throw new WhisperRNSTTUnreadableAudioError(
          e,
          'The WAV assembled from the native capture frames may be malformed.'
        );
      }

      if (activeTranscription.cancelled) {
        throw new WhisperRNSTTCancelledError();
      }

      return { text: result.trim(), provider: this.name };
    } finally {
      this.activeStop = null;
      this.activeTranscription = null;
      if (captureHeld) {
        captureHeld = false;
        await releaseNativeCapture().catch(() => undefined);
      }
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

    // Android capture is released by _transcribeAndroid once the wait resolves,
    // so there is nothing module-specific to stop here.

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
    this.rnfs = null;
  }
}
