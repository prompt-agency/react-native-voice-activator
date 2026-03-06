jest.mock('../internal/native-module', () => ({
  nativeVoiceActivatorModule: null,
}));

import * as VoiceActivator from '../index';

describe('unsupported bootstrap contract', () => {
  it('exposes unsupported status coherently before native runtime stories land', () => {
    expect(VoiceActivator.getStatus()).toEqual({
      state: 'unsupported',
      isAvailable: false,
      isListening: false,
      canStart: false,
      reason:
        'The native wake word runtime is not implemented yet. Story 1.2 defines the public TypeScript contract only.',
      lastError: null,
    });
  });

  it('rejects lifecycle calls with a consistent unsupported runtime message', async () => {
    await expect(VoiceActivator.initialize()).rejects.toThrow(
      'VoiceActivator.initialize is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.'
    );
    await expect(VoiceActivator.startDetection()).rejects.toThrow(
      'VoiceActivator.startDetection is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.'
    );
    await expect(VoiceActivator.stopDetection()).rejects.toThrow(
      'VoiceActivator.stopDetection is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.'
    );
    await expect(VoiceActivator.dispose()).rejects.toThrow(
      'VoiceActivator.dispose is unavailable until the native wake word runtime is implemented. Check getStatus() before calling lifecycle methods.'
    );
  });

  it('still allows event subscriptions before runtime implementation exists', () => {
    const subscription = VoiceActivator.addWakeWordListener(
      'wakeWordDetected',
      jest.fn()
    );

    expect(typeof subscription.remove).toBe('function');
    expect(() => subscription.remove()).not.toThrow();
  });
});
