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
import { createRuntimeStore } from '../internal/runtime-store';
import type { VoiceActivatorEngineRuntime } from '../internal/engine-runtime';
import { createNativeManagedEngineRuntime } from '../engines';
import { RunAnywhereSTTAdapter } from '../providers/runanywhere/RunAnywhereSTTAdapter';
import { RunAnywhereTTSAdapter } from '../providers/runanywhere/RunAnywhereTTSAdapter';
import type {
  ProviderError,
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

let activeEngineRuntime: VoiceActivatorEngineRuntime | null = null;
let engineRuntimeRunning = false;
let nativeStatusUpdateQueue: Promise<void> = Promise.resolve();
let activeRuntimeConfiguration: ReturnType<
  typeof createRuntimeConfiguration
> | null = null;
let providerOrchestrationQueue: Promise<void> = Promise.resolve();
let providerOrchestrationGeneration = 0;
type ActiveProviderFlow = {
  id: number;
  stage: 'transcribing' | 'speaking';
  sttProvider?: WakeWordRuntimeConfiguration['sttProvider'];
  ttsProvider?: WakeWordRuntimeConfiguration['ttsProvider'];
  speechText?: string;
};

type RunAnywhereDisposableProvider = {
  readonly isBuiltInRunAnywhereProvider: true;
  dispose(): Promise<void>;
};

let activeProviderFlow: ActiveProviderFlow | null = null;
let activeSessionConfig: VoiceSessionConfig | null = null;
let activeVoiceSession: VoiceSessionOrchestrator | null = null;

function emitWakeWordDetected(payload: WakeWordDetectedEvent) {
  emitRuntimeEvent('wakeWordDetected', payload);
}

function invalidateProviderOrchestration() {
  providerOrchestrationGeneration += 1;
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
        await closeActiveVoiceSession();
        const orchestrator = new VoiceSessionOrchestrator(
          activeSessionConfig,
          configuration.sttProvider,
          configuration.ttsProvider
        );
        activeVoiceSession = orchestrator;
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
        const transcription = await sttProvider.transcribe();

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

        await ttsProvider.speak(transcription.text);

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

        if (activeProviderFlow?.stage === 'speaking' && ttsProvider) {
          emitRuntimeEvent(
            'speechError',
            createProviderErrorFromCause(
              ttsProvider.name,
              'tts_speak_failed',
              cause,
              'Speech playback failed.'
            )
          );
        } else {
          const errorCode = isCancelledTranscriptionError(cause)
            ? 'stt_cancelled'
            : 'stt_transcribe_failed';
          const fallbackMessage = isCancelledTranscriptionError(cause)
            ? 'Transcription was cancelled.'
            : 'Transcription failed.';
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
    return;
  }

  if (
    previousStatus.state === 'interrupted' &&
    status.state === 'running' &&
    status.isListening
  ) {
    await startEngineRuntime();
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
    category: 'internal',
    code: 'runtime_unavailable',
    message: createUnsupportedRuntimeError(methodName).message,
    recoverable: true,
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

function createConfigurationFailure(error: WakeWordError): WakeWordError {
  return {
    ...error,
    recoverable: true,
  };
}

function createBuiltInProviderInitFailure(message: string): WakeWordError {
  return {
    category: 'configuration',
    code: 'builtin_provider_init_failed',
    message,
    recoverable: true,
  };
}

function isRunAnywhereDisposableProvider(
  value: unknown
): value is RunAnywhereDisposableProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isBuiltInRunAnywhereProvider' in value &&
    value.isBuiltInRunAnywhereProvider === true &&
    'dispose' in value &&
    typeof value.dispose === 'function'
  );
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

async function cleanupBuiltInProviders(
  configuration: ReturnType<typeof createRuntimeConfiguration> | null
) {
  if (!configuration) {
    return;
  }

  if (isRunAnywhereDisposableProvider(configuration.sttProvider)) {
    await configuration.sttProvider.dispose();
  }

  if (isRunAnywhereDisposableProvider(configuration.ttsProvider)) {
    await configuration.ttsProvider.dispose();
  }
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

const addListener: VoiceActivatorApi['addListener'] = addRuntimeListener;

export const voiceActivator: VoiceActivatorApi = {
  async initialize(options: WakeWordInitializationOptions = {}) {
    const activeRuntime = getVoiceActivatorRuntimeBridge();
    if (!activeRuntime?.initialize) {
      return rejectUnsupportedRuntime('initialize');
    }
    const runtimeConfiguration = createRuntimeConfiguration(options);
    const nextEngineRuntime = resolveEngineRuntime();
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
      await cleanupBuiltInProviders(activeRuntimeConfiguration);
      activeRuntimeConfiguration = null;

      let createdSttAdapter: RunAnywhereSTTAdapter | null = null;

      if (!resolvedSttProvider && runtimeConfiguration.builtInSTT) {
        const adapter = new RunAnywhereSTTAdapter(
          runtimeConfiguration.builtInSTT
        );

        try {
          await adapter.initialize(runtimeConfiguration.onBuiltInProgress);
        } catch (cause) {
          const configError = createBuiltInProviderInitFailure(
            cause instanceof Error
              ? cause.message
              : 'Built-in STT provider failed to initialize.'
          );
          runtimeStore.recordError(configError);
          throw configError;
        }

        createdSttAdapter = adapter;
        resolvedSttProvider = adapter;
      }

      if (!resolvedTtsProvider && runtimeConfiguration.builtInTTS) {
        const adapter = new RunAnywhereTTSAdapter(
          runtimeConfiguration.builtInTTS
        );

        try {
          await adapter.initialize(runtimeConfiguration.onBuiltInProgress);
        } catch (cause) {
          // Dispose the STT adapter if it was created in this same call and
          // TTS initialization now fails — prevents a loaded model from leaking.
          if (createdSttAdapter) {
            await createdSttAdapter.dispose().catch(() => undefined);
          }
          const configError = createBuiltInProviderInitFailure(
            cause instanceof Error
              ? cause.message
              : 'Built-in TTS provider failed to initialize.'
          );
          runtimeStore.recordError(configError);
          throw configError;
        }

        resolvedTtsProvider = adapter;
      }

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
      activeRuntimeConfiguration = resolvedRuntimeConfiguration;
      activeSessionConfig = options.session ?? null;
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
      await stopEngineRuntime();
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
      await disposeEngineRuntime();
      await cleanupBuiltInProviders(activeRuntimeConfiguration);
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
};

export const initialize = voiceActivator.initialize;
export const startDetection = voiceActivator.startDetection;
export const stopDetection = voiceActivator.stopDetection;
export const getStatus = voiceActivator.getStatus;
export const dispose = voiceActivator.dispose;
export const addWakeWordListener = addListener;

export function getSession(): VoiceSession | null {
  return activeVoiceSession;
}

export type VoiceActivatorEventMap = WakeWordEventMap;
