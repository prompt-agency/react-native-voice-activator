import type {
  SpeechCompletedEvent,
  SpeechErrorEvent,
  SpeechStartedEvent,
  TranscriptionErrorEvent,
  TranscriptionResultEvent,
  TranscriptionStartedEvent,
  WakeWordAudioRouteChangedEvent,
  WakeWordDetectedEvent,
  WakeWordInterruptionEvent,
  WakeWordStateChangedEvent,
  WakeWordStatus,
} from '../public/types';

function createMockEngineRuntime() {
  return {
    initialize: jest.fn(async () => undefined),
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
  };
}

async function flushRuntimeUpdate() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function waitForAssertion(assertion: () => void, attempts = 20) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushRuntimeUpdate();
    }
  }

  throw lastError;
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

describe('public runtime state and event contract', () => {
  beforeEach(() => {
    jest.resetModules();
    const engineRuntime = createMockEngineRuntime();
    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));
  });

  it('emits typed state transitions for initialize, start, stop, and dispose', async () => {
    const mockStatus: WakeWordStatus = {
      state: 'idle' as const,
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };

    const initialize = jest.fn(async () => {
      mockStatus.state = 'ready';
      mockStatus.canStart = true;
    });
    const startDetection = jest.fn(async () => {
      mockStatus.state = 'running';
      mockStatus.isListening = true;
      mockStatus.canStart = false;
    });
    const stopDetection = jest.fn(async () => {
      mockStatus.state = 'stopped';
      mockStatus.isListening = false;
      mockStatus.canStart = true;
    });
    const dispose = jest.fn(async () => {
      mockStatus.state = 'idle';
      mockStatus.isListening = false;
      mockStatus.canStart = true;
    });

    const runtimeBridge = {
      initialize,
      startDetection,
      stopDetection,
      getStatus: jest.fn(() => ({ ...mockStatus })),
      dispose,
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const stateEvents: WakeWordStateChangedEvent[] = [];
    const subscription = VoiceActivator.addWakeWordListener(
      'stateChanged',
      (payload) => {
        stateEvents.push(payload);
      }
    );

    await VoiceActivator.initialize();
    await VoiceActivator.startDetection();
    await VoiceActivator.stopDetection();
    await VoiceActivator.dispose();
    subscription.remove();

    expect(stateEvents).toEqual([
      { previousState: 'idle', state: 'initializing' },
      { previousState: 'initializing', state: 'ready' },
      { previousState: 'ready', state: 'starting' },
      { previousState: 'starting', state: 'running' },
      { previousState: 'running', state: 'stopping' },
      { previousState: 'stopping', state: 'stopped' },
      { previousState: 'stopped', state: 'idle' },
    ]);

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    });
  });

  it('removes listeners cleanly and avoids duplicate notifications after removal', async () => {
    const mockStatus: WakeWordStatus = {
      state: 'idle' as const,
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };

    const runtimeBridge = {
      initialize: jest.fn(async () => {
        mockStatus.state = 'ready';
      }),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...mockStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const listener = jest.fn();
    const subscription = VoiceActivator.addWakeWordListener(
      'stateChanged',
      listener
    );

    await VoiceActivator.initialize();
    subscription.remove();
    subscription.remove();
    await expect(VoiceActivator.initialize()).resolves.toBeUndefined();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('delivers typed payloads for the remaining event channels', async () => {
    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({
        state: 'ready',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const { emitRuntimeEvent } = await import('../internal/runtime-events');
    const detectedEvents: WakeWordDetectedEvent[] = [];
    const interruptions: WakeWordInterruptionEvent[] = [];
    const routeChanges: WakeWordAudioRouteChangedEvent[] = [];

    const detectedSubscription = VoiceActivator.addWakeWordListener(
      'wakeWordDetected',
      (payload) => {
        detectedEvents.push(payload);
      }
    );
    const interruptionSubscription = VoiceActivator.addWakeWordListener(
      'interruption',
      (payload) => {
        interruptions.push(payload);
      }
    );
    const routeSubscription = VoiceActivator.addWakeWordListener(
      'audioRouteChanged',
      (payload) => {
        routeChanges.push(payload);
      }
    );

    emitRuntimeEvent('wakeWordDetected', {
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-06T12:00:00.000Z',
    });
    emitRuntimeEvent('interruption', {
      reason: 'call',
      recoverable: true,
    });
    emitRuntimeEvent('audioRouteChanged', {
      route: 'speaker',
      previousRoute: 'earpiece',
    });

    detectedSubscription.remove();
    interruptionSubscription.remove();
    routeSubscription.remove();

    expect(detectedEvents).toEqual([
      {
        detectedPhrase: 'hey app',
        detectedAt: '2026-03-06T12:00:00.000Z',
      },
    ]);
    expect(interruptions).toEqual([
      {
        reason: 'call',
        recoverable: true,
      },
    ]);
    expect(routeChanges).toEqual([
      {
        route: 'speaker',
        previousRoute: 'earpiece',
      },
    ]);
  });

  it('protects the canonical runtime status from consumer mutation', async () => {
    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({
        state: 'ready',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const firstStatus = VoiceActivator.getStatus();

    firstStatus.state = 'error';
    firstStatus.lastError = {
      category: 'internal',
      code: 'mutated',
      message: 'mutated',
      recoverable: false,
    };

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'ready',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    });
  });

  it('forwards normalized engine selection, config, and metadata through initialize', async () => {
    const initialize = jest.fn(async () => undefined);
    const runtimeBridge = {
      initialize,
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({
        state: 'idle',
        isAvailable: true,
        isListening: false,
        canStart: false,
        lastError: null,
      })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await VoiceActivator.initialize({
      profile: 'accuracy',
      enableDebugLogging: true,
      engine: {
        id: 'custom-engine',
        variant: 'preview',
      },
      engineConfig: {
        sensitivity: 0.72,
      },
    });

    expect(initialize).toHaveBeenCalledWith({
      profile: 'accuracy',
      enableDebugLogging: true,
      engine: {
        id: 'custom-engine',
        variant: 'preview',
      },
      engineConfig: {
        sensitivity: 0.72,
      },
      engineMetadata: {
        id: 'default',
        displayName: 'Default built-in wake word engine',
        assetRequirement: 'bundled',
        capabilities: {
          onDeviceDetection: true,
          backgroundDetection: false,
          customKeywordAssets: true,
          runtimeConfigurationUpdates: true,
        },
      },
    });
  });

  it('keeps provider registration in the shared runtime configuration while stripping it from the native initialize payload', async () => {
    const initialize = jest.fn(async () => undefined);
    const engineRuntime = createMockEngineRuntime();
    const runtimeBridge = {
      initialize,
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({
        state: 'idle',
        isAvailable: true,
        isListening: false,
        canStart: false,
        lastError: null,
      })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const sttProvider = {
      name: 'test-stt',
      transcribe: jest.fn(async () => ({
        text: 'hello',
        provider: 'test-stt',
      })),
      cancel: jest.fn(async () => undefined),
    };
    const ttsProvider = {
      name: 'test-tts',
      speak: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    };

    await VoiceActivator.initialize({
      sttProvider,
      ttsProvider,
      autoSpeak: true,
    });
    await VoiceActivator.startDetection();
    await VoiceActivator.startDetection();
    await VoiceActivator.startDetection();

    expect(initialize).toHaveBeenCalledWith({
      profile: 'balanced',
      enableDebugLogging: false,
      engine: {
        id: 'default',
      },
      engineConfig: {
        sensitivity: 0.5,
      },
      engineMetadata: {
        id: 'default',
        displayName: 'Default built-in wake word engine',
        assetRequirement: 'bundled',
        capabilities: {
          onDeviceDetection: true,
          backgroundDetection: false,
          customKeywordAssets: true,
          runtimeConfigurationUpdates: true,
        },
      },
    });
    expect(engineRuntime.initialize).toHaveBeenCalledWith(
      {
        profile: 'balanced',
        enableDebugLogging: false,
        engine: {
          id: 'default',
        },
        engineConfig: {
          sensitivity: 0.5,
        },
        engineMetadata: {
          id: 'default',
          displayName: 'Default built-in wake word engine',
          assetRequirement: 'bundled',
          capabilities: {
            onDeviceDetection: true,
            backgroundDetection: false,
            customKeywordAssets: true,
            runtimeConfigurationUpdates: true,
          },
        },
        sttProvider,
        ttsProvider,
        autoSpeak: true,
      },
      expect.objectContaining({
        onDetected: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });

  it('auto-wires built-in providers into shared runtime configuration while keeping them out of the native payload', async () => {
    const initialize = jest.fn(async () => undefined);
    const engineRuntime = createMockEngineRuntime();
    const sttProvider = {
      name: 'runanywhere-onnx',
      transcribe: jest.fn(async () => ({
        text: 'built-in',
        provider: 'runanywhere-onnx',
      })),
      cancel: jest.fn(async () => undefined),
    };
    const ttsProvider = {
      name: 'runanywhere-onnx',
      speak: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    };
    const runtimeBridge = {
      initialize,
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({
        state: 'idle',
        isAvailable: true,
        isListening: false,
        canStart: false,
        lastError: null,
      })),
      dispose: jest.fn(async () => undefined),
    };
    const initializeSttAdapter = jest.fn(async () => undefined);
    const initializeTtsAdapter = jest.fn(async () => undefined);
    const RunAnywhereSTTAdapter = jest.fn(() => ({
      ...sttProvider,
      initialize: initializeSttAdapter,
    }));
    const RunAnywhereTTSAdapter = jest.fn(() => ({
      ...ttsProvider,
      initialize: initializeTtsAdapter,
    }));

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));
    jest.doMock('../providers/runanywhere/RunAnywhereSTTAdapter', () => ({
      RunAnywhereSTTAdapter,
    }));
    jest.doMock('../providers/runanywhere/RunAnywhereTTSAdapter', () => ({
      RunAnywhereTTSAdapter,
    }));
    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await VoiceActivator.initialize({
      builtInSTT: {
        modelPath: '/models/stt.onnx',
      },
      builtInTTS: {
        modelPath: '/models/tts.onnx',
      },
      autoSpeak: true,
    });

    expect(RunAnywhereSTTAdapter).toHaveBeenCalledWith({
      modelPath: '/models/stt.onnx',
    });
    expect(RunAnywhereTTSAdapter).toHaveBeenCalledWith({
      modelPath: '/models/tts.onnx',
    });
    expect(initializeSttAdapter).toHaveBeenCalledTimes(1);
    expect(initializeTtsAdapter).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith({
      profile: 'balanced',
      enableDebugLogging: false,
      engine: {
        id: 'default',
      },
      engineConfig: {
        sensitivity: 0.5,
      },
      engineMetadata: {
        id: 'default',
        displayName: 'Default built-in wake word engine',
        assetRequirement: 'bundled',
        capabilities: {
          onDeviceDetection: true,
          backgroundDetection: false,
          customKeywordAssets: true,
          runtimeConfigurationUpdates: true,
        },
      },
    });
    expect(engineRuntime.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        sttProvider: expect.objectContaining({ name: 'runanywhere-onnx' }),
        ttsProvider: expect.objectContaining({ name: 'runanywhere-onnx' }),
        builtInSTT: {
          modelPath: '/models/stt.onnx',
        },
        builtInTTS: {
          modelPath: '/models/tts.onnx',
        },
        autoSpeak: true,
      }),
      expect.objectContaining({
        onDetected: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });

  it('surfaces built-in provider initialization failures as configuration errors', async () => {
    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };
    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };
    const initializeSttAdapter = jest.fn(async () => {
      throw new Error('model load failed');
    });

    jest.doMock('../providers/runanywhere/RunAnywhereSTTAdapter', () => ({
      RunAnywhereSTTAdapter: jest.fn(() => ({
        name: 'runanywhere-onnx',
        transcribe: jest.fn(),
        cancel: jest.fn(),
        initialize: initializeSttAdapter,
      })),
    }));
    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await expect(
      VoiceActivator.initialize({
        builtInSTT: {
          modelPath: '/models/missing.onnx',
        },
      })
    ).rejects.toMatchObject({
      category: 'configuration',
      code: 'builtin_provider_init_failed',
      message: 'model load failed',
      recoverable: true,
    });
  });

  it('disposes built-in providers on reinitialize and dispose', async () => {
    const initialize = jest.fn(async () => undefined);
    const engineRuntime = createMockEngineRuntime();
    const runtimeBridge = {
      initialize,
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({
        state: 'idle',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      })),
      dispose: jest.fn(async () => undefined),
    };
    const sttInstances: Array<{
      name: string;
      isBuiltInRunAnywhereProvider: true;
      transcribe: jest.Mock;
      cancel: jest.Mock;
      initialize: jest.Mock;
      dispose: jest.Mock;
    }> = [];
    const ttsInstances: Array<{
      name: string;
      isBuiltInRunAnywhereProvider: true;
      speak: jest.Mock;
      stop: jest.Mock;
      initialize: jest.Mock;
      dispose: jest.Mock;
    }> = [];

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));
    jest.doMock('../providers/runanywhere/RunAnywhereSTTAdapter', () => ({
      RunAnywhereSTTAdapter: jest.fn(() => {
        const instance = {
          name: 'runanywhere-onnx',
          isBuiltInRunAnywhereProvider: true as const,
          transcribe: jest.fn(),
          cancel: jest.fn(async () => undefined),
          initialize: jest.fn(async () => undefined),
          dispose: jest.fn(async () => undefined),
        };
        sttInstances.push(instance);
        return instance;
      }),
    }));
    jest.doMock('../providers/runanywhere/RunAnywhereTTSAdapter', () => ({
      RunAnywhereTTSAdapter: jest.fn(() => {
        const instance = {
          name: 'runanywhere-onnx',
          isBuiltInRunAnywhereProvider: true as const,
          speak: jest.fn(async () => undefined),
          stop: jest.fn(async () => undefined),
          initialize: jest.fn(async () => undefined),
          dispose: jest.fn(async () => undefined),
        };
        ttsInstances.push(instance);
        return instance;
      }),
    }));
    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await VoiceActivator.initialize({
      builtInSTT: { modelPath: '/models/one-stt.onnx' },
      builtInTTS: { modelPath: '/models/one-tts.onnx' },
    });
    await VoiceActivator.initialize({
      builtInSTT: { modelPath: '/models/two-stt.onnx' },
      builtInTTS: { modelPath: '/models/two-tts.onnx' },
    });

    expect(sttInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(ttsInstances[0]?.dispose).toHaveBeenCalledTimes(1);

    await VoiceActivator.dispose();

    expect(sttInstances[1]?.dispose).toHaveBeenCalledTimes(1);
    expect(ttsInstances[1]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('orchestrates wake word detection through transcription and optional speech events', async () => {
    let wakeWordDetectedHandler:
      | ((payload: WakeWordDetectedEvent) => void)
      | null = null;
    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };
    const runtimeBridge = {
      initialize: jest.fn(async () => {
        runtimeStatus.state = 'ready';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.isListening = true;
        runtimeStatus.canStart = false;
      }),
      stopDetection: jest.fn(async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => {
        runtimeStatus.state = 'idle';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
    };
    const sttProvider = {
      name: 'test-stt',
      transcribe: jest.fn(async () => ({
        text: 'hello world',
        confidence: 0.91,
        provider: 'test-stt',
        durationMs: 250,
      })),
      cancel: jest.fn(async () => undefined),
    };
    const ttsProvider = {
      name: 'test-tts',
      speak: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(
        (handler: ((payload: WakeWordDetectedEvent) => void) | null) => {
          wakeWordDetectedHandler = handler;
        }
      ),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const transcriptionsStarted: TranscriptionStartedEvent[] = [];
    const transcriptionResults: TranscriptionResultEvent[] = [];
    const speechStarted: SpeechStartedEvent[] = [];
    const speechCompleted: SpeechCompletedEvent[] = [];

    const startedSubscription = VoiceActivator.addWakeWordListener(
      'transcriptionStarted',
      (payload) => {
        transcriptionsStarted.push(payload);
      }
    );
    const resultSubscription = VoiceActivator.addWakeWordListener(
      'transcriptionResult',
      (payload) => {
        transcriptionResults.push(payload);
      }
    );
    const speechStartedSubscription = VoiceActivator.addWakeWordListener(
      'speechStarted',
      (payload) => {
        speechStarted.push(payload);
      }
    );
    const speechCompletedSubscription = VoiceActivator.addWakeWordListener(
      'speechCompleted',
      (payload) => {
        speechCompleted.push(payload);
      }
    );

    await VoiceActivator.initialize({
      sttProvider,
      ttsProvider,
      autoSpeak: true,
    });
    await VoiceActivator.startDetection();

    const emitWakeWordDetected = (payload: WakeWordDetectedEvent) => {
      if (!wakeWordDetectedHandler) {
        throw new Error('Expected wake word detected handler to be registered');
      }

      wakeWordDetectedHandler(payload);
    };

    emitWakeWordDetected({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T10:00:00.000Z',
    });

    await waitForAssertion(() => {
      expect(sttProvider.transcribe).toHaveBeenCalledTimes(1);
    });

    startedSubscription.remove();
    resultSubscription.remove();
    speechStartedSubscription.remove();
    speechCompletedSubscription.remove();

    expect(ttsProvider.speak).toHaveBeenCalledWith('hello world');
    expect(transcriptionsStarted).toEqual([{ provider: 'test-stt' }]);
    expect(transcriptionResults).toEqual([
      {
        text: 'hello world',
        confidence: 0.91,
        provider: 'test-stt',
        durationMs: 250,
      },
    ]);
    expect(speechStarted).toEqual([
      {
        text: 'hello world',
        provider: 'test-tts',
      },
    ]);
    expect(speechCompleted).toEqual([{ provider: 'test-tts' }]);
  });

  it('preserves wake-word-only behavior when providers are omitted or autoSpeak is false', async () => {
    let wakeWordDetectedHandler:
      | ((payload: WakeWordDetectedEvent) => void)
      | null = null;
    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({
        state: 'ready',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      })),
      dispose: jest.fn(async () => undefined),
    };
    const ttsProvider = {
      name: 'test-tts',
      speak: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    };
    const transcriptionResults: TranscriptionResultEvent[] = [];

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(
        (handler: ((payload: WakeWordDetectedEvent) => void) | null) => {
          wakeWordDetectedHandler = handler;
        }
      ),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const transcriptionSubscription = VoiceActivator.addWakeWordListener(
      'transcriptionResult',
      (payload) => {
        transcriptionResults.push(payload);
      }
    );

    await VoiceActivator.initialize({
      ttsProvider,
      autoSpeak: false,
    });

    const emitWakeWordDetected = (payload: WakeWordDetectedEvent) => {
      if (!wakeWordDetectedHandler) {
        throw new Error('Expected wake word detected handler to be registered');
      }

      wakeWordDetectedHandler(payload);
    };

    emitWakeWordDetected({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T10:00:00.000Z',
    });

    await flushRuntimeUpdate();
    transcriptionSubscription.remove();

    expect(transcriptionResults).toEqual([]);
    expect(ttsProvider.speak).not.toHaveBeenCalled();
  });

  it('emits provider error events and cancels or stops active provider work during shutdown paths', async () => {
    let wakeWordDetectedHandler:
      | ((payload: WakeWordDetectedEvent) => void)
      | null = null;
    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };
    const runtimeBridge = {
      initialize: jest.fn(async () => {
        runtimeStatus.state = 'ready';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.isListening = true;
        runtimeStatus.canStart = false;
      }),
      stopDetection: jest.fn(async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => {
        runtimeStatus.state = 'idle';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
    };
    const transcriptionDeferred = createDeferred();
    const speechDeferred = createDeferred();
    const sttProvider = {
      name: 'test-stt',
      transcribe: jest.fn(async () => {
        await transcriptionDeferred.promise;
        return {
          text: 'hello world',
          provider: 'test-stt',
        };
      }),
      cancel: jest.fn(async () => undefined),
    };
    const ttsProvider = {
      name: 'test-tts',
      speak: jest.fn(async () => {
        await speechDeferred.promise;
      }),
      stop: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(
        (handler: ((payload: WakeWordDetectedEvent) => void) | null) => {
          wakeWordDetectedHandler = handler;
        }
      ),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const transcriptionErrors: TranscriptionErrorEvent[] = [];
    const speechErrors: SpeechErrorEvent[] = [];
    const transcriptionErrorSubscription = VoiceActivator.addWakeWordListener(
      'transcriptionError',
      (payload) => {
        transcriptionErrors.push(payload);
      }
    );
    const speechErrorSubscription = VoiceActivator.addWakeWordListener(
      'speechError',
      (payload) => {
        speechErrors.push(payload);
      }
    );

    await VoiceActivator.initialize({
      sttProvider,
      ttsProvider,
      autoSpeak: true,
    });
    await VoiceActivator.startDetection();

    const emitWakeWordDetected = (payload: WakeWordDetectedEvent) => {
      if (!wakeWordDetectedHandler) {
        throw new Error('Expected wake word detected handler to be registered');
      }

      wakeWordDetectedHandler(payload);
    };

    emitWakeWordDetected({
      detectedPhrase: 'hey app',
      detectedAt: '2026-03-12T10:00:00.000Z',
    });

    await waitForAssertion(() => {
      expect(sttProvider.transcribe).toHaveBeenCalledTimes(1);
    });
    await VoiceActivator.stopDetection();

    expect(sttProvider.cancel).toHaveBeenCalledTimes(1);

    transcriptionDeferred.resolve();
    await flushRuntimeUpdate();

    sttProvider.transcribe.mockResolvedValueOnce({
      text: 'hello world',
      provider: 'test-stt',
    });
    ttsProvider.speak.mockImplementationOnce(async () => {
      await speechDeferred.promise;
    });
    await VoiceActivator.startDetection();

    emitWakeWordDetected({
      detectedPhrase: 'hey again',
      detectedAt: '2026-03-12T10:00:01.000Z',
    });

    await flushRuntimeUpdate();
    await VoiceActivator.dispose();

    expect(ttsProvider.stop).toHaveBeenCalledTimes(1);

    speechDeferred.resolve();
    await flushRuntimeUpdate();

    sttProvider.transcribe.mockRejectedValueOnce(new Error('mic failed'));

    await VoiceActivator.initialize({
      sttProvider,
      autoSpeak: false,
    });
    await VoiceActivator.startDetection();
    await VoiceActivator.startDetection();

    emitWakeWordDetected({
      detectedPhrase: 'hey error',
      detectedAt: '2026-03-12T10:00:02.000Z',
    });

    await flushRuntimeUpdate();

    transcriptionErrorSubscription.remove();
    speechErrorSubscription.remove();

    expect(transcriptionErrors).toEqual([
      expect.objectContaining({
        provider: 'test-stt',
        code: 'stt_transcribe_failed',
      }),
    ]);
    expect(speechErrors).toEqual([]);
  });

  it('distinguishes cancellation from transcription failure in provider errors', async () => {
    let wakeWordDetectedHandler:
      | ((payload: WakeWordDetectedEvent) => void)
      | null = null;
    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };
    const runtimeBridge = {
      initialize: jest.fn(async () => {
        runtimeStatus.state = 'ready';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.isListening = true;
        runtimeStatus.canStart = false;
      }),
      stopDetection: jest.fn(async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };
    const sttProvider = {
      name: 'runanywhere-onnx',
      transcribe: jest.fn(async () => {
        throw {
          code: 'stt_cancelled',
          message: 'Transcription was cancelled.',
        };
      }),
      cancel: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(
        (handler: ((payload: WakeWordDetectedEvent) => void) | null) => {
          wakeWordDetectedHandler = handler;
        }
      ),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const transcriptionErrors: TranscriptionErrorEvent[] = [];
    const subscription = VoiceActivator.addWakeWordListener(
      'transcriptionError',
      (payload) => {
        transcriptionErrors.push(payload);
      }
    );

    await VoiceActivator.initialize({
      sttProvider,
      autoSpeak: false,
    });
    await VoiceActivator.startDetection();

    if (!wakeWordDetectedHandler) {
      throw new Error('Expected wake word detected handler to be registered');
    }
    const registeredWakeWordDetectedHandler: (
      payload: WakeWordDetectedEvent
    ) => void = wakeWordDetectedHandler;

    registeredWakeWordDetectedHandler({
      detectedPhrase: 'hey cancel',
      detectedAt: '2026-03-12T10:00:05.000Z',
    });

    await flushRuntimeUpdate();
    subscription.remove();

    expect(transcriptionErrors).toEqual([
      expect.objectContaining({
        provider: 'runanywhere-onnx',
        code: 'stt_cancelled',
        message: 'Transcription was cancelled.',
      }),
    ]);
  });

  it('suppresses queued provider orchestration after stop and dispose', async () => {
    let wakeWordDetectedHandler:
      | ((payload: WakeWordDetectedEvent) => void)
      | null = null;
    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };
    const runtimeBridge = {
      initialize: jest.fn(async () => {
        runtimeStatus.state = 'ready';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.isListening = true;
        runtimeStatus.canStart = false;
      }),
      stopDetection: jest.fn(async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => {
        runtimeStatus.state = 'idle';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
    };
    const sttProvider = {
      name: 'test-stt',
      transcribe: jest.fn(async () => ({
        text: 'hello world',
        provider: 'test-stt',
      })),
      cancel: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(
        (handler: ((payload: WakeWordDetectedEvent) => void) | null) => {
          wakeWordDetectedHandler = handler;
        }
      ),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await VoiceActivator.initialize({
      sttProvider,
      autoSpeak: false,
    });
    await VoiceActivator.startDetection();

    const emitWakeWordDetected = (payload: WakeWordDetectedEvent) => {
      if (!wakeWordDetectedHandler) {
        throw new Error('Expected wake word detected handler to be registered');
      }

      wakeWordDetectedHandler(payload);
    };

    emitWakeWordDetected({
      detectedPhrase: 'hey stop',
      detectedAt: '2026-03-12T10:00:03.000Z',
    });
    await VoiceActivator.stopDetection();
    await flushRuntimeUpdate();

    expect(sttProvider.transcribe).not.toHaveBeenCalled();

    await VoiceActivator.initialize({
      sttProvider,
      autoSpeak: false,
    });
    await VoiceActivator.startDetection();

    emitWakeWordDetected({
      detectedPhrase: 'hey dispose',
      detectedAt: '2026-03-12T10:00:04.000Z',
    });
    await VoiceActivator.dispose();
    await flushRuntimeUpdate();

    expect(sttProvider.transcribe).not.toHaveBeenCalled();
  });

  it('surfaces interrupted and unsupported native states through registered runtime handlers', async () => {
    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;
    let runtimeErrorHandler:
      | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
      | null = null;
    let runtimeInterruptionHandler:
      | ((payload: WakeWordInterruptionEvent) => void)
      | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(
        (
          handler:
            | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
            | null
        ) => {
          runtimeErrorHandler = handler;
        }
      ),
      setRuntimeInterruptionHandler: jest.fn(
        (handler: ((payload: WakeWordInterruptionEvent) => void) | null) => {
          runtimeInterruptionHandler = handler;
        }
      ),
    }));

    const VoiceActivator = await import('../index');
    const interruptions: WakeWordInterruptionEvent[] = [];
    const errors: Array<WakeWordStatus['lastError']> = [];

    const interruptionSubscription = VoiceActivator.addWakeWordListener(
      'interruption',
      (payload) => {
        interruptions.push(payload);
      }
    );
    const errorSubscription = VoiceActivator.addWakeWordListener(
      'error',
      (payload) => {
        errors.push(payload);
      }
    );

    expect(runtimeStatusHandler).not.toBeNull();
    expect(runtimeErrorHandler).not.toBeNull();
    expect(runtimeInterruptionHandler).not.toBeNull();

    runtimeStatus.state = 'interrupted';
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = false;
    runtimeStatus.lastError = {
      category: 'lifecycle',
      code: 'audio_interrupted',
      message: 'The iOS audio session was interrupted.',
      recoverable: true,
      platform: 'ios',
    };

    runtimeStatusHandler!({ ...runtimeStatus });
    runtimeErrorHandler!({ ...runtimeStatus.lastError });
    runtimeInterruptionHandler!({
      reason: 'audio_session_interrupted',
      recoverable: true,
    });

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'interrupted',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: {
        category: 'lifecycle',
        code: 'audio_interrupted',
        message: 'The iOS audio session was interrupted.',
        recoverable: true,
        platform: 'ios',
      },
    });

    runtimeStatus.state = 'unsupported';
    runtimeStatus.isAvailable = false;
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = false;
    runtimeStatus.reason =
      'The iOS audio session interruption cannot be resumed automatically.';
    runtimeStatus.lastError = {
      category: 'platform',
      code: 'audio_interruption_not_resumable',
      message:
        'The iOS audio session interruption cannot be resumed automatically.',
      recoverable: true,
      platform: 'ios',
    };

    runtimeStatusHandler!({ ...runtimeStatus });
    runtimeErrorHandler!({ ...runtimeStatus.lastError });
    runtimeInterruptionHandler!({
      reason: 'audio_session_interruption_not_resumable',
      recoverable: false,
    });

    interruptionSubscription.remove();
    errorSubscription.remove();

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'The iOS audio session interruption cannot be resumed automatically.',
      lastError: {
        category: 'platform',
        code: 'audio_interruption_not_resumable',
        message:
          'The iOS audio session interruption cannot be resumed automatically.',
        recoverable: true,
        platform: 'ios',
      },
    });
    expect(interruptions).toEqual([
      {
        reason: 'audio_session_interrupted',
        recoverable: true,
      },
      {
        reason: 'audio_session_interruption_not_resumable',
        recoverable: false,
      },
    ]);
    expect(errors).toEqual([
      {
        category: 'lifecycle',
        code: 'audio_interrupted',
        message: 'The iOS audio session was interrupted.',
        recoverable: true,
        platform: 'ios',
      },
      {
        category: 'platform',
        code: 'audio_interruption_not_resumable',
        message:
          'The iOS audio session interruption cannot be resumed automatically.',
        recoverable: true,
        platform: 'ios',
      },
    ]);
  });

  it('re-arms the engine runtime when a native interruption resumes into running', async () => {
    const engineRuntime = createMockEngineRuntime();
    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));

    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => {
        runtimeStatus.state = 'ready';
        runtimeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.isListening = true;
        runtimeStatus.canStart = false;
      }),
      stopDetection: jest.fn(async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await VoiceActivator.initialize();
    await VoiceActivator.startDetection();

    expect(engineRuntime.start).toHaveBeenCalledTimes(1);

    runtimeStatus.state = 'interrupted';
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = false;
    runtimeStatus.lastError = {
      category: 'lifecycle',
      code: 'audio_interrupted',
      message: 'The iOS audio session was interrupted.',
      recoverable: true,
      platform: 'ios',
    };
    runtimeStatusHandler!({ ...runtimeStatus });
    await flushRuntimeUpdate();

    expect(engineRuntime.stop).toHaveBeenCalledTimes(1);
    expect(VoiceActivator.getStatus().state).toBe('interrupted');

    runtimeStatus.state = 'running';
    runtimeStatus.isListening = true;
    runtimeStatus.canStart = false;
    runtimeStatus.lastError = null;
    runtimeStatusHandler!({ ...runtimeStatus });
    await flushRuntimeUpdate();

    expect(engineRuntime.start).toHaveBeenCalledTimes(2);
    expect(VoiceActivator.getStatus()).toEqual({
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    });
  });

  it('does not publish running if native interruption recovery cannot restart the engine runtime', async () => {
    const engineRuntime = createMockEngineRuntime();
    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));

    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => {
        runtimeStatus.state = 'ready';
        runtimeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.isListening = true;
        runtimeStatus.canStart = false;
      }),
      stopDetection: jest.fn(async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await VoiceActivator.initialize();
    await VoiceActivator.startDetection();

    runtimeStatus.state = 'interrupted';
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = false;
    runtimeStatus.lastError = {
      category: 'lifecycle',
      code: 'audio_interrupted',
      message: 'The iOS audio session was interrupted.',
      recoverable: true,
      platform: 'ios',
    };
    runtimeStatusHandler!({ ...runtimeStatus });
    await flushRuntimeUpdate();

    engineRuntime.start.mockRejectedValueOnce(new Error('resume failed'));

    runtimeStatus.state = 'running';
    runtimeStatus.isListening = true;
    runtimeStatus.canStart = false;
    runtimeStatus.lastError = null;
    runtimeStatusHandler!({ ...runtimeStatus });
    await flushRuntimeUpdate();

    expect(engineRuntime.start).toHaveBeenCalledTimes(2);
    expect(VoiceActivator.getStatus()).toMatchObject({
      isListening: false,
      canStart: false,
    });
    expect(VoiceActivator.getStatus().state).not.toBe('running');
  });

  it('does not let an older async native status update overwrite a newer one', async () => {
    const engineRuntime = createMockEngineRuntime();
    const stopDeferred = createDeferred();

    engineRuntime.stop.mockImplementationOnce(async () => {
      await stopDeferred.promise;
    });

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));

    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => {
        runtimeStatus.state = 'ready';
        runtimeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.isListening = true;
        runtimeStatus.canStart = false;
      }),
      stopDetection: jest.fn(async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await VoiceActivator.initialize();
    await VoiceActivator.startDetection();

    runtimeStatus.state = 'interrupted';
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = false;
    runtimeStatus.lastError = {
      category: 'lifecycle',
      code: 'audio_interrupted',
      message: 'The iOS audio session was interrupted.',
      recoverable: true,
      platform: 'ios',
    };
    runtimeStatusHandler!({ ...runtimeStatus });

    runtimeStatus.state = 'running';
    runtimeStatus.isListening = true;
    runtimeStatus.canStart = false;
    runtimeStatus.lastError = null;
    runtimeStatusHandler!({ ...runtimeStatus });

    stopDeferred.resolve();
    await flushRuntimeUpdate();

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    });
  });

  it('surfaces supported iOS background continuation and explicit unsupported background states', async () => {
    const runtimeStatus: WakeWordStatus = {
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;
    let runtimeErrorHandler:
      | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
      | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(
        (
          handler:
            | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
            | null
        ) => {
          runtimeErrorHandler = handler;
        }
      ),
      setRuntimeInterruptionHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const errors: Array<WakeWordStatus['lastError']> = [];

    const errorSubscription = VoiceActivator.addWakeWordListener(
      'error',
      (payload) => {
        errors.push(payload);
      }
    );

    expect(runtimeStatusHandler).not.toBeNull();
    expect(runtimeErrorHandler).not.toBeNull();

    runtimeStatus.reason =
      'Wake word detection is continuing in a supported iOS background audio state.';
    runtimeStatusHandler!({ ...runtimeStatus });
    await flushRuntimeUpdate();

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      reason:
        'Wake word detection is continuing in a supported iOS background audio state.',
      lastError: null,
    });

    runtimeStatus.state = 'unsupported';
    runtimeStatus.isAvailable = false;
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = false;
    runtimeStatus.reason =
      'iOS background wake word detection requires the audio background mode to remain active after the app enters the background.';
    runtimeStatus.lastError = {
      category: 'platform',
      code: 'background_audio_mode_required',
      message:
        'iOS background wake word detection requires the audio background mode to remain active after the app enters the background.',
      recoverable: true,
      platform: 'ios',
    };

    runtimeStatusHandler!({ ...runtimeStatus });
    runtimeErrorHandler!({ ...runtimeStatus.lastError });
    await flushRuntimeUpdate();

    errorSubscription.remove();

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'iOS background wake word detection requires the audio background mode to remain active after the app enters the background.',
      lastError: {
        category: 'platform',
        code: 'background_audio_mode_required',
        message:
          'iOS background wake word detection requires the audio background mode to remain active after the app enters the background.',
        recoverable: true,
        platform: 'ios',
      },
    });
    expect(errors).toEqual([
      {
        category: 'platform',
        code: 'background_audio_mode_required',
        message:
          'iOS background wake word detection requires the audio background mode to remain active after the app enters the background.',
        recoverable: true,
        platform: 'ios',
      },
    ]);
  });

  it('surfaces supported Android foreground-service continuation and explicit unsupported runtime states', async () => {
    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;
    let runtimeErrorHandler:
      | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
      | null = null;
    let runtimeInterruptionHandler:
      | ((payload: WakeWordInterruptionEvent) => void)
      | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(
        (
          handler:
            | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
            | null
        ) => {
          runtimeErrorHandler = handler;
        }
      ),
      setRuntimeInterruptionHandler: jest.fn(
        (handler: ((payload: WakeWordInterruptionEvent) => void) | null) => {
          runtimeInterruptionHandler = handler;
        }
      ),
    }));

    const VoiceActivator = await import('../index');
    const stateEvents: WakeWordStateChangedEvent[] = [];
    const errors: Array<WakeWordStatus['lastError']> = [];
    const interruptions: WakeWordInterruptionEvent[] = [];

    const stateSubscription = VoiceActivator.addWakeWordListener(
      'stateChanged',
      (payload) => {
        stateEvents.push(payload);
      }
    );
    const errorSubscription = VoiceActivator.addWakeWordListener(
      'error',
      (payload) => {
        errors.push(payload);
      }
    );
    const interruptionSubscription = VoiceActivator.addWakeWordListener(
      'interruption',
      (payload) => {
        interruptions.push(payload);
      }
    );

    runtimeStatus.state = 'running';
    runtimeStatus.isAvailable = true;
    runtimeStatus.isListening = true;
    runtimeStatus.canStart = false;
    runtimeStatus.reason =
      'Wake word detection is continuing in a supported Android foreground-service runtime.';
    runtimeStatus.lastError = null;

    runtimeStatusHandler!({ ...runtimeStatus });
    await flushRuntimeUpdate();

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      reason:
        'Wake word detection is continuing in a supported Android foreground-service runtime.',
      lastError: null,
    });

    runtimeStatus.state = 'unsupported';
    runtimeStatus.isAvailable = false;
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = false;
    runtimeStatus.reason =
      'Android wake word detection must be started from a visible activity context so the foreground-service runtime can be established.';
    runtimeStatus.lastError = {
      category: 'platform',
      code: 'foreground_service_visible_context_required',
      message:
        'Android wake word detection must be started from a visible activity context so the foreground-service runtime can be established.',
      recoverable: false,
      platform: 'android',
    };

    runtimeStatusHandler!({ ...runtimeStatus });
    runtimeErrorHandler!({ ...runtimeStatus.lastError });
    runtimeInterruptionHandler!({
      reason:
        'Android wake word detection must be started from a visible activity context so the foreground-service runtime can be established.',
      recoverable: false,
    });
    await flushRuntimeUpdate();

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'Android wake word detection must be started from a visible activity context so the foreground-service runtime can be established.',
      lastError: {
        category: 'platform',
        code: 'foreground_service_visible_context_required',
        message:
          'Android wake word detection must be started from a visible activity context so the foreground-service runtime can be established.',
        recoverable: false,
        platform: 'android',
      },
    });
    expect(errors).toEqual([
      {
        category: 'platform',
        code: 'foreground_service_visible_context_required',
        message:
          'Android wake word detection must be started from a visible activity context so the foreground-service runtime can be established.',
        recoverable: false,
        platform: 'android',
      },
    ]);
    expect(interruptions).toEqual([
      {
        reason:
          'Android wake word detection must be started from a visible activity context so the foreground-service runtime can be established.',
        recoverable: false,
      },
    ]);
    expect(stateEvents).toContainEqual({
      previousState: 'idle',
      state: 'running',
    });
    expect(stateEvents).toContainEqual({
      previousState: 'running',
      state: 'unsupported',
    });

    stateSubscription.remove();
    errorSubscription.remove();
    interruptionSubscription.remove();
  });

  it('emits observable stateChanged events when supported iOS background continuation starts and ends', async () => {
    const runtimeStatus: WakeWordStatus = {
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');
    const stateEvents: WakeWordStateChangedEvent[] = [];
    const subscription = VoiceActivator.addWakeWordListener(
      'stateChanged',
      (payload) => {
        stateEvents.push(payload);
      }
    );

    runtimeStatus.reason =
      'Wake word detection is continuing in a supported iOS background audio state.';
    runtimeStatusHandler!({ ...runtimeStatus });
    await flushRuntimeUpdate();

    delete runtimeStatus.reason;
    runtimeStatusHandler!({ ...runtimeStatus });
    await flushRuntimeUpdate();

    subscription.remove();

    expect(stateEvents).toEqual([
      { previousState: 'running', state: 'running' },
      { previousState: 'running', state: 'running' },
    ]);
  });

  it('forwards native audio-route changes through the shared JS listener contract', async () => {
    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({
        state: 'running',
        isAvailable: true,
        isListening: true,
        canStart: false,
        lastError: null,
      })),
      dispose: jest.fn(async () => undefined),
    };
    let runtimeAudioRouteChangedHandler:
      | ((payload: WakeWordAudioRouteChangedEvent) => void)
      | null = null;

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(
        (
          handler: ((payload: WakeWordAudioRouteChangedEvent) => void) | null
        ) => {
          runtimeAudioRouteChangedHandler = handler;
        }
      ),
    }));

    const VoiceActivator = await import('../index');
    const routeChanges: WakeWordAudioRouteChangedEvent[] = [];
    const subscription = VoiceActivator.addWakeWordListener(
      'audioRouteChanged',
      (payload) => {
        routeChanges.push(payload);
      }
    );

    const routeChangedHandler = runtimeAudioRouteChangedHandler as
      | ((payload: WakeWordAudioRouteChangedEvent) => void)
      | null;
    if (routeChangedHandler) {
      routeChangedHandler({
        route: 'bluetooth',
        previousRoute: 'speaker',
      });
    }

    subscription.remove();

    expect(routeChanges).toEqual([
      {
        route: 'bluetooth',
        previousRoute: 'speaker',
      },
    ]);
  });

  it('disposes the active engine runtime when native iOS transitions to an unsupported background state', async () => {
    jest.resetModules();
    const engineRuntime = createMockEngineRuntime();
    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));

    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => {
        runtimeStatus.state = 'ready';
        runtimeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.isListening = true;
        runtimeStatus.canStart = false;
      }),
      stopDetection: jest.fn(async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => {
        runtimeStatus.state = 'idle';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = false;
      }),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await VoiceActivator.initialize();
    await VoiceActivator.startDetection();

    runtimeStatus.state = 'unsupported';
    runtimeStatus.isAvailable = false;
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = false;
    runtimeStatus.reason =
      'iOS background wake word detection requires the audio background mode to remain active after the app enters the background.';

    runtimeStatusHandler!({ ...runtimeStatus });
    await flushRuntimeUpdate();

    expect(engineRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(VoiceActivator.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'iOS background wake word detection requires the audio background mode to remain active after the app enters the background.',
      lastError: null,
    });
  });

  it('re-arms the engine runtime when native interrupted and running updates arrive back-to-back', async () => {
    jest.resetModules();
    const stopDeferred = createDeferred();
    const engineRuntime = {
      initialize: jest.fn(async () => undefined),
      start: jest.fn(async () => undefined),
      stop: jest.fn(() => stopDeferred.promise),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));

    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => {
        runtimeStatus.state = 'ready';
        runtimeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.isListening = true;
        runtimeStatus.canStart = false;
      }),
      stopDetection: jest.fn(async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.isListening = false;
        runtimeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    await VoiceActivator.initialize();
    await VoiceActivator.startDetection();

    expect(engineRuntime.start).toHaveBeenCalledTimes(1);

    runtimeStatus.state = 'interrupted';
    runtimeStatus.isListening = false;
    runtimeStatus.reason = 'Audio interruption in progress.';
    runtimeStatusHandler!({ ...runtimeStatus });

    runtimeStatus.state = 'running';
    runtimeStatus.isListening = true;
    delete runtimeStatus.reason;
    runtimeStatusHandler!({ ...runtimeStatus });

    await flushRuntimeUpdate();
    expect(engineRuntime.start).toHaveBeenCalledTimes(1);

    stopDeferred.resolve();
    await flushRuntimeUpdate();

    expect(engineRuntime.stop).toHaveBeenCalledTimes(1);
    expect(engineRuntime.start).toHaveBeenCalledTimes(2);
    expect(VoiceActivator.getStatus()).toEqual({
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    });
  });

  it('updates lastError from the native runtime error handler even without a status event', async () => {
    const runtimeStatus: WakeWordStatus = {
      state: 'ready',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    };
    let runtimeErrorHandler:
      | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
      | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(
        (
          handler:
            | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
            | null
        ) => {
          runtimeErrorHandler = handler;
        }
      ),
      setRuntimeInterruptionHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    expect(runtimeErrorHandler).not.toBeNull();

    runtimeErrorHandler!({
      category: 'platform',
      code: 'audio_session_deactivation_failed',
      message: 'The iOS audio session failed to deactivate.',
      recoverable: true,
      platform: 'ios',
    });

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'ready',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: {
        category: 'platform',
        code: 'audio_session_deactivation_failed',
        message: 'The iOS audio session failed to deactivate.',
        recoverable: true,
        platform: 'ios',
      },
    });
  });

  it('surfaces Android service-failure states through normalized runtime handlers', async () => {
    const runtimeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    };
    let runtimeStatusHandler: ((payload: WakeWordStatus) => void) | null = null;
    let runtimeErrorHandler:
      | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
      | null = null;
    let runtimeInterruptionHandler:
      | ((payload: WakeWordInterruptionEvent) => void)
      | null = null;

    const runtimeBridge = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...runtimeStatus })),
      dispose: jest.fn(async () => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: runtimeBridge,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(
        (handler: ((payload: WakeWordStatus) => void) | null) => {
          runtimeStatusHandler = handler;
        }
      ),
      setRuntimeErrorHandler: jest.fn(
        (
          handler:
            | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
            | null
        ) => {
          runtimeErrorHandler = handler;
        }
      ),
      setRuntimeInterruptionHandler: jest.fn(
        (handler: ((payload: WakeWordInterruptionEvent) => void) | null) => {
          runtimeInterruptionHandler = handler;
        }
      ),
    }));

    const VoiceActivator = await import('../index');
    const interruptions: WakeWordInterruptionEvent[] = [];
    const errors: Array<WakeWordStatus['lastError']> = [];

    const interruptionSubscription = VoiceActivator.addWakeWordListener(
      'interruption',
      (payload) => {
        interruptions.push(payload);
      }
    );
    const errorSubscription = VoiceActivator.addWakeWordListener(
      'error',
      (payload) => {
        errors.push(payload);
      }
    );

    runtimeStatus.state = 'unsupported';
    runtimeStatus.isAvailable = false;
    runtimeStatus.isListening = false;
    runtimeStatus.canStart = false;
    runtimeStatus.reason =
      'Android foreground runtime ownership could not be established.';
    runtimeStatus.lastError = {
      category: 'platform',
      code: 'runtime_unsupported',
      message: 'Android foreground runtime ownership could not be established.',
      recoverable: false,
      platform: 'android',
    };

    runtimeStatusHandler!({ ...runtimeStatus });
    runtimeErrorHandler!({ ...runtimeStatus.lastError });
    runtimeInterruptionHandler!({
      reason: 'Android foreground runtime ownership could not be established.',
      recoverable: false,
    });

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason: 'Android foreground runtime ownership could not be established.',
      lastError: {
        category: 'platform',
        code: 'runtime_unsupported',
        message:
          'Android foreground runtime ownership could not be established.',
        recoverable: false,
        platform: 'android',
      },
    });
    expect(errors).toEqual([
      {
        category: 'platform',
        code: 'runtime_unsupported',
        message:
          'Android foreground runtime ownership could not be established.',
        recoverable: false,
        platform: 'android',
      },
    ]);
    expect(interruptions).toEqual([
      {
        reason:
          'Android foreground runtime ownership could not be established.',
        recoverable: false,
      },
    ]);

    interruptionSubscription.remove();
    errorSubscription.remove();
  });

  it.each([
    ['ios' as const, 'The iOS audio session was interrupted.'],
    [
      'android' as const,
      'Android foreground runtime ownership could not be established.',
    ],
  ])(
    'prefers native categorized %s runtime errors over generic promise failures',
    async (platform, message) => {
      const runtimeStatus: WakeWordStatus = {
        state: 'ready',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      };
      let runtimeErrorHandler:
        | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
        | null = null;

      const runtimeBridge = {
        initialize: jest.fn(async () => undefined),
        startDetection: jest.fn(async () => {
          runtimeStatus.state = 'unsupported';
          runtimeStatus.isAvailable = false;
          runtimeStatus.isListening = false;
          runtimeStatus.canStart = false;
          runtimeStatus.lastError = {
            category: 'platform',
            code: 'runtime_failure',
            message,
            recoverable: false,
            platform,
          };
          runtimeErrorHandler?.({ ...runtimeStatus.lastError });
          throw new Error('generic native rejection');
        }),
        stopDetection: jest.fn(async () => undefined),
        getStatus: jest.fn(() => ({ ...runtimeStatus })),
        dispose: jest.fn(async () => undefined),
      };

      jest.doMock('../internal/native-module', () => ({
        nativeVoiceActivatorModule: runtimeBridge,
        getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
        setWakeWordDetectedHandler: jest.fn(),
        setRuntimeStatusHandler: jest.fn(),
        setRuntimeErrorHandler: jest.fn(
          (
            handler:
              | ((payload: NonNullable<WakeWordStatus['lastError']>) => void)
              | null
          ) => {
            runtimeErrorHandler = handler;
          }
        ),
        setRuntimeInterruptionHandler: jest.fn(),
      }));

      const VoiceActivator = await import('../index');
      const errorEvents: NonNullable<WakeWordStatus['lastError']>[] = [];
      const errorSubscription = VoiceActivator.addWakeWordListener(
        'error',
        (payload) => {
          errorEvents.push(payload);
        }
      );

      await expect(VoiceActivator.startDetection()).rejects.toThrow(
        'generic native rejection'
      );
      expect(VoiceActivator.getStatus()).toEqual({
        state: 'unsupported',
        isAvailable: false,
        isListening: false,
        canStart: false,
        lastError: {
          category: 'platform',
          code: 'runtime_failure',
          message,
          recoverable: false,
          platform,
        },
      });
      expect(errorEvents).toEqual([
        {
          category: 'platform',
          code: 'runtime_failure',
          message,
          recoverable: false,
          platform,
        },
      ]);
      errorSubscription.remove();
    }
  );

  it('keeps runtime status coherent when the engine runtime reports an error while unsupported', async () => {
    const engineRuntime = {
      initialize: jest.fn(
        async (
          _configuration,
          handlers: {
            onError(error: NonNullable<WakeWordStatus['lastError']>): void;
          }
        ) => {
          engineRuntime.reportError = handlers.onError;
        }
      ),
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
      dispose: jest.fn(async () => undefined),
      reportError: null as
        | ((error: NonNullable<WakeWordStatus['lastError']>) => void)
        | null,
    };

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: null,
      getVoiceActivatorRuntimeBridge: jest.fn(() => ({
        initialize: jest.fn(async () => {
          throw new Error(
            'VoiceActivator.initialize is unavailable until the native runtime module is installed and built in a supported native environment.'
          );
        }),
        startDetection: jest.fn(async () => {
          throw new Error(
            'VoiceActivator.startDetection is unavailable until the native runtime module is installed and built in a supported native environment.'
          );
        }),
        stopDetection: jest.fn(async () => {
          throw new Error(
            'VoiceActivator.stopDetection is unavailable until the native runtime module is installed and built in a supported native environment.'
          );
        }),
        getStatus: jest.fn(() => ({
          state: 'unsupported',
          isAvailable: false,
          isListening: false,
          canStart: false,
          reason:
            'VoiceActivator requires the native runtime module. Detection is unavailable until the package is installed and built in a supported native environment.',
          lastError: null,
        })),
        dispose: jest.fn(async () => {
          throw new Error(
            'VoiceActivator.dispose is unavailable until the native runtime module is installed and built in a supported native environment.'
          );
        }),
      })),
      setWakeWordDetectedHandler: jest.fn(),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    engineRuntime.reportError?.({
      category: 'engine',
      code: 'engine_runtime_failed',
      message: 'The built-in wake word engine failed while running.',
      recoverable: true,
    });

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'VoiceActivator requires the native runtime module. Detection is unavailable until the package is installed and built in a supported native environment.',
      lastError: null,
    });
  });
});
