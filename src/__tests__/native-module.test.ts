import { createDefaultRuntimeConfiguration } from '../domain/detection-config';

describe('native module bridge selection', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('fails explicitly instead of silently falling back when a native module is partially implemented', async () => {
    jest.doMock('react-native', () => ({
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
      NativeEventEmitter: class {
        addListener(eventName: string, listener: (payload: unknown) => void) {
          wakeWordListeners.add(listener);
          nativeModule.addListener(eventName);

          return {
            remove() {
              wakeWordListeners.delete(listener);
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
    expect(VoiceActivator.getStatus()).toEqual({
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    });
  });
});
