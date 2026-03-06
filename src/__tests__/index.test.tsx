import type {
  WakeWordAudioRouteChangedEvent,
  WakeWordDetectedEvent,
  WakeWordInterruptionEvent,
  WakeWordStateChangedEvent,
  WakeWordStatus,
} from '../public/types';

describe('public runtime state and event contract', () => {
  beforeEach(() => {
    jest.resetModules();
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
        metadata: {
          locale: 'en-US',
        },
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
        metadata: {
          locale: 'en-US',
        },
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
});
