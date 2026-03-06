import type {
  WakeWordError,
  WakeWordStateChangedEvent,
  WakeWordStatus,
} from '../public/types';

describe('unsupported bootstrap runtime behavior', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('emits structured error events and preserves unsupported status when runtime methods are unavailable', async () => {
    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: null,
    }));

    const VoiceActivator = await import('../index');
    const errors: WakeWordError[] = [];
    const states: WakeWordStateChangedEvent[] = [];

    const errorSubscription = VoiceActivator.addWakeWordListener(
      'error',
      (payload) => {
        errors.push(payload);
      }
    );
    const stateSubscription = VoiceActivator.addWakeWordListener(
      'stateChanged',
      (payload) => {
        states.push(payload);
      }
    );

    await expect(VoiceActivator.initialize()).rejects.toThrow(
      'VoiceActivator.initialize is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.'
    );

    errorSubscription.remove();
    stateSubscription.remove();

    expect(errors).toEqual([
      {
        category: 'internal',
        code: 'runtime_unavailable',
        message:
          'VoiceActivator.initialize is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.',
        recoverable: true,
      },
    ]);

    expect(states).toEqual([]);
    expect(VoiceActivator.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'The native wake word runtime is not implemented yet. Story 1.2 defines the public TypeScript contract only.',
      lastError: {
        category: 'internal',
        code: 'runtime_unavailable',
        message:
          'VoiceActivator.initialize is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.',
        recoverable: true,
      },
    });
  });

  it('updates status before error listeners observe runtime failures', async () => {
    jest.doMock('../internal/native-module', () => ({
      nativeVoiceActivatorModule: null,
    }));

    const VoiceActivator = await import('../index');
    const observedStatuses: WakeWordStatus[] = [];

    const subscription = VoiceActivator.addWakeWordListener('error', () => {
      observedStatuses.push(VoiceActivator.getStatus());
    });

    await expect(VoiceActivator.startDetection()).rejects.toThrow(
      'VoiceActivator.startDetection is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.'
    );

    subscription.remove();

    expect(observedStatuses).toEqual([
      {
        state: 'unsupported',
        isAvailable: false,
        isListening: false,
        canStart: false,
        reason:
          'The native wake word runtime is not implemented yet. Story 1.2 defines the public TypeScript contract only.',
        lastError: {
          category: 'internal',
          code: 'runtime_unavailable',
          message:
            'VoiceActivator.startDetection is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.',
          recoverable: true,
        },
      },
    ]);
  });
});
