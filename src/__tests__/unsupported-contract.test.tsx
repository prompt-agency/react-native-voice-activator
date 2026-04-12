import type { WakeWordStatus } from '../public/types';

describe('unsupported runtime behavior', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('surfaces an explicit unsupported contract when the native module is unavailable', async () => {
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
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    const VoiceActivator = await import('../index');

    expect(VoiceActivator.getStatus()).toEqual<WakeWordStatus>({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'VoiceActivator requires the native runtime module. Detection is unavailable until the package is installed and built in a supported native environment.',
      lastError: null,
    });

    await expect(VoiceActivator.initialize()).rejects.toThrow(
      'VoiceActivator.initialize is unavailable until the native runtime module is installed and built in a supported native environment.'
    );
    await expect(VoiceActivator.startDetection()).rejects.toThrow(
      'VoiceActivator.startDetection is unavailable until the native runtime module is installed and built in a supported native environment.'
    );
    await expect(VoiceActivator.stopDetection()).rejects.toThrow(
      'VoiceActivator.stopDetection is unavailable until the native runtime module is installed and built in a supported native environment.'
    );
    await expect(VoiceActivator.dispose()).rejects.toThrow(
      'VoiceActivator.dispose is unavailable until the native runtime module is installed and built in a supported native environment.'
    );
  });
});
