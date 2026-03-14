import type {
  SpeechToTextProvider,
  TextToSpeechProvider,
  VoiceSession,
  VoiceSessionConfig,
  VoiceSessionEventListener,
  VoiceSessionEventMap,
  VoiceSessionEventName,
  VoiceSessionState,
  VoiceSessionSubscription,
  WakeWordError,
} from '../public/types';
import { emitSessionEvent } from '../internal/session-events';

export class VoiceSessionOrchestrator implements VoiceSession {
  private _state: VoiceSessionState = 'idle';
  /** 1-based turn counter. Incremented after each successful TTS playback. */
  private _turnCount = 0;
  private _closed = false;
  private _bargingIn = false;
  private _silenceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Instance-scoped listener registry — isolated from other session instances. */
  private readonly _instanceListeners = new Map<
    string,
    Set<VoiceSessionEventListener<VoiceSessionEventName>>
  >();

  constructor(
    private readonly config: VoiceSessionConfig,
    private readonly sttProvider: SpeechToTextProvider,
    private readonly ttsProvider: TextToSpeechProvider
  ) {}

  get state(): VoiceSessionState {
    return this._state;
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
        listener(payload);
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
    this._closed = true;
    this._bargingIn = false;
    this._state = 'closed';
    await this.sttProvider.cancel().catch(() => undefined);
    await this.ttsProvider.stop().catch(() => undefined);
    this._emitAll('sessionEnded', { reason: 'explicit' });
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

  private async _runTurn(): Promise<void> {
    if (this._closed) return;

    this._state = 'listening';
    this._emitAll('sessionListening', {});
    this._startSilenceTimeout();

    let transcriptionText: string;
    try {
      const result = await this.sttProvider.transcribe();
      this._clearSilenceTimeout();
      if (this._closed) return;
      transcriptionText = result.text;
    } catch (cause) {
      this._clearSilenceTimeout();
      if (this._closed) return;
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
        await this._runTurn();
        return;
      }
    } catch (cause) {
      if (this._closed) return;
      if (this._bargingIn) {
        this._bargingIn = false;
        await this._runTurn();
        return;
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
        await this._runTurn();
        return;
      }
    } catch (cause) {
      if (this._closed) return;
      if (this._bargingIn) {
        this._bargingIn = false;
        await this._runTurn();
        return;
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
      await this.sttProvider.cancel().catch(() => undefined);
      await this.ttsProvider.stop().catch(() => undefined);
      this._emitAll('sessionEnded', { reason: 'explicit' });
      return;
    }

    if (this.config.reListenMode === 'auto') {
      await this._runTurn();
    } else {
      this._state = 'idle';
    }
  }

  private _startSilenceTimeout(): void {
    if (!this.config.silenceTimeoutMs || this._silenceTimer !== null) return;
    this._silenceTimer = setTimeout(() => {
      this._silenceTimer = null;
      if (this._closed || this._state !== 'listening') return;
      this._closed = true;
      this._bargingIn = false;
      this._state = 'closed';
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
      message: cause instanceof Error ? cause.message : `Session ${code}.`,
      recoverable: true,
    };
  }
}
