import { NativeEventEmitter, NativeModules } from 'react-native';

import {
  addSessionListener,
  emitSessionEvent,
} from '../internal/session-events';
import { float32PcmBase64ChunksToWavBase64 } from '../internal/vad-float32-pcm-to-wav';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../internal/base64';
import {
  SileroVADEngine,
  VAD_NATIVE_PCM_FRAME_EVENT,
} from '../providers/vad/SileroVADEngine';
import type {
  AudioPreprocessingProvider,
  SpeechToTextProvider,
  TextToSpeechProvider,
  TranscriptionResult,
  VoiceSession,
  VoiceSessionConfig,
  VoiceSessionEventListener,
  VoiceSessionEventMap,
  VoiceSessionEventName,
  VoiceSessionState,
  VoiceSessionSubscription,
  WakeWordError,
} from '../public/types';
class VoiceSessionListenAbortedError extends Error {
  constructor() {
    super('listen_aborted');
    this.name = 'VoiceSessionListenAbortedError';
  }
}

/**
 * Renders a thrown cause into a human-readable message.
 *
 * Rejections crossing the React Native bridge are frequently plain objects or
 * strings rather than Error instances, so an `instanceof Error` check alone
 * discards the only diagnostic the caller had and reports a bare
 * "Session <code>." — which is indistinguishable between a missing model, a
 * failed native install, and a permissions problem.
 */
function describeCause(code: string, cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === 'string' && cause.trim()) return cause;
  if (cause && typeof cause === 'object') {
    const record = cause as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.reason;
    if (typeof message === 'string' && message.trim()) return message;
    try {
      const json = JSON.stringify(cause);
      if (json && json !== '{}') return `Session ${code}: ${json}`;
    } catch {
      // circular or otherwise non-serialisable — fall through
    }
  }
  return `Session ${code}.`;
}

export class VoiceSessionOrchestrator implements VoiceSession {
  private _state: VoiceSessionState = 'idle';
  /** 1-based turn counter. Incremented after each successful TTS playback. */
  private _turnCount = 0;
  private _closed = false;
  private _bargingIn = false;
  private _silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private _listenAbort: AbortController | null = null;
  private _vadEngine: SileroVADEngine | null = null;
  /** Instance-scoped listener registry — isolated from other session instances. */
  private readonly _instanceListeners = new Map<
    string,
    Set<VoiceSessionEventListener<VoiceSessionEventName>>
  >();

  constructor(
    private readonly config: VoiceSessionConfig,
    private readonly sttProvider: SpeechToTextProvider,
    private readonly ttsProvider: TextToSpeechProvider,
    private readonly audioPreprocessingProvider?: AudioPreprocessingProvider
  ) {}

  get state(): VoiceSessionState {
    return this._state;
  }

  private _getVad(): SileroVADEngine {
    if (this.config.vad === undefined) {
      throw new Error('VoiceSessionOrchestrator: VAD path requires config.vad');
    }
    if (!this._vadEngine) {
      this._vadEngine = new SileroVADEngine(this.config.vad);
    }
    return this._vadEngine;
  }

  private _abortActiveListen(): void {
    this._listenAbort?.abort();
  }

  addListener<TEventName extends VoiceSessionEventName>(
    eventName: TEventName,
    listener: VoiceSessionEventListener<TEventName>
  ): VoiceSessionSubscription {
    let set = this._instanceListeners.get(eventName);
    if (!set) {
      set = new Set();
      this._instanceListeners.set(eventName, set);
    }
    (set as Set<typeof listener>).add(listener);
    return {
      remove() {
        (set as Set<typeof listener>).delete(listener);
      },
    };
  }

  /** Emits to both the global session event bus and this instance's own listeners. */
  private _emitAll<TEventName extends VoiceSessionEventName>(
    eventName: TEventName,
    payload: VoiceSessionEventMap[TEventName]
  ): void {
    emitSessionEvent(eventName, payload);
    const set = this._instanceListeners.get(eventName);
    if (set) {
      for (const listener of [
        ...set,
      ] as VoiceSessionEventListener<TEventName>[]) {
        // A throwing app listener must not abort the turn loop mid-flight, and
        // must not stop the remaining listeners from being notified.
        try {
          listener(payload);
        } catch (cause) {
          if (__DEV__) {
            console.warn(
              `[VoiceActivator] session "${eventName}" listener threw:`,
              cause
            );
          }
        }
      }
    }
  }

  async listen(): Promise<void> {
    if (this._closed || this._state !== 'idle') {
      return;
    }
    await this._runTurn();
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._clearSilenceTimeout();
    this._abortActiveListen();
    this._listenAbort = null;
    this._closed = true;
    this._bargingIn = false;
    this._state = 'closed';
    await this._vadEngine?.stop().catch(() => undefined);
    await this.sttProvider.cancel().catch(() => undefined);
    await this.ttsProvider.stop().catch(() => undefined);
    this._emitAll('sessionEnded', { reason: 'explicit' });
  }

  /**
   * Abort the session without emitting sessionEnded.
   * Used for verification-rejected sessions that never fully started (D-05).
   * Idempotent — safe to call multiple times.
   */
  async abort(): Promise<void> {
    if (this._closed) return;
    this._clearSilenceTimeout();
    this._abortActiveListen();
    this._listenAbort = null;
    this._closed = true;
    this._bargingIn = false;
    this._state = 'closed';
    await this._vadEngine?.stop().catch(() => undefined);
    await this.sttProvider.cancel().catch(() => undefined);
    await this.ttsProvider.stop().catch(() => undefined);
    // Intentionally does NOT emit sessionEnded (D-05)
  }

  /**
   * @internal Triggered by wake word detection while a session is active.
   * Interrupts TTS playback (if speaking) or discards a pending AI response
   * (if waiting), then restarts the turn from the listening state.
   * No-op when the session is idle, listening, or closed.
   */
  async bargeIn(): Promise<void> {
    if (this._closed) return;
    if (
      this._state === 'idle' ||
      this._state === 'closed' ||
      this._state === 'listening'
    ) {
      return;
    }
    this._bargingIn = true;
    if (this._state === 'speaking') {
      await this.ttsProvider.stop().catch(() => undefined);
    }
    // If 'waiting': AI handler is not cancellable — _bargingIn causes discard on resolve
  }

  /**
   * @internal Called by the voice-activator when a wake word fires with session config active.
   */
  async start(): Promise<void> {
    this._emitAll('sessionStarted', {});
    await this._runTurn();
  }

  private async _transcribeWithVad(): Promise<TranscriptionResult> {
    const transcribeFile = this.sttProvider.transcribeFromWavPath;
    if (typeof transcribeFile !== 'function') {
      throw new Error(
        'VoiceSessionOrchestrator: config.vad requires an STT provider that implements transcribeFromWavPath (e.g. WhisperRNSTTAdapter).'
      );
    }

    const vad = this._getVad();
    const ac = new AbortController();
    this._listenAbort = ac;

    const subs: {
      pcm: { remove(): void } | null;
      speechStart: VoiceSessionSubscription | null;
      speechEnd: VoiceSessionSubscription | null;
    } = { pcm: null, speechStart: null, speechEnd: null };

    const pcmChunks: string[] = [];
    let speechStartChunkIndex = 0;

    try {
      await vad.loadModel(this.config.vad?.modelPath);
      if (this._closed || ac.signal.aborted) {
        throw new VoiceSessionListenAbortedError();
      }

      const emitter = new NativeEventEmitter(NativeModules.VoiceActivator);
      subs.pcm = emitter.addListener(VAD_NATIVE_PCM_FRAME_EVENT, ((e: {
        pcm: string;
      }) => {
        if (
          !this._closed &&
          this._state === 'listening' &&
          !ac.signal.aborted
        ) {
          pcmChunks.push(e.pcm);
        }
      }) as (...args: readonly object[]) => unknown);

      // Only this session's engine defines the utterance boundary. The
      // pre-wake gate engine publishes to the same bus, and an unfiltered
      // listener would let a gate speech edge cut the turn short.
      const isOwnEngine = (payload: { sourceId?: string } | undefined) =>
        payload?.sourceId === vad.id;

      subs.speechStart = addSessionListener('speechStart', (payload) => {
        if (!isOwnEngine(payload)) return;
        this._clearSilenceTimeout();
        speechStartChunkIndex = Math.max(0, pcmChunks.length - 1);
      });

      const utterancePromise = new Promise<{
        durationMs: number;
        speechPadMs: number;
      }>((resolve, reject) => {
        let settled = false;
        subs.speechEnd = addSessionListener('speechEnd', (payload) => {
          if (settled || !isOwnEngine(payload)) return;
          settled = true;
          resolve(payload);
        });
        ac.signal.addEventListener(
          'abort',
          () => {
            if (settled) return;
            settled = true;
            reject(new VoiceSessionListenAbortedError());
          },
          { once: true }
        );
      });

      await vad.start();

      if (this._closed || ac.signal.aborted) {
        throw new VoiceSessionListenAbortedError();
      }

      const endPayload = await utterancePromise;

      await new Promise<void>((resolve, reject) => {
        let done = false;
        const id = setTimeout(() => {
          if (done) return;
          done = true;
          if (ac.signal.aborted) reject(new VoiceSessionListenAbortedError());
          else resolve();
        }, endPayload.speechPadMs);
        const onAbort = () => {
          if (done) return;
          done = true;
          clearTimeout(id);
          reject(new VoiceSessionListenAbortedError());
        };
        ac.signal.addEventListener('abort', onAbort, { once: true });
      });

      await vad.stop();

      const slice = pcmChunks.slice(speechStartChunkIndex);
      const VAD_SAMPLE_RATE = 16000;

      let wavBase64: string;
      if (this.audioPreprocessingProvider) {
        // NOISE-03: denoise the speech segment before STT
        const rawWavBase64 = float32PcmBase64ChunksToWavBase64(slice);
        const bytes = base64ToUint8Array(rawWavBase64);
        const denoised = await this.audioPreprocessingProvider.process(
          bytes.buffer as ArrayBuffer,
          VAD_SAMPLE_RATE
        );
        wavBase64 = uint8ArrayToBase64(new Uint8Array(denoised));
      } else {
        wavBase64 = float32PcmBase64ChunksToWavBase64(slice);
      }

      const RNFS = await import('react-native-fs');
      const dir = `${RNFS.default.CachesDirectoryPath}/voice-activator`;
      await RNFS.default.mkdir(dir);
      const wavPath = `${dir}/vad-utterance-${Date.now()}.wav`;
      await RNFS.default.writeFile(wavPath, wavBase64, 'base64');

      if (this._closed || ac.signal.aborted) {
        throw new VoiceSessionListenAbortedError();
      }

      try {
        return await transcribeFile.call(this.sttProvider, wavPath);
      } finally {
        try {
          await RNFS.default.unlink(wavPath);
        } catch {
          /* ignore */
        }
      }
    } finally {
      subs.pcm?.remove();
      subs.speechStart?.remove();
      subs.speechEnd?.remove();
      this._listenAbort = null;
      await vad.stop().catch(() => undefined);
    }
  }

  private async _runTurn(): Promise<void> {
    while (true) {
      if (this._closed) return;

      this._state = 'listening';
      this._emitAll('sessionListening', {});
      this._startSilenceTimeout();

      let transcriptionText: string;
      try {
        const result =
          this.config.vad !== undefined
            ? await this._transcribeWithVad()
            : await this.sttProvider.transcribe();
        this._clearSilenceTimeout();
        if (this._closed) return;
        transcriptionText = result.text;
      } catch (cause) {
        this._clearSilenceTimeout();
        if (this._closed) return;
        if (cause instanceof VoiceSessionListenAbortedError) {
          return;
        }
        this._state = 'idle';
        this._emitAll('sessionError', this._buildError('stt_failed', cause));
        return;
      }

      this._state = 'transcribing';
      this._emitAll('sessionTranscribed', { text: transcriptionText });
      if (this._closed) return;

      this._state = 'waiting';
      let aiResponse: string;
      try {
        aiResponse = await this.config.aiHandler(transcriptionText);
        if (this._closed) return;
        if (this._bargingIn) {
          this._bargingIn = false;
          continue;
        }
      } catch (cause) {
        if (this._closed) return;
        if (this._bargingIn) {
          this._bargingIn = false;
          continue;
        }
        this._state = 'idle';
        this._emitAll(
          'sessionError',
          this._buildError('ai_handler_failed', cause)
        );
        return;
      }

      this._state = 'speaking';
      this._emitAll('sessionSpeaking', { text: aiResponse });

      try {
        await this.ttsProvider.speak(aiResponse);
        if (this._closed) return;
        if (this._bargingIn) {
          this._bargingIn = false;
          continue;
        }
      } catch (cause) {
        if (this._closed) return;
        if (this._bargingIn) {
          this._bargingIn = false;
          continue;
        }
        this._state = 'idle';
        this._emitAll('sessionError', this._buildError('tts_failed', cause));
        return;
      }

      this._turnCount += 1;
      this._emitAll('sessionTurnComplete', { turn: this._turnCount });

      if (this._closed) return;

      // maxTurns: close the session when the configured turn limit is reached
      if (
        this.config.maxTurns !== undefined &&
        this._turnCount >= this.config.maxTurns
      ) {
        this._clearSilenceTimeout();
        this._closed = true;
        this._bargingIn = false;
        this._state = 'closed';
        await this._vadEngine?.stop().catch(() => undefined);
        await this.sttProvider.cancel().catch(() => undefined);
        await this.ttsProvider.stop().catch(() => undefined);
        this._emitAll('sessionEnded', { reason: 'explicit' });
        return;
      }

      if (this.config.reListenMode === 'auto') {
        continue;
      } else {
        this._state = 'idle';
        return;
      }
    }
  }

  private _startSilenceTimeout(): void {
    if (!this.config.silenceTimeoutMs || this._silenceTimer !== null) return;
    this._silenceTimer = setTimeout(() => {
      this._silenceTimer = null;
      if (this._closed || this._state !== 'listening') return;
      this._abortActiveListen();
      this._closed = true;
      this._bargingIn = false;
      this._state = 'closed';
      if (this._vadEngine) {
        this._vadEngine.stop().catch(() => undefined);
      }
      this.sttProvider.cancel().catch(() => undefined);
      this.ttsProvider.stop().catch(() => undefined);
      this._emitAll('sessionEnded', { reason: 'timeout' });
    }, this.config.silenceTimeoutMs);
  }

  private _clearSilenceTimeout(): void {
    if (this._silenceTimer !== null) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  private _buildError(code: string, cause: unknown): WakeWordError {
    return {
      code,
      category: 'internal',
      message: describeCause(code, cause),
      recoverable: true,
    };
  }
}
