jest.mock('../internal/native-module', () => ({
  nativeVoiceActivatorModule: {
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
  },
}));

import * as VoiceActivator from '../index';

describe('public TypeScript API contract', () => {
  it('exports the lifecycle contract instead of starter placeholder helpers', async () => {
    expect(typeof VoiceActivator.initialize).toBe('function');
    expect(typeof VoiceActivator.startDetection).toBe('function');
    expect(typeof VoiceActivator.stopDetection).toBe('function');
    expect(typeof VoiceActivator.getStatus).toBe('function');
    expect(typeof VoiceActivator.dispose).toBe('function');
    expect(typeof VoiceActivator.addWakeWordListener).toBe('function');
    expect(VoiceActivator.wakeWordStates).toContain('running');
    expect('multiply' in VoiceActivator).toBe(false);

    await expect(VoiceActivator.initialize()).resolves.toBeUndefined();
    await expect(VoiceActivator.startDetection()).resolves.toBeUndefined();
    await expect(VoiceActivator.stopDetection()).resolves.toBeUndefined();
    await expect(VoiceActivator.dispose()).resolves.toBeUndefined();
  });

  it('keeps engine-specific names out of the public runtime exports', () => {
    expect(
      Object.keys(VoiceActivator).some((key) => /porcupine/i.test(key))
    ).toBe(false);

    expect(VoiceActivator.getStatus()).toEqual({
      state: 'ready',
      isAvailable: true,
      isListening: false,
      canStart: true,
      lastError: null,
    });
  });

  it('returns a removable typed event subscription surface', () => {
    const subscription = VoiceActivator.addWakeWordListener(
      'stateChanged',
      jest.fn()
    );

    expect(typeof subscription.remove).toBe('function');
    expect(() => subscription.remove()).not.toThrow();
  });
});
