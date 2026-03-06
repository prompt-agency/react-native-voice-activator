jest.mock('@picovoice/porcupine-react-native', () => {
  class MockPorcupineError extends Error {}
  class MockPorcupineRuntimeError extends MockPorcupineError {}
  class MockPorcupineInvalidStateError extends MockPorcupineError {}
  class MockPorcupineInvalidArgumentError extends MockPorcupineError {}
  class MockPorcupineActivationError extends MockPorcupineError {}
  class MockPorcupineActivationLimitError extends MockPorcupineError {}
  class MockPorcupineActivationRefusedError extends MockPorcupineError {}
  class MockPorcupineActivationThrottledError extends MockPorcupineError {}
  class MockPorcupineIOError extends MockPorcupineError {}
  class MockPorcupineKeyError extends MockPorcupineError {}
  class MockPorcupineMemoryError extends MockPorcupineError {}

  return {
    BuiltInKeywords: {
      PORCUPINE: 'porcupine',
      HEY_GOOGLE: 'hey google',
    },
    PorcupineManager: {
      fromBuiltInKeywords: jest.fn(),
      fromKeywordPaths: jest.fn(),
    },
    PorcupineErrors: {
      PorcupineError: MockPorcupineError,
      PorcupineRuntimeError: MockPorcupineRuntimeError,
      PorcupineInvalidStateError: MockPorcupineInvalidStateError,
      PorcupineInvalidArgumentError: MockPorcupineInvalidArgumentError,
      PorcupineActivationError: MockPorcupineActivationError,
      PorcupineActivationLimitError: MockPorcupineActivationLimitError,
      PorcupineActivationRefusedError: MockPorcupineActivationRefusedError,
      PorcupineActivationThrottledError: MockPorcupineActivationThrottledError,
      PorcupineIOError: MockPorcupineIOError,
      PorcupineKeyError: MockPorcupineKeyError,
      PorcupineMemoryError: MockPorcupineMemoryError,
    },
  };
});

import {
  PorcupineErrors,
  PorcupineManager,
} from '@picovoice/porcupine-react-native';

import { createRuntimeConfiguration } from '../domain/detection-config';
import { createPorcupineEngineRuntime } from '../engines';

type MockPorcupineManager = {
  fromBuiltInKeywords: jest.Mock;
  fromKeywordPaths: jest.Mock;
};

describe('porcupine engine adapter', () => {
  const mockedManager = PorcupineManager as unknown as MockPorcupineManager;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the built-in manager from engine-neutral runtime configuration', async () => {
    const manager = {
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
      delete: jest.fn(() => undefined),
    };
    mockedManager.fromBuiltInKeywords.mockResolvedValue(manager);

    const runtime = createPorcupineEngineRuntime();
    const detected = jest.fn();
    const errored = jest.fn();
    const configuration = createRuntimeConfiguration({
      engineConfig: {
        sensitivity: 0.7,
        metadata: {
          accessKey: 'test-access-key',
        },
      },
    });

    await runtime.initialize(configuration, {
      onDetected: detected,
      onError: errored,
    });
    await runtime.start();

    expect(mockedManager.fromBuiltInKeywords).toHaveBeenCalledWith(
      'test-access-key',
      ['porcupine'],
      expect.any(Function),
      expect.any(Function),
      undefined,
      undefined,
      [0.7]
    );
    expect(manager.start).toHaveBeenCalledTimes(1);
    expect(errored).not.toHaveBeenCalled();
  });

  it('supports custom keyword paths without leaking vendor-specific config into the public API', async () => {
    const manager = {
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
      delete: jest.fn(() => undefined),
    };
    mockedManager.fromKeywordPaths.mockResolvedValue(manager);

    const runtime = createPorcupineEngineRuntime();
    const configuration = createRuntimeConfiguration({
      engineConfig: {
        assetKeys: {
          keywordAssetKey: '/tmp/custom.ppn',
          modelAssetKey: '/tmp/porcupine.pv',
        },
        metadata: {
          accessKey: 'test-access-key',
        },
      },
    });

    await runtime.initialize(configuration, {
      onDetected: jest.fn(),
      onError: jest.fn(),
    });
    await runtime.start();

    expect(mockedManager.fromKeywordPaths).toHaveBeenCalledWith(
      'test-access-key',
      ['/tmp/custom.ppn'],
      expect.any(Function),
      expect.any(Function),
      '/tmp/porcupine.pv',
      undefined,
      [0.5]
    );
  });

  it('surfaces missing access keys as configuration errors', async () => {
    const runtime = createPorcupineEngineRuntime();
    const configuration = createRuntimeConfiguration();

    await runtime.initialize(configuration, {
      onDetected: jest.fn(),
      onError: jest.fn(),
    });

    await expect(runtime.start()).rejects.toEqual({
      category: 'configuration',
      code: 'missing_access_key',
      message:
        'The built-in wake word engine requires an access key in engineConfig.metadata.accessKey.',
      recoverable: true,
    });
  });

  it('treats unsupported relative custom asset keys as configuration errors', async () => {
    const runtime = createPorcupineEngineRuntime();
    const configuration = createRuntimeConfiguration({
      engineConfig: {
        assetKeys: {
          keywordAssetKey: 'keywords/custom.ppn',
        },
        metadata: {
          accessKey: 'test-access-key',
        },
      },
    });

    await runtime.initialize(configuration, {
      onDetected: jest.fn(),
      onError: jest.fn(),
    });

    await expect(runtime.start()).rejects.toEqual({
      category: 'configuration',
      code: 'invalid_keyword_asset_key',
      message:
        'The built-in wake word engine requires keyword assets to be provided as built-in keywords, absolute paths, or file:// URLs.',
      recoverable: true,
    });
  });

  it('normalizes SDK startup failures into engine errors', async () => {
    mockedManager.fromBuiltInKeywords.mockRejectedValue(
      new PorcupineErrors.PorcupineRuntimeError('native porcupine failed')
    );

    const runtime = createPorcupineEngineRuntime();
    const configuration = createRuntimeConfiguration({
      engineConfig: {
        metadata: {
          accessKey: 'test-access-key',
        },
      },
    });

    await runtime.initialize(configuration, {
      onDetected: jest.fn(),
      onError: jest.fn(),
    });

    await expect(runtime.start()).rejects.toEqual({
      category: 'engine',
      code: 'engine_runtime_failed',
      message: 'native porcupine failed',
      recoverable: true,
    });
  });
});
