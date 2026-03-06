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

import type { WakeWordDetectedEvent } from '../public/types';

describe('voice activator public API with the real porcupine adapter', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('initializes and starts detection through the porcupine adapter path', async () => {
    const runtime = jest
      .requireActual('../internal/local-foreground-runtime')
      .createLocalForegroundRuntime();

    let detectedCallback: ((keywordIndex: number) => void) | null = null;
    const manager = {
      start: jest.fn(async () => {
        detectedCallback?.(0);
      }),
      stop: jest.fn(async () => undefined),
      delete: jest.fn(() => undefined),
    };

    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: null,
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtime),
      setWakeWordDetectedHandler: jest.fn((handler) => {
        runtime.setWakeWordDetectedHandler(handler);
      }),
    }));

    const picovoiceModule = await import('@picovoice/porcupine-react-native');
    const mockedPorcupineManager =
      picovoiceModule.PorcupineManager as unknown as {
        fromBuiltInKeywords: jest.Mock;
      };

    mockedPorcupineManager.fromBuiltInKeywords.mockImplementation(
      async (
        _accessKey,
        _keywords,
        onDetected: (keywordIndex: number) => void
      ) => {
        detectedCallback = onDetected;
        return manager;
      }
    );

    const VoiceActivator = await import('../index');
    const detectedEvents: WakeWordDetectedEvent[] = [];
    const subscription = VoiceActivator.addWakeWordListener(
      'wakeWordDetected',
      (event) => {
        detectedEvents.push(event);
      }
    );

    await VoiceActivator.initialize({
      engineConfig: {
        metadata: {
          accessKey: 'test-access-key',
        },
      },
    });
    await VoiceActivator.startDetection();

    expect(mockedPorcupineManager.fromBuiltInKeywords).toHaveBeenCalledWith(
      'test-access-key',
      ['porcupine'],
      expect.any(Function),
      expect.any(Function),
      undefined,
      undefined,
      [0.5]
    );
    expect(manager.start).toHaveBeenCalledTimes(1);
    expect(detectedEvents).toHaveLength(1);
    expect(detectedEvents[0]?.detectedPhrase).toBe('porcupine');

    subscription.remove();
  });
});
