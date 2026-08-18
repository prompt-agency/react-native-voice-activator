import { NativeEventEmitter, NativeModules } from 'react-native';

import type { InferenceSession } from 'onnxruntime-react-native';
import type { VADConfig } from '../../public/types';
import { emitSessionEvent } from '../../internal/session-events';
import { getSileroVADModelPath } from './asset-path';

/**
 * Silero runs in JS via onnxruntime-react-native so the app can share one ORT
 * runtime with TTS. Native code only captures 16 kHz PCM; frames cross the RN
 * bridge as base64 (see Story 12-1 / sprint proposal tradeoff).
 */

type OrtModule = {
  Tensor: typeof import('onnxruntime-react-native').Tensor;
  InferenceSession: typeof import('onnxruntime-react-native').InferenceSession;
};

type VADPCMFrameEvent = { pcm: string };

type VoiceActivatorVADNative = {
  startVADCapture: (sampleRate: number) => Promise<void>;
  stopVADCapture: () => Promise<void>;
};

/** Native event name for 16 kHz float32 PCM frames (shared with session orchestrator buffering). */
export const VAD_NATIVE_PCM_FRAME_EVENT = 'VoiceActivatorOnVADPCMFrame';
const LSTM_STATE_SIZE = 128;
const SAMPLE_RATE = 16000;
/** ~1 s of 512-sample frames at 16 kHz. See {@link SileroVADEngine._enqueueFrame}. */
const MAX_QUEUED_FRAMES = 32;

function requireVADNativeModule(): VoiceActivatorVADNative {
  const mod =
    NativeModules.VoiceActivator as Partial<VoiceActivatorVADNative> | null;
  if (!mod?.startVADCapture || !mod?.stopVADCapture) {
    throw new Error(
      'VoiceActivator native module is missing VAD capture methods; rebuild the app with an up-to-date native binary.'
    );
  }
  return mod as VoiceActivatorVADNative;
}

/**
 * Native PCM capture is one shared hardware stream, but two engines can need
 * it at the same time: the pre-wake gate (`vadGateEnabled`) and the session
 * utterance detector (`session.vad`). Refcount it so the first start opens
 * capture and only the last stop closes it. An unconditional stop used to
 * silently starve every other live engine of frames, leaving the gate stuck
 * on its last speech state.
 *
 * Transitions are serialised through a single promise chain so an overlapping
 * start/stop pair cannot interleave into the wrong native call order.
 */
let nativeCaptureRefCount = 0;
let nativeCaptureQueue: Promise<void> = Promise.resolve();

function acquireNativeCapture(native: VoiceActivatorVADNative): Promise<void> {
  nativeCaptureQueue = nativeCaptureQueue
    .catch(() => undefined)
    .then(async () => {
      nativeCaptureRefCount += 1;
      if (nativeCaptureRefCount !== 1) {
        return;
      }
      try {
        await native.startVADCapture(SAMPLE_RATE);
      } catch (cause) {
        nativeCaptureRefCount -= 1;
        throw cause;
      }
    });
  return nativeCaptureQueue;
}

function releaseNativeCapture(): Promise<void> {
  nativeCaptureQueue = nativeCaptureQueue
    .catch(() => undefined)
    .then(async () => {
      if (nativeCaptureRefCount === 0) {
        return;
      }
      nativeCaptureRefCount -= 1;
      if (nativeCaptureRefCount !== 0) {
        return;
      }
      const mod =
        NativeModules.VoiceActivator as Partial<VoiceActivatorVADNative> | null;
      await mod?.stopVADCapture?.();
    });
  return nativeCaptureQueue;
}

/**
 * @internal Test-only hook. Module-level capture refcount survives between
 * tests, so a suite that starts an engine without stopping it would otherwise
 * leak a reference into the next test and suppress its `stopVADCapture` call.
 */
export function __resetNativeCaptureRefCountForTests(): void {
  nativeCaptureRefCount = 0;
  nativeCaptureQueue = Promise.resolve();
}

let nextEngineInstanceId = 0;

export class SileroVADEngine {
  private session: InferenceSession | null = null;
  private ort: OrtModule | null = null;

  /** LSTM hidden state — [2, 1, 64] = 128 floats. Reset on start/stop. */
  private h = new Float32Array(LSTM_STATE_SIZE);
  /** LSTM cell state — [2, 1, 64] = 128 floats. Reset on start/stop. */
  private c = new Float32Array(LSTM_STATE_SIZE);

  /**
   * Identifies this engine on the shared session event bus. Subscribers filter
   * on it so a gate engine's speech edge is never read as a session engine's
   * utterance boundary.
   */
  readonly id: string;

  private _running = false;
  private _speechActive = false;
  private _speechStartTime = 0;
  private _nativeSub: { remove(): void } | null = null;
  private _silenceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Frames awaiting inference. Bounded — see {@link _enqueueFrame}. */
  private _frameQueue: string[] = [];
  private _draining = false;
  private _droppedFrameCount = 0;

  /** Speech probability threshold for rising-edge detection. Default: 0.5 */
  private readonly threshold: number;
  /** Silence probability threshold for falling-edge detection. Default: 0.35 */
  private readonly silenceThreshold: number;
  /** Sustained silence (ms) before speechEnd. Default: 1500 */
  readonly silenceTimeoutMs: number;
  /** Padding (ms) included on speechEnd for STT. Default: 300 */
  readonly speechPadMs: number;

  constructor(options?: VADConfig) {
    this.threshold = options?.threshold ?? 0.5;
    this.silenceThreshold = options?.silenceThreshold ?? 0.35;
    this.silenceTimeoutMs = options?.silenceTimeoutMs ?? 1500;
    this.speechPadMs = options?.speechPadMs ?? 300;
    nextEngineInstanceId += 1;
    this.id = `silero-vad-${nextEngineInstanceId}`;
  }

  get isRunning(): boolean {
    return this._running;
  }

  /**
   * Frames discarded because inference could not keep up with the 32 ms
   * capture cadence. Non-zero means the device is CPU-starved; exposed for
   * diagnostics rather than control.
   */
  get droppedFrameCount(): number {
    return this._droppedFrameCount;
  }

  /**
   * Load the Silero VAD ONNX model. Must be called before start().
   * Idempotent — calling again with the same path is a no-op.
   */
  async loadModel(modelPath?: string): Promise<void> {
    const path = modelPath ?? getSileroVADModelPath();

    if (this.session !== null) {
      return; // already loaded
    }

    const ort = await import('onnxruntime-react-native');
    this.ort = {
      Tensor: ort.Tensor,
      InferenceSession: ort.InferenceSession,
    };
    this.session = await ort.InferenceSession.create(path, {
      executionProviders: ['cpu'],
    });
  }

  /**
   * Start VAD: resets LSTM state, calls native startVADCapture, subscribes
   * to PCM frame events. Call loadModel() first.
   */
  async start(): Promise<void> {
    if (this._running || this.session === null) return;

    this._clearSilenceTimer();
    this._resetHiddenState();
    this._speechActive = false;
    this._frameQueue = [];
    this._droppedFrameCount = 0;
    this._running = true;

    const native = requireVADNativeModule();
    const emitter = new NativeEventEmitter(NativeModules.VoiceActivator);
    this._nativeSub = emitter.addListener(
      VAD_NATIVE_PCM_FRAME_EVENT,

      ((event: VADPCMFrameEvent) => {
        if (this._running) {
          this._enqueueFrame(event.pcm);
        }
      }) as (...args: readonly object[]) => unknown
    );

    try {
      await acquireNativeCapture(native);
    } catch (cause) {
      this._running = false;
      this._nativeSub?.remove();
      this._nativeSub = null;
      throw cause;
    }
  }

  /**
   * Stop VAD: halts native PCM capture, removes listener, resets LSTM state.
   * Safe to call when already stopped.
   */
  async stop(): Promise<void> {
    if (!this._running) return;

    this._clearSilenceTimer();
    this._running = false;
    this._nativeSub?.remove();
    this._nativeSub = null;
    this._resetHiddenState();
    this._speechActive = false;
    this._frameQueue = [];

    await releaseNativeCapture();
  }

  /**
   * Silero is stateful: every frame reads the LSTM hidden/cell state and
   * writes it back across an `await`. Two inferences in flight at once lose
   * one of those updates and desynchronise the model, so frames are drained
   * strictly one at a time.
   *
   * The queue is bounded. If inference cannot keep up with the 32 ms capture
   * cadence, the oldest frames are dropped rather than growing an unbounded
   * backlog: a queue that grows without limit reports speech edges further
   * and further behind real time, which for a wake-word product is worse than
   * losing audio outright.
   */
  private _enqueueFrame(pcmBase64: string): void {
    this._frameQueue.push(pcmBase64);
    while (this._frameQueue.length > MAX_QUEUED_FRAMES) {
      this._frameQueue.shift();
      this._droppedFrameCount += 1;
    }
    if (!this._draining) {
      // Deliberately not awaited: the caller is a native event listener. Errors
      // are reported per frame inside _processFrame.
      this._drainFrameQueue().catch(() => undefined);
    }
  }

  private async _drainFrameQueue(): Promise<void> {
    this._draining = true;
    try {
      while (this._running) {
        const frame = this._frameQueue.shift();
        if (frame === undefined) {
          return;
        }
        await this._processFrame(frame);
      }
    } finally {
      this._draining = false;
    }
  }

  /**
   * Process a single 512-sample PCM frame (base64-encoded float32 LE).
   * Updates LSTM state and emits speechStart / speechEnd when thresholds cross.
   *
   * @internal Called automatically when running; exposed for testing.
   */
  async _processFrame(pcmBase64: string): Promise<void> {
    if (!this._running || !this.session || !this.ort) return;

    try {
      const { Tensor } = this.ort;

      const binaryStr = atob(pcmBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const samples = new Float32Array(bytes.buffer);

      const inputTensor = new Tensor('float32', samples, [1, samples.length]);
      const srTensor = new Tensor(
        'int64',
        BigInt64Array.from([BigInt(SAMPLE_RATE)]),
        [1]
      );
      const hTensor = new Tensor(
        'float32',
        new Float32Array(this.h),
        [2, 1, 64]
      );
      const cTensor = new Tensor(
        'float32',
        new Float32Array(this.c),
        [2, 1, 64]
      );

      const output = await this.session.run({
        input: inputTensor as InstanceType<typeof Tensor>,
        sr: srTensor as InstanceType<typeof Tensor>,
        h: hTensor as InstanceType<typeof Tensor>,
        c: cTensor as InstanceType<typeof Tensor>,
      } as Parameters<InferenceSession['run']>[0]);

      if (!this._running) return;

      const hn = output.hn;
      const cn = output.cn;
      if (hn?.data instanceof Float32Array) {
        this.h = new Float32Array(hn.data);
      }
      if (cn?.data instanceof Float32Array) {
        this.c = new Float32Array(cn.data);
      }

      const probability =
        (output.output?.data as Float32Array | undefined)?.[0] ?? 0;

      if (!this._speechActive && probability >= this.threshold) {
        this._speechActive = true;
        this._speechStartTime = Date.now();
        this._clearSilenceTimer();
        emitSessionEvent('speechStart', { sourceId: this.id });
      } else if (this._speechActive && probability < this.silenceThreshold) {
        if (this._silenceTimer === null) {
          this._silenceTimer = setTimeout(() => {
            this._silenceTimer = null;
            if (!this._running || !this._speechActive) return;
            this._speechActive = false;
            const durationMs = Date.now() - this._speechStartTime;
            emitSessionEvent('speechEnd', {
              durationMs,
              speechPadMs: this.speechPadMs,
              sourceId: this.id,
            });
          }, this.silenceTimeoutMs);
        }
      } else if (this._speechActive && probability >= this.threshold) {
        this._clearSilenceTimer();
      }
    } catch (e) {
      this._reportFrameError(e);
    }
  }

  /** Release the ORT session and free native memory. */
  async dispose(): Promise<void> {
    if (this._running) {
      await this.stop();
    }
    await (
      this.session as unknown as { release?: () => Promise<void> }
    )?.release?.();
    this.session = null;
    this.ort = null;
  }

  private _clearSilenceTimer(): void {
    if (this._silenceTimer !== null) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  private _resetHiddenState(): void {
    this.h = new Float32Array(LSTM_STATE_SIZE);
    this.c = new Float32Array(LSTM_STATE_SIZE);
  }

  private _reportFrameError(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[SileroVADEngine] frame processing failed:', message);
    emitSessionEvent('sessionError', {
      code: 'vad_inference_failed',
      category: 'internal',
      message,
      recoverable: true,
    });
  }
}
