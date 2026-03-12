import type { WakeWordDetectedEvent, WakeWordStatus } from '../public/types';

function createMockEngineRuntime() {
  let detectionTimer: ReturnType<typeof setTimeout> | null = null;
  let detectionCallback: ((event: WakeWordDetectedEvent) => void) | null = null;

  function clearDetectionTimer() {
    if (detectionTimer) {
      clearTimeout(detectionTimer);
      detectionTimer = null;
    }
  }

  return {
    initialize: jest.fn(
      async (
        _configuration,
        handlers: { onDetected(event: WakeWordDetectedEvent): void }
      ) => {
        detectionCallback = handlers.onDetected;
      }
    ),
    start: jest.fn(async () => {
      clearDetectionTimer();
      detectionTimer = setTimeout(() => {
        detectionTimer = null;
        detectionCallback?.({
          detectedPhrase: 'porcupine',
          detectedAt: '2026-03-06T12:00:00.000Z',
        });
      }, 0);
    }),
    stop: jest.fn(async () => {
      clearDetectionTimer();
    }),
    dispose: jest.fn(async () => {
      clearDetectionTimer();
    }),
  };
}

function mockLocalRuntimeBridge() {
  const runtime = jest
    .requireActual('../internal/local-foreground-runtime')
    .createLocalForegroundRuntime();
  const engineRuntime = createMockEngineRuntime();

  jest.doMock('../internal/native-module', () => ({
    nativeVoiceActivatorModule: null,
    getVoiceActivatorRuntimeBridge: jest.fn(() => runtime),
    setWakeWordDetectedHandler: jest.fn((handler) => {
      runtime.setWakeWordDetectedHandler(handler);
    }),
  }));

  jest.doMock('../engines', () => ({
    createNativeManagedEngineRuntime: jest.fn(() => engineRuntime),
  }));
}

describe('foreground fallback runtime behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('supports initialize, start, detect, stop, and dispose without a native module', async () => {
    mockLocalRuntimeBridge();

    const VoiceActivator = await import('../index');
    const detectedEvents: WakeWordDetectedEvent[] = [];

    const subscription = VoiceActivator.addWakeWordListener(
      'wakeWordDetected',
      (payload) => {
        detectedEvents.push(payload);
      }
    );

    await expect(VoiceActivator.initialize()).resolves.toBeUndefined();
    expect(VoiceActivator.getStatus()).toEqual<WakeWordStatus>({
      state: 'ready',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    });

    await expect(VoiceActivator.startDetection()).resolves.toBeUndefined();
    expect(VoiceActivator.getStatus()).toEqual<WakeWordStatus>({
      state: 'running',
      isAvailable: true,
      isListening: true,
      canStart: false,
      lastError: null,
    });

    jest.runOnlyPendingTimers();

    expect(detectedEvents).toEqual([
      {
        detectedPhrase: 'porcupine',
        detectedAt: '2026-03-06T12:00:00.000Z',
      },
    ]);

    await expect(VoiceActivator.stopDetection()).resolves.toBeUndefined();
    expect(VoiceActivator.getStatus()).toEqual<WakeWordStatus>({
      state: 'stopped',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    });

    await expect(VoiceActivator.dispose()).resolves.toBeUndefined();
    expect(VoiceActivator.getStatus()).toEqual<WakeWordStatus>({
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    });

    subscription.remove();
  });

  it('does not emit a wake word after stop or dispose clears the active foreground run', async () => {
    mockLocalRuntimeBridge();

    const VoiceActivator = await import('../index');
    const listener = jest.fn();
    const subscription = VoiceActivator.addWakeWordListener(
      'wakeWordDetected',
      listener
    );

    await VoiceActivator.initialize();
    await VoiceActivator.startDetection();
    await VoiceActivator.stopDetection();

    expect(listener).not.toHaveBeenCalled();

    await VoiceActivator.startDetection();
    await VoiceActivator.dispose();

    expect(listener).not.toHaveBeenCalled();

    subscription.remove();
  });

  it('requires initialize before the local foreground runtime can start detection', async () => {
    mockLocalRuntimeBridge();

    const VoiceActivator = await import('../index');

    await expect(VoiceActivator.startDetection()).rejects.toThrow(
      'VoiceActivator.startDetection requires initialize() to complete before detection can begin.'
    );
    expect(VoiceActivator.getStatus()).toEqual<WakeWordStatus>({
      state: 'error',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: {
        category: 'internal',
        code: 'startDetection_failed',
        message:
          'VoiceActivator.startDetection requires initialize() to complete before detection can begin.',
        recoverable: true,
      },
    });
  });

  it('does not let stopDetection unlock startDetection before initialize', async () => {
    mockLocalRuntimeBridge();

    const VoiceActivator = await import('../index');

    await expect(VoiceActivator.stopDetection()).resolves.toBeUndefined();
    expect(VoiceActivator.getStatus()).toEqual<WakeWordStatus>({
      state: 'idle',
      isAvailable: true,
      isListening: false,
      canStart: false,
      lastError: null,
    });

    await expect(VoiceActivator.startDetection()).rejects.toThrow(
      'VoiceActivator.startDetection requires initialize() to complete before detection can begin.'
    );
  });
});
