import { createDefaultRuntimeConfiguration } from '../domain/detection-config';
import type { WakeWordError, WakeWordStatus } from '../public/types';

function createMockEngineRuntime() {
  return {
    initialize: jest.fn(async () => undefined),
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
  };
}

describe('native module bridge selection', () => {
  beforeEach(() => {
    jest.resetModules();
    const engineRuntime = createMockEngineRuntime();
    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
    }));
  });

  it('fails explicitly instead of silently falling back when a native module is partially implemented', async () => {
    jest.doMock('react-native', () => ({
      // Every real react-native exports Platform, and the package root reads
      // Platform.OS to resolve BUNDLED_MODEL_ASSET_KEY. A double that omits it
      // is not modelling react-native, it is modelling a module that cannot
      // exist, and importing ../index against it fails for a reason no app
      // would ever hit.
      Platform: {
        OS: 'ios',
        select: (spec: Record<string, unknown>) => spec.ios,
      },
      TurboModuleRegistry: {
        get: jest.fn(() => ({
          initialize: jest.fn(async () => undefined),
        })),
      },
    }));

    const { getVoiceActivatorRuntimeBridge } =
      await import('../internal/native-module');

    const runtimeBridge = getVoiceActivatorRuntimeBridge();

    expect(runtimeBridge.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'VoiceActivator native runtime is partially implemented. The package cannot use the native path until all bridge methods are available.',
      lastError: null,
    });

    await expect(
      runtimeBridge.initialize(createDefaultRuntimeConfiguration())
    ).rejects.toThrow(
      'VoiceActivator native runtime is partially implemented. Complete the native bridge methods before enabling the native path.'
    );
  });

  it('uses the full native bridge and forwards native wake-word events', async () => {
    const wakeWordListeners = new Set<(payload: unknown) => void>();
    const runtimeStateListeners = new Set<(payload: unknown) => void>();
    const runtimeErrorListeners = new Set<(payload: unknown) => void>();
    const runtimeInterruptionListeners = new Set<(payload: unknown) => void>();
    const runtimeAudioRouteChangedListeners = new Set<
      (payload: unknown) => void
    >();
    const nativeStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    };

    const nativeModule = {
      initialize: jest.fn(async () => {
        nativeStatus.state = 'ready';
        nativeStatus.canStart = true;
      }),
      startDetection: jest.fn(async () => {
        nativeStatus.state = 'running';
        nativeStatus.isListening = true;
        nativeStatus.canStart = false;

        for (const listener of wakeWordListeners) {
          listener({
            detectedPhrase: 'native bridge wake word',
            detectedAt: '2026-03-06T12:00:00.000Z',
          });
        }
      }),
      stopDetection: jest.fn(async () => {
        nativeStatus.state = 'stopped';
        nativeStatus.isListening = false;
        nativeStatus.canStart = true;
      }),
      getStatus: jest.fn(() => ({ ...nativeStatus })),
      dispose: jest.fn(async () => {
        nativeStatus.state = 'idle';
        nativeStatus.isListening = false;
        nativeStatus.canStart = false;
      }),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };

    jest.doMock('../NativeVoiceActivator', () => ({
      __esModule: true,
      default: nativeModule,
    }));

    jest.doMock('react-native', () => ({
      // Every real react-native exports Platform, and the package root reads
      // Platform.OS to resolve BUNDLED_MODEL_ASSET_KEY. A double that omits it
      // is not modelling react-native, it is modelling a module that cannot
      // exist, and importing ../index against it fails for a reason no app
      // would ever hit.
      Platform: {
        OS: 'ios',
        select: (spec: Record<string, unknown>) => spec.ios,
      },
      NativeEventEmitter: class {
        addListener(eventName: string, listener: (payload: unknown) => void) {
          if (eventName === 'VoiceActivatorOnWakeWordDetected') {
            wakeWordListeners.add(listener);
          }
          if (eventName === 'VoiceActivatorOnRuntimeStateChanged') {
            runtimeStateListeners.add(listener);
          }
          if (eventName === 'VoiceActivatorOnRuntimeError') {
            runtimeErrorListeners.add(listener);
          }
          if (eventName === 'VoiceActivatorOnRuntimeInterruption') {
            runtimeInterruptionListeners.add(listener);
          }
          if (eventName === 'VoiceActivatorOnAudioRouteChanged') {
            runtimeAudioRouteChangedListeners.add(listener);
          }
          nativeModule.addListener(eventName);

          return {
            remove() {
              wakeWordListeners.delete(listener);
              runtimeStateListeners.delete(listener);
              runtimeErrorListeners.delete(listener);
              runtimeInterruptionListeners.delete(listener);
              runtimeAudioRouteChangedListeners.delete(listener);
              nativeModule.removeListeners(1);
            },
          };
        }
      },
    }));

    const VoiceActivator = await import('../index');
    const detectedEvents: Array<{
      detectedPhrase: string;
      detectedAt: string;
    }> = [];

    const subscription = VoiceActivator.addWakeWordListener(
      'wakeWordDetected',
      (payload) => {
        detectedEvents.push(payload);
      }
    );

    await VoiceActivator.initialize();
    await VoiceActivator.startDetection();
    await VoiceActivator.stopDetection();
    expect(VoiceActivator.getStatus()).toEqual({
      state: 'stopped',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    });
    await VoiceActivator.dispose();

    subscription.remove();

    expect(detectedEvents).toEqual([
      {
        detectedPhrase: 'native bridge wake word',
        detectedAt: '2026-03-06T12:00:00.000Z',
      },
    ]);
    expect(nativeModule.addListener).toHaveBeenCalledWith(
      'VoiceActivatorOnWakeWordDetected'
    );
    expect(nativeModule.addListener).toHaveBeenCalledWith(
      'VoiceActivatorOnRuntimeStateChanged'
    );
    expect(nativeModule.addListener).toHaveBeenCalledWith(
      'VoiceActivatorOnRuntimeError'
    );
    expect(nativeModule.addListener).toHaveBeenCalledWith(
      'VoiceActivatorOnRuntimeInterruption'
    );
    expect(nativeModule.addListener).toHaveBeenCalledWith(
      'VoiceActivatorOnAudioRouteChanged'
    );
    expect(runtimeStateListeners.size).toBeGreaterThan(0);
    expect(runtimeErrorListeners.size).toBeGreaterThan(0);
    expect(runtimeInterruptionListeners.size).toBeGreaterThan(0);
    expect(runtimeAudioRouteChangedListeners.size).toBeGreaterThan(0);
    expect(VoiceActivator.getStatus()).toEqual({
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    });
  });

  it('normalizes native runtime status and error events through the bridge boundary', async () => {
    const runtimeStateListeners = new Set<(payload: unknown) => void>();
    const runtimeErrorListeners = new Set<(payload: unknown) => void>();
    const nativeStatus: WakeWordStatus = {
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    };

    const nativeModule = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...nativeStatus })),
      dispose: jest.fn(async () => undefined),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };

    jest.doMock('../NativeVoiceActivator', () => ({
      __esModule: true,
      default: nativeModule,
    }));

    jest.doMock('react-native', () => ({
      // Every real react-native exports Platform, and the package root reads
      // Platform.OS to resolve BUNDLED_MODEL_ASSET_KEY. A double that omits it
      // is not modelling react-native, it is modelling a module that cannot
      // exist, and importing ../index against it fails for a reason no app
      // would ever hit.
      Platform: {
        OS: 'ios',
        select: (spec: Record<string, unknown>) => spec.ios,
      },
      NativeEventEmitter: class {
        addListener(eventName: string, listener: (payload: unknown) => void) {
          if (eventName === 'VoiceActivatorOnRuntimeStateChanged') {
            runtimeStateListeners.add(listener);
          }
          if (eventName === 'VoiceActivatorOnRuntimeError') {
            runtimeErrorListeners.add(listener);
          }
          nativeModule.addListener(eventName);

          return {
            remove() {
              runtimeStateListeners.delete(listener);
              runtimeErrorListeners.delete(listener);
              nativeModule.removeListeners(1);
            },
          };
        }
      },
    }));

    const VoiceActivator = await import('../index');
    const stateEvents: Array<{ previousState?: string; state: string }> = [];
    const errorEvents: WakeWordError[] = [];

    const stateSubscription = VoiceActivator.addWakeWordListener(
      'stateChanged',
      (payload) => {
        stateEvents.push(payload);
      }
    );
    const errorSubscription = VoiceActivator.addWakeWordListener(
      'error',
      (payload) => {
        errorEvents.push(payload);
      }
    );

    nativeStatus.state = 'unsupported';
    nativeStatus.isAvailable = false;
    nativeStatus.canStart = false;
    nativeStatus.lastError = {
      category: 'platform',
      code: 'runtime_unsupported',
      message: 'Android foreground runtime ownership could not be established.',
      recoverable: false,
      platform: 'android',
    };

    for (const listener of runtimeStateListeners) {
      listener({ ...nativeStatus });
    }
    for (const listener of runtimeErrorListeners) {
      listener({ ...(nativeStatus.lastError as WakeWordError) });
    }

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      lastError: {
        category: 'platform',
        code: 'runtime_unsupported',
        message:
          'Android foreground runtime ownership could not be established.',
        recoverable: false,
        platform: 'android',
      },
    });
    expect(stateEvents).toContainEqual({
      previousState: 'idle',
      state: 'unsupported',
    });
    expect(errorEvents).toEqual([
      {
        category: 'platform',
        code: 'runtime_unsupported',
        message:
          'Android foreground runtime ownership could not be established.',
        recoverable: false,
        platform: 'android',
      },
    ]);

    stateSubscription.remove();
    errorSubscription.remove();
  });

  it('forwards runtime status events when the visible background status changes without a state enum change', async () => {
    const runtimeStateListeners = new Set<(payload: unknown) => void>();
    const nativeStatus: WakeWordStatus = {
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    };

    const nativeModule = {
      initialize: jest.fn(async () => undefined),
      startDetection: jest.fn(async () => undefined),
      stopDetection: jest.fn(async () => undefined),
      getStatus: jest.fn(() => ({ ...nativeStatus })),
      dispose: jest.fn(async () => undefined),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };

    jest.doMock('../NativeVoiceActivator', () => ({
      __esModule: true,
      default: nativeModule,
    }));

    jest.doMock('react-native', () => ({
      // Every real react-native exports Platform, and the package root reads
      // Platform.OS to resolve BUNDLED_MODEL_ASSET_KEY. A double that omits it
      // is not modelling react-native, it is modelling a module that cannot
      // exist, and importing ../index against it fails for a reason no app
      // would ever hit.
      Platform: {
        OS: 'ios',
        select: (spec: Record<string, unknown>) => spec.ios,
      },
      NativeEventEmitter: class {
        addListener(eventName: string, listener: (payload: unknown) => void) {
          if (eventName === 'VoiceActivatorOnRuntimeStateChanged') {
            runtimeStateListeners.add(listener);
          }
          nativeModule.addListener(eventName);

          return {
            remove() {
              runtimeStateListeners.delete(listener);
              nativeModule.removeListeners(1);
            },
          };
        }
      },
    }));

    const VoiceActivator = await import('../index');
    const stateEvents: Array<{ previousState?: string; state: string }> = [];
    const subscription = VoiceActivator.addWakeWordListener(
      'stateChanged',
      (payload) => {
        stateEvents.push(payload);
      }
    );

    nativeStatus.reason =
      'Wake word detection is continuing in a supported iOS background audio state.';
    for (const listener of runtimeStateListeners) {
      listener({ ...nativeStatus });
    }
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    delete nativeStatus.reason;
    for (const listener of runtimeStateListeners) {
      listener({ ...nativeStatus });
    }
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    subscription.remove();

    expect(stateEvents).toEqual([
      { previousState: 'running', state: 'running' },
      { previousState: 'running', state: 'running' },
    ]);
  });

  it('forwards native audio-route change events through the bridge boundary', async () => {
    const runtimeAudioRouteChangedListeners = new Set<
      (payload: unknown) => void
    >();
    const nativeModule = {
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
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };

    jest.doMock('../NativeVoiceActivator', () => ({
      __esModule: true,
      default: nativeModule,
    }));

    jest.doMock('react-native', () => ({
      // Every real react-native exports Platform, and the package root reads
      // Platform.OS to resolve BUNDLED_MODEL_ASSET_KEY. A double that omits it
      // is not modelling react-native, it is modelling a module that cannot
      // exist, and importing ../index against it fails for a reason no app
      // would ever hit.
      Platform: {
        OS: 'ios',
        select: (spec: Record<string, unknown>) => spec.ios,
      },
      NativeEventEmitter: class {
        addListener(eventName: string, listener: (payload: unknown) => void) {
          if (eventName === 'VoiceActivatorOnAudioRouteChanged') {
            runtimeAudioRouteChangedListeners.add(listener);
          }
          nativeModule.addListener(eventName);

          return {
            remove() {
              runtimeAudioRouteChangedListeners.delete(listener);
              nativeModule.removeListeners(1);
            },
          };
        }
      },
    }));

    const VoiceActivator = await import('../index');
    const routeEvents: Array<{ route: string; previousRoute?: string }> = [];
    const subscription = VoiceActivator.addWakeWordListener(
      'audioRouteChanged',
      (payload) => {
        routeEvents.push(payload);
      }
    );

    for (const listener of runtimeAudioRouteChangedListeners) {
      listener({
        route: 'bluetooth',
        previousRoute: 'speaker',
      });
    }

    subscription.remove();

    expect(routeEvents).toEqual([
      {
        route: 'bluetooth',
        previousRoute: 'speaker',
      },
    ]);
  });
});
