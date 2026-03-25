import { NativeModules } from 'react-native';

// ─── Native module bridge ─────────────────────────────────────────────────────

type AudioPlaybackNative = {
  playPCMChunk(pcmBase64: string, sampleRate: number): Promise<void>;
  playWav(filePath: string): Promise<void>;
  stopPlayback(): Promise<void>;
  setVolumeDucking(active: boolean): Promise<void>;
};

function getNative(): AudioPlaybackNative {
  const mod = NativeModules.VoiceActivator as AudioPlaybackNative | undefined;
  if (!mod?.playPCMChunk) {
    throw new Error(
      'AudioPlaybackManager: native VoiceActivator module not available'
    );
  }
  return mod;
}

// ─── PCM → base64 encoding ────────────────────────────────────────────────────

/**
 * Encode a Float32Array as a base64 string for bridge-safe transport.
 * Uses Uint8Array + btoa — no Node.js Buffer (incompatible with Hermes).
 * Processes in 8192-byte chunks to avoid stack overflow on btoa for large arrays.
 */
function float32ToBase64(pcm: Float32Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ─── AudioPlaybackManager ─────────────────────────────────────────────────────

/**
 * AudioPlaybackManager — TS wrapper around native AudioPlayback methods.
 *
 * Provides:
 *  - Streaming PCM chunk playback: `playChunk(pcm, sampleRate)`
 *  - WAV file playback: `playWav(filePath)`
 *  - Immediate stop: `stop()`
 *
 * Manages audio ducking state: activates ducking on the first `playChunk` call,
 * deactivates on `stop()`. On iOS ducking is handled automatically by the native
 * AVAudioSession category; on Android via AudioManager focus request.
 */
export class AudioPlaybackManager {
  private isDucking = false;

  /**
   * Feed a PCM float32 chunk to the native ring buffer for streaming playback.
   * Activates audio ducking on the first call. Subsequent calls do not re-duck.
   *
   * @param pcm        Raw PCM float32 samples (mono, at the target sample rate)
   * @param sampleRate Sample rate in Hz (must match the model's output rate, e.g. 22050)
   */
  async playChunk(pcm: Float32Array, sampleRate: number): Promise<void> {
    const native = getNative();
    let activatedThisCall = false;
    if (!this.isDucking) {
      await native.setVolumeDucking(true);
      activatedThisCall = true;
    }
    try {
      await native.playPCMChunk(float32ToBase64(pcm), sampleRate);
      if (activatedThisCall) {
        this.isDucking = true;
      }
    } catch (e) {
      if (activatedThisCall) {
        await native.setVolumeDucking(false).catch(() => {});
        this.isDucking = false;
      }
      throw e;
    }
  }

  /**
   * Play a WAV file to completion.
   *
   * @param filePath Absolute local file path (e.g. from RNFS.CachesDirectoryPath)
   */
  async playWav(filePath: string): Promise<void> {
    return getNative().playWav(filePath);
  }

  /**
   * Stop playback immediately — drains the ring buffer and deactivates ducking.
   */
  async stop(): Promise<void> {
    const native = getNative();
    await native.stopPlayback();
    if (this.isDucking) {
      await native.setVolumeDucking(false);
      this.isDucking = false;
    }
  }
}

/** Module-level singleton — import and use directly. */
export const audioPlaybackManager = new AudioPlaybackManager();
