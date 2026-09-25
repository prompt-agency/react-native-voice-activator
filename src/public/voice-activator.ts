import {
  getVoiceActivatorRuntimeBridge,
  setRuntimeAudioRouteChangedHandler,
  setRuntimeErrorHandler,
  setRuntimeInterruptionHandler,
  setRuntimeStatusHandler,
  setWakeWordDetectedHandler,
} from '../internal/native-module';
import {
  createNativeRuntimeConfiguration,
  createRuntimeConfiguration,
} from '../domain/detection-config';
import type { WakeWordRuntimeConfiguration } from '../domain/detection-config';
import {
  addRuntimeListener,
  emitRuntimeEvent,
} from '../internal/runtime-events';
import {
  addSessionListener,
  emitSessionEvent,
} from '../internal/session-events';
import { createRuntimeStore } from '../internal/runtime-store';
import { base64ToFloat32Array } from '../internal/base64';
import type { VoiceActivatorEngineRuntime } from '../internal/engine-runtime';
import { createNativeManagedEngineRuntime } from '../engines';
import type {
  AntiSpoofingProvider,
  AudioPreprocessingProvider,
  AudioRoute,
  EnrollmentData,
  ProviderError,
  SpeakerVerificationProvider,
  VoiceActivatorApi,
  VoiceSession,
  VoiceSessionConfig,
  WakeWordDetectedEvent,
  WakeWordError,
  WakeWordEventMap,
  WakeWordInitializationOptions,
  WakeWordStatus,
} from './types';
import { VoiceSessionOrchestrator } from '../runtime/session-orchestrator';
import {
  SileroVADEngine,
  VAD_NATIVE_PCM_FRAME_EVENT,
} from '../providers/vad/SileroVADEngine';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  isOperationTimeoutError,
  withTimeout,
} from '../internal/with-timeout';

let activeEngineRuntime: VoiceActivatorEngineRuntime | null = null;
let engineRuntimeRunning = false;

/**
 * Incremented on every initialize() call so an overlapping pair cannot both
 * claim ownership of the runtime.
 *
 * initialize() builds a fresh engine runtime, awaits native initialize(), and
 * only then assigns activeEngineRuntime. Two concurrent calls used to both
 * reach that assignment, so the last writer won and the loser's
 * already-initialized native handle leaked — disposeEngineRuntime() only ever
 * touches the current pointer. Reachable from React 19 StrictMode's
 * double-invoke, a double-tap, or two screens initializing on mount.
 */
let initializeToken = 0;
let nativeStatusUpdateQueue: Promise<void> = Promise.resolve();
let activeRuntimeConfiguration: ReturnType<
  typeof createRuntimeConfiguration
> | null = null;
let providerOrchestrationQueue: Promise<void> = Promise.resolve();
let providerOrchestrationGeneration = 0;

let activeProviderTimeoutMs: number = DEFAULT_PROVIDER_TIMEOUT_MS;

type ActiveProviderFlow = {
  id: number;
  stage: 'transcribing' | 'speaking';
  sttProvider?: WakeWordRuntimeConfiguration['sttProvider'];
  ttsProvider?: WakeWordRuntimeConfiguration['ttsProvider'];
  speechText?: string;
};

let activeProviderFlow: ActiveProviderFlow | null = null;
let activeSessionConfig: VoiceSessionConfig | null = null;
let activeVoiceSession: VoiceSessionOrchestrator | null = null;
let activeSpeakerVerificationProvider: SpeakerVerificationProvider | null =
  null;
let activeAudioPreprocessingProvider: AudioPreprocessingProvider | null = null;
let activeAntiSpoofingProvider: AntiSpoofingProvider | null = null;
let activeSpoofingThreshold: number = 0.5;
let activeVerificationThreshold: number = 0.55;
let activeVerificationFailureBehavior: 'open' | 'closed' | 'emit' = 'closed';
let verificationAudioBuffer: ArrayBuffer | null = null;

// ─── VAD pre-wake gate state (VAD-01 / VAD-02 / VAD-03) ─────────────────────

let activeVadGateEnabled: boolean = false;
let activeVadGateThreshold: number = 0.5;
let activeVadGateEngine: SileroVADEngine | null = null;
let vadGateSpeechActive: boolean = false;
let vadGateSpeechSub: { remove(): void } | null = null;
let vadGateSilenceSub: { remove(): void } | null = null;

// ─── PCM ring buffer for verification audio ───────────────────────────────────

/** ~1 second of 512-sample frames at 16 kHz */
const VAD_RING_BUFFER_SIZE = 32;
/**
 * Decoded frames, not base64. Frames arrive every ~32 ms; decoding the whole
 * ring on each arrival meant re-running ~87k character operations per frame on
 * the JS thread for audio that had already been decoded once.
 */
let vadPcmRingBuffer: Float32Array[] = [];
let vadPcmRingBufferSub: { remove(): void } | null = null;
/** Set when the ring changes; the combined buffer is rebuilt only on read. */
let verificationAudioDirty = false;

function pushVadPcmFrame(pcmBase64: string): void {
  const frame = base64ToFloat32Array(pcmBase64);
  if (frame === null) {
    // Malformed frame from native. Dropping one frame is preferable to letting
    // the error escape into the native event emitter.
    return;
  }
  vadPcmRingBuffer.push(frame);
  if (vadPcmRingBuffer.length > VAD_RING_BUFFER_SIZE) {
    vadPcmRingBuffer.shift();
  }
  verificationAudioDirty = true;
}

function updateVerificationAudioFromRingBuffer(): void {
  verificationAudioDirty = false;
  if (vadPcmRingBuffer.length === 0) {
    verificationAudioBuffer = null;
    return;
  }
  let totalLength = 0;
  for (const chunk of vadPcmRingBuffer) {
    totalLength += chunk.length;
  }
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of vadPcmRingBuffer) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  verificationAudioBuffer = combined.buffer;
}

function clearVadRingBuffer(): void {
  vadPcmRingBuffer = [];
  verificationAudioDirty = false;
  verificationAudioBuffer = null;
}

export function setVerificationAudioBuffer(buffer: ArrayBuffer | null): void {
  verificationAudioBuffer = buffer;
  // An explicit set wins over anything still queued in the ring, otherwise the
  // next read would rebuild over it.
  verificationAudioDirty = false;
}

function getVerificationAudioBuffer(): ArrayBuffer | null {
  // Built lazily: verification reads this at most once per wake word, so the
  // concatenation does not belong on the per-frame path.
  if (verificationAudioDirty) {
    updateVerificationAudioFromRingBuffer();
  }
  return verificationAudioBuffer;
}

addSessionListener('sessionEnded', () => {
  if (activeVoiceSession?.state === 'closed') {
    activeVoiceSession = null;
  }
});

function emitWakeWordDetected(payload: WakeWordDetectedEvent) {
  emitRuntimeEvent('wakeWordDetected', payload);
}

/**
 * Bump the generation so queued and in-flight provider callbacks discard their
 * results, without touching the queue itself.
 *
 * Use this from *inside* a queued callback. Resetting the queue from within it
 * would let a concurrent wake word run in parallel with the work still running.
 */
function bumpProviderOrchestrationGeneration() {
  providerOrchestrationGeneration += 1;
}

/**
 * Invalidate queued provider work and detach the queue.
 *
 * The generation bump alone is not sufficient. `providerOrchestrationQueue` is a
 * single serially-chained promise, and each queued callback only reaches its
 * generation check once it runs. If the callback currently holding the chain
 * never settles — a `transcribe()` or `speak()` that hangs — every later wake
 * word is chained behind it and never runs at all.
 *
 * A promise cannot be cancelled, so the wedged one is left to settle (or not)
 * on its own; its generation check makes it a no-op either way. Replacing the
 * queue reference means new work no longer waits behind it.
 *
 * Only call this from lifecycle paths (initialize, stopDetection, dispose,
 * native status teardown), never from inside a queued callback.
 */
function invalidateProviderOrchestration() {
  bumpProviderOrchestrationGeneration();
  providerOrchestrationQueue = Promise.resolve();
}

function createProviderError(
  provider: string,
  code: string,
  message: string,
  category: ProviderError['category'] = 'internal'
): ProviderError {
  return {
    provider,
    code,
    category,
    message,
    recoverable: true,
  };
}

function createProviderErrorFromCause(
  provider: string,
  code: string,
  cause: unknown,
  fallbackMessage: string
): ProviderError {
  return createProviderError(
    provider,
    code,
    cause instanceof Error ? cause.message : fallbackMessage
  );
}

async function cleanupActiveProviderFlow() {
  const flow = activeProviderFlow;
  activeProviderFlow = null;

  if (!flow) {
    return;
  }

  if (flow.stage === 'transcribing' && flow.sttProvider) {
    try {
      await flow.sttProvider.cancel();
    } catch (cause) {
      emitRuntimeEvent(
        'transcriptionError',
        createProviderErrorFromCause(
          flow.sttProvider.name,
          'stt_cancel_failed',
          cause,
          'Failed to cancel transcription.'
        )
      );
    }
  }

  if (flow.stage === 'speaking' && flow.ttsProvider) {
    try {
      await flow.ttsProvider.stop();
    } catch (cause) {
      emitRuntimeEvent(
        'speechError',
        createProviderErrorFromCause(
          flow.ttsProvider.name,
          'tts_stop_failed',
          cause,
          'Failed to stop speech playback.'
        )
      );
    }
  }
}

function queueProviderOrchestration(payload: WakeWordDetectedEvent) {
  const queuedGeneration = providerOrchestrationGeneration;
  emitWakeWordDetected(payload);

  // Fast path: barge-in an actively-running session immediately, outside the queue.
  // In auto mode, orchestrator.start() holds the queue indefinitely (recursive _runTurn
  // loop that only exits on close/error), so barge-in MUST be handled here to fire
  // within the 300ms TTS-stop window and not be serialised behind the running session.
  // Only non-idle, non-closed states are interrupted — idle falls through to the queue
  // so a wake word after a manual-mode turn naturally starts a fresh session.
  if (
    activeSessionConfig &&
    activeVoiceSession &&
    activeVoiceSession.state !== 'closed' &&
    activeVoiceSession.state !== 'idle'
  ) {
    activeVoiceSession.bargeIn().catch(() => undefined);
    return;
  }

  // VAD pre-wake gate (VAD-01): suppress wake word when no speech energy detected.
  // Placed AFTER barge-in fast-path so barge-in is unaffected (VAD-03).
  if (activeVadGateEnabled && !vadGateSpeechActive) {
    return;
  }

  providerOrchestrationQueue = providerOrchestrationQueue
    .catch(() => {
      // Keep the queue alive after a prior failure.
    })
    .then(async () => {
      if (providerOrchestrationGeneration !== queuedGeneration) {
        return;
      }

      const runtimeStatus = getCurrentStatus();
      if (!runtimeStatus.isListening || runtimeStatus.state !== 'running') {
        return;
      }

      const configuration = activeRuntimeConfiguration;
      const generation = queuedGeneration;

      // Session mode: when session config is active and both STT + TTS providers are
      // available, delegate full conversation loop to VoiceSessionOrchestrator.
      if (
        activeSessionConfig &&
        configuration?.sttProvider &&
        configuration?.ttsProvider
      ) {
        // Start a fresh session (any previously active session was already handled by
        // the fast-path barge-in above, or was closed/idle before this queued call ran).
        // Invalidate the provider orchestration generation before closing the old session
        // so that any pending verification IIFEs from the previous session are discarded
        // by the generation-ID guard (VERIFY-02).
        bumpProviderOrchestrationGeneration();
        await closeActiveVoiceSession();
        const orchestrator = new VoiceSessionOrchestrator(
          activeSessionConfig,
          configuration.sttProvider,
          configuration.ttsProvider,
          activeAudioPreprocessingProvider ?? undefined
        );
        activeVoiceSession = orchestrator;

        // Concurrent verification gate (D-06): does not block session start.
        // Verification fires as a fire-and-forget IIFE alongside orchestrator.start().
        if (activeSpeakerVerificationProvider) {
          const verGen = providerOrchestrationGeneration;
          const isSessionMode = true; // we are inside the session-mode branch
          (async () => {
            try {
              const verificationAudio = getVerificationAudioBuffer();

              if (verificationAudio) {
                // Build concurrent checks: verification + optional anti-spoofing
                const verificationPromise =
                  activeSpeakerVerificationProvider!.identifySpeaker(
                    verificationAudio,
                    16000,
                    activeVerificationThreshold
                  );

                const spoofPromise = activeAntiSpoofingProvider
                  ? activeAntiSpoofingProvider.detectSpoofing(
                      verificationAudio,
                      16000
                    )
                  : Promise.resolve(null as number | null);

                const [verificationResult, rawSpoofScore] = await Promise.all([
                  verificationPromise,
                  spoofPromise,
                ]);

                // Generation guard: discard if a new wake word has fired
                if (providerOrchestrationGeneration !== verGen) return;

                const verificationPassed = verificationResult.name !== null;
                const spoofPassed =
                  rawSpoofScore !== null
                    ? rawSpoofScore <= activeSpoofingThreshold
                    : true; // No anti-spoofing = pass

                const passed = verificationPassed && spoofPassed;

                if (passed && verificationResult.name !== null) {
                  if (isSessionMode) {
                    emitSessionEvent('speakerVerificationPassed', {
                      score: verificationResult.score,
                      speakerId: verificationResult.name,
                    });
                  }
                } else {
                  const score = verificationResult.score;
                  if (isSessionMode) {
                    emitSessionEvent('speakerVerificationFailed', { score });
                  }
                  if (activeVerificationFailureBehavior === 'closed') {
                    await orchestrator.abort();
                    if (activeVoiceSession === orchestrator) {
                      activeVoiceSession = null;
                    }
                  }
                  // 'open': session continues — no action needed
                  // 'emit': event already fired above — app decides
                }
              }
              // No audio buffer available: optimistic pass (no-op), no events
            } catch {
              if (providerOrchestrationGeneration !== verGen) return;
              if (isSessionMode) {
                emitSessionEvent('speakerVerificationFailed', { score: 0 });
              }
              if (activeVerificationFailureBehavior === 'closed') {
                await orchestrator.abort();
                if (activeVoiceSession === orchestrator) {
                  activeVoiceSession = null;
                }
              }
            }
          })();
        }

        await orchestrator.start();
        return;
      }

      if (!configuration?.sttProvider) {
        return;
      }

      const sttProvider = configuration.sttProvider;
      const ttsProvider = configuration.ttsProvider;
      const flowId = generation;

      activeProviderFlow = {
        id: flowId,
        stage: 'transcribing',
        sttProvider,
        ttsProvider,
      };

      emitRuntimeEvent('transcriptionStarted', {
        provider: sttProvider.name,
      });

      try {
        const transcription = await withTimeout(
          'transcribe',
          sttProvider.name,
          activeProviderTimeoutMs,
          () => sttProvider.transcribe()
        );

        if (
          providerOrchestrationGeneration !== generation ||
          activeProviderFlow?.id !== flowId
        ) {
          return;
        }

        emitRuntimeEvent('transcriptionResult', transcription);

        if (!configuration.autoSpeak || !ttsProvider) {
          return;
        }

        activeProviderFlow = {
          id: flowId,
          stage: 'speaking',
          sttProvider,
          ttsProvider,
          speechText: transcription.text,
        };

        emitRuntimeEvent('speechStarted', {
          text: transcription.text,
          provider: ttsProvider.name,
        });

        await withTimeout(
          'speak',
          ttsProvider.name,
          activeProviderTimeoutMs,
          () => ttsProvider.speak(transcription.text)
        );

        if (
          providerOrchestrationGeneration !== generation ||
          activeProviderFlow?.id !== flowId
        ) {
          return;
        }

        emitRuntimeEvent('speechCompleted', {
          provider: ttsProvider.name,
        });
      } catch (cause) {
        if (
          providerOrchestrationGeneration !== generation ||
          activeProviderFlow?.id !== flowId
        ) {
          return;
        }

        const timedOut = isOperationTimeoutError(cause);

        if (activeProviderFlow?.stage === 'speaking' && ttsProvider) {
          // Ask the provider to stand down. It may not comply — that is exactly
          // why the bound exists — so the result is not awaited on the queue.
          if (timedOut) {
            Promise.resolve(ttsProvider.stop()).catch(() => undefined);
          }

          emitRuntimeEvent(
            'speechError',
            createProviderErrorFromCause(
              ttsProvider.name,
              timedOut ? 'tts_timeout' : 'tts_speak_failed',
              cause,
              timedOut
                ? 'Speech playback timed out.'
                : 'Speech playback failed.'
            )
          );
        } else {
          if (timedOut) {
            Promise.resolve(sttProvider.cancel()).catch(() => undefined);
          }

          let errorCode = 'stt_transcribe_failed';
          let fallbackMessage = 'Transcription failed.';

          if (timedOut) {
            errorCode = 'stt_timeout';
            fallbackMessage = 'Transcription timed out.';
          } else if (isCancelledTranscriptionError(cause)) {
            errorCode = 'stt_cancelled';
            fallbackMessage = 'Transcription was cancelled.';
          }

          emitRuntimeEvent(
            'transcriptionError',
            createProviderErrorFromCause(
              sttProvider.name,
              errorCode,
              cause,
              fallbackMessage
            )
          );
        }
      } finally {
        if (
          providerOrchestrationGeneration === generation &&
          activeProviderFlow?.id === flowId
        ) {
          activeProviderFlow = null;
        }
      }
    });
}

const runtimeStore = createRuntimeStore(
  getVoiceActivatorRuntimeBridge().getStatus() ?? {
    state: 'unsupported',
    isAvailable: false,
    isListening: false,
    canStart: false,
    reason: 'No runtime is available.',
    lastError: null,
  }
);
setWakeWordDetectedHandler((payload) => {
  queueProviderOrchestration(payload);
});

async function stopEngineRuntime() {
  if (!activeEngineRuntime || !engineRuntimeRunning) {
    return;
  }

  await activeEngineRuntime.stop();
  engineRuntimeRunning = false;
}

async function startEngineRuntime() {
  if (!activeEngineRuntime || engineRuntimeRunning) {
    return;
  }

  await activeEngineRuntime.start();
  engineRuntimeRunning = true;
}

async function closeActiveVoiceSession() {
  if (activeVoiceSession) {
    await activeVoiceSession.close().catch(() => undefined);
    activeVoiceSession = null;
  }
}

async function syncEngineRuntimeWithNativeStatus(
  status: WakeWordStatus,
  previousStatus: WakeWordStatus
) {
  if (
    status.state === 'unsupported' &&
    !status.isListening &&
    activeEngineRuntime
  ) {
    invalidateProviderOrchestration();
    await cleanupActiveProviderFlow();
    await closeActiveVoiceSession();
    await disposeEngineRuntime();
  }

  if (status.state === 'interrupted') {
    invalidateProviderOrchestration();
    await cleanupActiveProviderFlow();
    await closeActiveVoiceSession();
    await stopEngineRuntime();
    if (activeVadGateEngine) {
      await activeVadGateEngine.stop().catch(() => undefined);
      vadGateSpeechActive = false;
    }
    return;
  }

  if (
    previousStatus.state === 'interrupted' &&
    status.state === 'running' &&
    status.isListening
  ) {
    await startEngineRuntime();
    if (activeVadGateEngine && !activeVadGateEngine.isRunning) {
      await activeVadGateEngine.start().catch(() => undefined);
    }
    return;
  }

  if (
    (status.state === 'stopped' ||
      status.state === 'idle' ||
      status.state === 'error') &&
    !status.isListening
  ) {
    invalidateProviderOrchestration();
    await cleanupActiveProviderFlow();
    await closeActiveVoiceSession();
    await stopEngineRuntime();
    if (activeVadGateEngine) {
      await activeVadGateEngine.stop().catch(() => undefined);
      vadGateSpeechActive = false;
    }
  }
}

if (typeof setRuntimeStatusHandler === 'function') {
  setRuntimeStatusHandler((status) => {
    nativeStatusUpdateQueue = nativeStatusUpdateQueue
      .catch(() => {
        // Keep the queue alive after a prior failure.
      })
      .then(async () => {
        const previousStatus = getCurrentStatus();

        try {
          await syncEngineRuntimeWithNativeStatus(status, previousStatus);
          runtimeStore.setStatus(status);
        } catch (cause) {
          applyRuntimeError(
            createRuntimeFailure('syncEngineRuntimeWithNativeStatus', cause)
          );

          if (
            previousStatus.state === 'interrupted' &&
            status.state === 'running' &&
            status.isListening
          ) {
            try {
              await getVoiceActivatorRuntimeBridge().stopDetection?.();
            } catch {
              // Best-effort rollback when native recovery cannot be matched by the engine runtime.
            }
          }
        }
      });
  });
}
if (typeof setRuntimeErrorHandler === 'function') {
  setRuntimeErrorHandler((error) => {
    const latestStatus = resolveStatus(getCurrentStatus());
    const nextStatus = latestStatus.lastError
      ? latestStatus
      : {
          ...latestStatus,
          lastError: error,
        };

    runtimeStore.setStatus(nextStatus);
    runtimeStore.mergeLastError(nextStatus.lastError ?? error);
  });
}
if (typeof setRuntimeInterruptionHandler === 'function') {
  setRuntimeInterruptionHandler((payload) => {
    emitRuntimeEvent('interruption', payload);
  });
}
if (typeof setRuntimeAudioRouteChangedHandler === 'function') {
  setRuntimeAudioRouteChangedHandler((payload) => {
    emitRuntimeEvent('audioRouteChanged', payload);
  });
}

function createUnsupportedRuntimeError(methodName: string) {
  return new Error(
    `VoiceActivator.${methodName} is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.`
  );
}

function rejectUnsupportedRuntime(methodName: string): Promise<void> {
  const error = createRuntimeUnavailableError(methodName);
  runtimeStore.recordError(error);
  return Promise.reject(new Error(error.message));
}

function createRuntimeUnavailableError(methodName: string): WakeWordError {
  return {
    // The native module is absent — a property of the build, not of package
    // internals, and nothing the app can retry its way out of.
    category: 'platform',
    code: 'runtime_unavailable',
    message: createUnsupportedRuntimeError(methodName).message,
    recoverable: false,
  };
}

function getCurrentStatus(): WakeWordStatus {
  return runtimeStore.getStatus();
}

function resolveStatus(fallback: WakeWordStatus): WakeWordStatus {
  return getVoiceActivatorRuntimeBridge().getStatus?.() ?? fallback;
}

function createRuntimeFailure(
  methodName: string,
  cause: unknown
): WakeWordError {
  const message =
    cause instanceof Error
      ? cause.message
      : `VoiceActivator.${methodName} failed unexpectedly.`;

  return {
    category: 'internal',
    code: `${methodName}_failed`,
    message,
    recoverable: true,
  };
}

function resolveLatestKnownRuntimeError(
  methodName: string,
  cause: unknown
): WakeWordError {
  if (isWakeWordError(cause)) {
    return cause;
  }

  const currentStatus = getCurrentStatus();
  if (currentStatus.lastError) {
    return currentStatus.lastError;
  }

  const latestStatus = resolveStatus(currentStatus);
  if (latestStatus.lastError) {
    return latestStatus.lastError;
  }

  return createRuntimeFailure(methodName, cause);
}

function isWakeWordError(value: unknown): value is WakeWordError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'category' in value &&
    'code' in value &&
    'message' in value &&
    'recoverable' in value
  );
}

/**
 * Mark a configuration failure non-recoverable.
 *
 * This previously forced `recoverable: true`, discarding whatever the caller
 * supplied. A configuration error is a missing or invalid model asset, a bad
 * keyword path, an unreadable bundle — none of which a retry with the same
 * options will fix. The app has to change the configuration and call
 * initialize() again, which is exactly what `recoverable: false` is for.
 */
function createConfigurationFailure(error: WakeWordError): WakeWordError {
  return {
    ...error,
    recoverable: false,
  };
}

function isCancelledTranscriptionError(value: unknown): value is {
  code: 'stt_cancelled';
  message: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === 'stt_cancelled' &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

function applyRuntimeError(error: WakeWordError) {
  runtimeStore.setStatus({
    ...getCurrentStatus(),
    state: 'error',
    isListening: false,
    canStart: false,
    lastError: error,
  });
  emitRuntimeEvent('error', error);
}

function syncKnownRuntimeFailure(
  methodName: string,
  cause: unknown,
  nextState: 'error' | undefined = 'error'
) {
  const currentStatus = getCurrentStatus();
  if (currentStatus.lastError) {
    runtimeStore.setStatus(currentStatus);
    return;
  }

  const latestStatus = resolveStatus(currentStatus);
  if (latestStatus.lastError) {
    runtimeStore.setStatus(latestStatus);
    return;
  }

  const runtimeError = resolveLatestKnownRuntimeError(methodName, cause);
  runtimeStore.recordError(
    runtimeError.category === 'configuration'
      ? createConfigurationFailure(runtimeError)
      : runtimeError,
    nextState
  );
}

function resolveEngineRuntime(): VoiceActivatorEngineRuntime {
  return createNativeManagedEngineRuntime();
}

async function disposeEngineRuntime() {
  if (!activeEngineRuntime) {
    return;
  }

  await activeEngineRuntime.dispose();
  activeEngineRuntime = null;
  engineRuntimeRunning = false;
}

/**
 * @internal Exposed for unit tests only. Not part of the public API and not
 * re-exported from src/index.ts.
 */
export const __testables = {
  createConfigurationFailure,
  createRuntimeUnavailableError,
  createProviderError,
};

const addListener: VoiceActivatorApi['addListener'] = addRuntimeListener;

export const voiceActivator: VoiceActivatorApi = {
  async initialize(options: WakeWordInitializationOptions = {}) {
    if (__DEV__ && options.speakerModelPath && Platform.OS !== 'android') {
      console.warn(
        '[VoiceActivator] speakerModelPath is Android-only and is ignored on ' +
          Platform.OS
      );
    }
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.initialize) {
      return rejectUnsupportedRuntime('initialize');
    }
    const runtimeConfiguration = createRuntimeConfiguration(options);
    const nextEngineRuntime = resolveEngineRuntime();
    const token = ++initializeToken;
    let resolvedSttProvider = runtimeConfiguration.sttProvider;
    let resolvedTtsProvider = runtimeConfiguration.ttsProvider;

    runtimeStore.transitionToState('initializing', {
      canStart: false,
      isListening: false,
      lastError: null,
    });

    try {
      invalidateProviderOrchestration();
      await cleanupActiveProviderFlow();
      await closeActiveVoiceSession();
      await disposeEngineRuntime();
      activeRuntimeConfiguration = null;

      const resolvedRuntimeConfiguration = {
        ...runtimeConfiguration,
        ...(resolvedSttProvider ? { sttProvider: resolvedSttProvider } : {}),
        ...(resolvedTtsProvider ? { ttsProvider: resolvedTtsProvider } : {}),
      };

      await activeRuntime.initialize(
        createNativeRuntimeConfiguration(resolvedRuntimeConfiguration)
      );
      await nextEngineRuntime.initialize(resolvedRuntimeConfiguration, {
        onDetected(payload) {
          queueProviderOrchestration(payload);
        },
        onError(error) {
          applyRuntimeError(error);
        },
      });
      // A newer initialize() started while this one was awaiting native work.
      // It owns the runtime now, so dispose what this call built rather than
      // orphaning it, and leave every shared global to the newer call.
      if (token !== initializeToken) {
        await nextEngineRuntime.dispose().catch(() => undefined);
        return;
      }

      activeRuntimeConfiguration = resolvedRuntimeConfiguration;
      activeSessionConfig = options.session ?? null;
      activeSpeakerVerificationProvider =
        options?.speakerVerificationProvider ?? null;
      activeAudioPreprocessingProvider =
        options?.audioPreprocessingProvider ?? null;
      activeAntiSpoofingProvider = options?.antiSpoofingProvider ?? null;
      activeSpoofingThreshold = options?.spoofingThreshold ?? 0.5;
      activeProviderTimeoutMs =
        options?.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
      activeVerificationThreshold = options?.verificationThreshold ?? 0.55;
      activeVerificationFailureBehavior =
        options?.verificationFailureBehavior ?? 'closed';

      // VAD gate: dispose previous engine if re-initializing
      if (activeVadGateEngine) {
        vadGateSpeechSub?.remove();
        vadGateSilenceSub?.remove();
        vadPcmRingBufferSub?.remove();
        vadGateSpeechSub = null;
        vadGateSilenceSub = null;
        vadPcmRingBufferSub = null;
        await activeVadGateEngine.dispose().catch(() => undefined);
        activeVadGateEngine = null;
        vadGateSpeechActive = false;
        clearVadRingBuffer();
      }
      activeVadGateEnabled = options?.vadGateEnabled ?? false;
      activeVadGateThreshold = options?.vadGateThreshold ?? 0.5;

      activeEngineRuntime = nextEngineRuntime;
      engineRuntimeRunning = false;
      runtimeStore.setStatus(
        resolveStatus({
          ...getCurrentStatus(),
          state: 'ready',
          isAvailable: true,
          isListening: false,
          canStart: true,
          lastError: null,
        })
      );
    } catch (cause) {
      syncKnownRuntimeFailure('initialize', cause);
      try {
        await activeRuntime.dispose?.();
      } catch {
        // Best-effort rollback when engine initialization fails.
      }
      throw cause;
    }
  },

  async startDetection() {
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.startDetection) {
      return rejectUnsupportedRuntime('startDetection');
    }

    runtimeStore.transitionToState('starting', {
      canStart: false,
      lastError: null,
    });

    try {
      await activeRuntime.startDetection();
      await startEngineRuntime();

      // Start VAD gate engine if enabled
      if (activeVadGateEnabled) {
        if (!activeVadGateEngine) {
          activeVadGateEngine = new SileroVADEngine({
            threshold: activeVadGateThreshold,
          });
        }
        await activeVadGateEngine.loadModel();
        // Subscribe to speechStart/speechEnd for gate flag. Filter on the
        // gate engine's own id: a session engine (session.vad) publishes to
        // the same bus, and its utterance edges must not move the gate flag.
        const gateEngineId = activeVadGateEngine.id;
        vadGateSpeechSub = addSessionListener('speechStart', (payload) => {
          if (payload?.sourceId !== gateEngineId) return;
          vadGateSpeechActive = true;
        });
        vadGateSilenceSub = addSessionListener('speechEnd', (payload) => {
          if (payload?.sourceId !== gateEngineId) return;
          vadGateSpeechActive = false;
        });
        // Subscribe to PCM frames for ring buffer (verification audio source)
        const emitter = new NativeEventEmitter(NativeModules.VoiceActivator);
        vadPcmRingBufferSub = emitter.addListener(VAD_NATIVE_PCM_FRAME_EVENT, ((
          ...args: readonly object[]
        ) => {
          // Nothing upstream of a native event listener can handle a throw, so
          // a bad frame must not be allowed to escape into the emitter.
          try {
            const e = args[0] as { pcm?: string } | undefined;
            if (typeof e?.pcm !== 'string') return;
            pushVadPcmFrame(e.pcm);
          } catch (cause) {
            if (__DEV__) {
              console.warn(
                '[VoiceActivator] dropped malformed VAD PCM frame:',
                cause
              );
            }
          }
        }) as (...args: readonly object[]) => unknown);
        await activeVadGateEngine.start();
      }

      runtimeStore.setStatus(
        resolveStatus({
          ...getCurrentStatus(),
          state: 'running',
          isAvailable: true,
          isListening: true,
          canStart: false,
          lastError: null,
        })
      );
    } catch (cause) {
      try {
        await activeRuntime.stopDetection?.();
      } catch {
        // Best-effort rollback when the engine-backed start path fails.
      }
      syncKnownRuntimeFailure('startDetection', cause);
      throw cause;
    }
  },

  async stopDetection() {
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.stopDetection) {
      return rejectUnsupportedRuntime('stopDetection');
    }

    runtimeStore.transitionToState('stopping', {
      canStart: false,
      lastError: null,
    });

    try {
      invalidateProviderOrchestration();
      await cleanupActiveProviderFlow();
      // activeSessionConfig is intentionally kept — session config persists across
      // stopDetection()/startDetection() cycles until initialize() is called again.
      await closeActiveVoiceSession();
      clearVadRingBuffer();
      await stopEngineRuntime();

      // Stop VAD gate engine
      if (activeVadGateEngine) {
        vadGateSpeechSub?.remove();
        vadGateSilenceSub?.remove();
        vadPcmRingBufferSub?.remove();
        vadGateSpeechSub = null;
        vadGateSilenceSub = null;
        vadPcmRingBufferSub = null;
        await activeVadGateEngine.stop().catch(() => undefined);
        vadGateSpeechActive = false;
        clearVadRingBuffer();
      }

      await activeRuntime.stopDetection();
      runtimeStore.setStatus(
        resolveStatus({
          ...getCurrentStatus(),
          state: 'stopped',
          isAvailable: true,
          isListening: false,
          canStart: true,
          lastError: null,
        })
      );
    } catch (cause) {
      syncKnownRuntimeFailure('stopDetection', cause);
      throw cause;
    }
  },

  getStatus() {
    return getCurrentStatus();
  },

  async dispose() {
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.dispose) {
      return rejectUnsupportedRuntime('dispose');
    }

    try {
      invalidateProviderOrchestration();
      await cleanupActiveProviderFlow();
      await closeActiveVoiceSession();
      activeSessionConfig = null;
      activeSpeakerVerificationProvider = null;
      activeAudioPreprocessingProvider = null;
      activeAntiSpoofingProvider = null;
      activeSpoofingThreshold = 0.5;
      activeVerificationThreshold = 0.55;
      activeVerificationFailureBehavior = 'closed';
      clearVadRingBuffer();

      // Dispose VAD gate engine
      activeVadGateEnabled = false;
      activeVadGateThreshold = 0.5;
      vadGateSpeechSub?.remove();
      vadGateSilenceSub?.remove();
      vadPcmRingBufferSub?.remove();
      vadGateSpeechSub = null;
      vadGateSilenceSub = null;
      vadPcmRingBufferSub = null;
      await activeVadGateEngine?.stop().catch(() => undefined);
      await activeVadGateEngine?.dispose().catch(() => undefined);
      activeVadGateEngine = null;
      vadGateSpeechActive = false;
      clearVadRingBuffer();

      await disposeEngineRuntime();
      await activeRuntime.dispose();
      activeRuntimeConfiguration = null;
      runtimeStore.setStatus(
        resolveStatus({
          ...getCurrentStatus(),
          state: 'idle',
          isAvailable: true,
          isListening: false,
          canStart: true,
          lastError: null,
        })
      );
    } catch (cause) {
      syncKnownRuntimeFailure('dispose', cause);
      throw cause;
    }
  },

  addListener,

  async setAudioRoute(route: AudioRoute): Promise<void> {
    const setRoute = getVoiceActivatorRuntimeBridge().setAudioRoute;
    if (!setRoute) {
      return;
    }
    return setRoute(route);
  },

  async enrollSpeaker(userId: string, audioBuffer: ArrayBuffer): Promise<void> {
    if (!activeSpeakerVerificationProvider) {
      throw new Error(
        'enrollSpeaker() requires a speakerVerificationProvider to be configured in initialize()'
      );
    }
    await activeSpeakerVerificationProvider.enrollSpeaker(
      userId,
      audioBuffer,
      16000
    );
  },

  async exportEnrollment(): Promise<EnrollmentData> {
    if (!activeSpeakerVerificationProvider) {
      throw new Error(
        'exportEnrollment() requires a speakerVerificationProvider to be configured in initialize()'
      );
    }
    return activeSpeakerVerificationProvider.exportEnrollment();
  },

  async importEnrollment(data: EnrollmentData): Promise<void> {
    if (!activeSpeakerVerificationProvider) {
      throw new Error(
        'importEnrollment() requires a speakerVerificationProvider to be configured in initialize()'
      );
    }
    await activeSpeakerVerificationProvider.importEnrollment(data);
  },

  async clearEnrollment(): Promise<void> {
    if (!activeSpeakerVerificationProvider) {
      throw new Error(
        'clearEnrollment() requires a speakerVerificationProvider to be configured in initialize()'
      );
    }
    await activeSpeakerVerificationProvider.clearEnrollment();
  },
};

export const initialize = voiceActivator.initialize;
export const startDetection = voiceActivator.startDetection;
export const stopDetection = voiceActivator.stopDetection;
export const getStatus = voiceActivator.getStatus;
export const dispose = voiceActivator.dispose;
export const setAudioRoute = voiceActivator.setAudioRoute;
export const addWakeWordListener = addListener;
export const enrollSpeaker = voiceActivator.enrollSpeaker;
export const exportEnrollment = voiceActivator.exportEnrollment;
export const importEnrollment = voiceActivator.importEnrollment;
export const clearEnrollment = voiceActivator.clearEnrollment;

export function getSession(): VoiceSession | null {
  return activeVoiceSession;
}

export function getSpeakerVerificationProvider(): SpeakerVerificationProvider | null {
  return activeSpeakerVerificationProvider;
}

export function getAudioPreprocessingProvider(): AudioPreprocessingProvider | null {
  return activeAudioPreprocessingProvider;
}

export function getAntiSpoofingProvider(): AntiSpoofingProvider | null {
  return activeAntiSpoofingProvider;
}

export function getSpoofingThreshold(): number {
  return activeSpoofingThreshold;
}

export type VoiceActivatorEventMap = WakeWordEventMap;
