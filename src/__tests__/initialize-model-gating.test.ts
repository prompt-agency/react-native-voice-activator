/**
 * initialize-model-gating.test.ts
 *
 * Models are downloaded on demand rather than shipped in the package, so
 * initialize() has to say something useful when they are absent. A native
 * "missing asset" thrown several layers down is not actionable; a specific,
 * non-recoverable error naming prepareModels() is.
 *
 * jest.setup.js mocks the model store to "ready" for the rest of the suite.
 * These tests override that mock to exercise the absent and self-supplied paths.
 */

import type { WakeWordDetectedEvent } from '../public/types';

describe('initialize() model gating', () => {
  function setupMocks() {
    const runtimeBridge = {
      initialize: jest.fn().mockResolvedValue(undefined),
      startDetection: jest.fn().mockResolvedValue(undefined),
      stopDetection: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({
        state: 'ready',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      }),
    };

    jest.doMock('../internal/native-module', () => ({
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(
        (_h: (p: WakeWordDetectedEvent) => void) => undefined
      ),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(() => ({ remove: jest.fn() })),
      emitSessionEvent: jest.fn(),
    }));

    return runtimeBridge;
  }

  function mockModelStore(status: {
    ready: boolean;
    missing?: string[];
    directory?: string;
  }) {
    jest.doMock('../internal/model-store', () => {
      const actual = jest.requireActual('../internal/model-store');
      return {
        ...actual,
        getModelBundleStatus: jest.fn(async () => ({
          ready: status.ready,
          directory: status.directory ?? '/Library/voice-activator/models/1',
          bundleVersion: actual.modelBundleManifest.bundleVersion,
          missing: status.missing ?? [],
          bytesTotal: actual.modelBundleManifest.totalBytes,
        })),
        prepareModelBundle: jest.fn(async () => ({
          directory: status.directory ?? '/Library/voice-activator/models/1',
          downloaded: [],
          verified: [],
        })),
      };
    });
  }

  beforeEach(() => {
    jest.resetModules();
    setupMocks();
  });

  it('rejects with an actionable error when the models are absent', async () => {
    mockModelStore({
      ready: false,
      missing: ['silero_vad.onnx', 'tokens.txt'],
    });

    const { initialize, getStatus } = await import('../public/voice-activator');

    await expect(initialize({})).rejects.toThrow(/prepareModels\(\)/);

    const lastError = getStatus().lastError;
    expect(lastError?.code).toBe('models_not_prepared');
    expect(lastError?.category).toBe('configuration');
    // A retry with the same options cannot succeed.
    expect(lastError?.recoverable).toBe(false);
  });

  it('names the download size and the escape hatch', async () => {
    mockModelStore({ ready: false, missing: ['silero_vad.onnx'] });

    const { initialize } = await import('../public/voice-activator');

    const error = await initialize({}).then(
      () => null,
      (cause: Error) => cause
    );

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/MB/);
    expect(error!.message).toMatch(/engineConfig\.assetKeys\.modelAssetKey/);
  });

  it('does not start the native runtime when the models are absent', async () => {
    const bridge = setupMocks();
    mockModelStore({ ready: false, missing: ['silero_vad.onnx'] });

    const { initialize } = await import('../public/voice-activator');

    await initialize({}).catch(() => undefined);

    expect(bridge.initialize).not.toHaveBeenCalled();
  });

  it('forwards the downloaded model directory when the bundle is ready', async () => {
    const bridge = setupMocks();
    mockModelStore({ ready: true, directory: '/Library/models/1' });

    const { initialize } = await import('../public/voice-activator');

    await initialize({});

    expect(bridge.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        engineConfig: expect.objectContaining({
          assetKeys: expect.objectContaining({
            modelAssetKey: '/Library/models/1',
          }),
        }),
      })
    );
  });

  it('does not require prepared models when the app supplies its own root', async () => {
    const bridge = setupMocks();
    // Absent on-demand bundle, but the app ships its own models.
    mockModelStore({ ready: false, missing: ['silero_vad.onnx'] });

    const { initialize } = await import('../public/voice-activator');

    await expect(
      initialize({
        engineConfig: { assetKeys: { modelAssetKey: 'my-bundled-models' } },
      })
    ).resolves.toBeUndefined();

    expect(bridge.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        engineConfig: expect.objectContaining({
          assetKeys: expect.objectContaining({
            modelAssetKey: 'my-bundled-models',
          }),
        }),
      })
    );
  });

  it('exposes prepareModels and getModelStatus on the public surface', async () => {
    mockModelStore({ ready: true });

    const api = await import('../public/voice-activator');

    expect(typeof api.prepareModels).toBe('function');
    expect(typeof api.getModelStatus).toBe('function');
    await expect(api.getModelStatus()).resolves.toMatchObject({ ready: true });
  });
});
