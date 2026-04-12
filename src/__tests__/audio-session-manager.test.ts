/**
 * Tests for Story 11-3: iOS Audio Session Management and Routing
 *
 * Covers:
 *   - setAudioRoute() bridge wiring — calls NativeModules.VoiceActivator.setAudioRoute
 *   - No-op behaviour when the native method is absent (Android / web)
 *   - VoiceActivatorOnRuntimeInterruption event propagates through the runtime event system
 *   - audioRouteChanged event propagates through the runtime event system
 *
 * NOTE: Uses the TDZ-safe mock pattern (jest.fn() inside factory, accessed via
 * jest.requireMock) — same convention as audio-playback-manager.test.ts.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// Provide a full NativeModules.VoiceActivator stub so that voice-activator.ts
// module-level initialisation (createRuntimeStore / event handler registration)
// does not throw. Also expose setAudioRoute as a jest.fn().

jest.mock('react-native', () => ({
  NativeModules: {
    VoiceActivator: {
      initialize: jest.fn().mockResolvedValue(undefined),
      startDetection: jest.fn().mockResolvedValue(undefined),
      stopDetection: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({
        state: 'idle',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      }),
      dispose: jest.fn().mockResolvedValue(undefined),
      playPCMChunk: jest.fn().mockResolvedValue(undefined),
      playWav: jest.fn().mockResolvedValue(undefined),
      stopPlayback: jest.fn().mockResolvedValue(undefined),
      setVolumeDucking: jest.fn().mockResolvedValue(undefined),
      setAudioRoute: jest.fn().mockResolvedValue(undefined),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  })),
  TurboModuleRegistry: {
    get: jest.fn().mockReturnValue(null),
  },
}));

function getNativeVoiceActivatorMock() {
  return jest.requireMock('react-native').NativeModules
    .VoiceActivator as Record<string, jest.Mock>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('setAudioRoute()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls NativeModules.VoiceActivator.setAudioRoute with "speaker"', async () => {
    const { setAudioRoute } = await import('../public/voice-activator');
    await setAudioRoute('speaker');

    const native = getNativeVoiceActivatorMock();
    expect(native.setAudioRoute).toHaveBeenCalledTimes(1);
    expect(native.setAudioRoute).toHaveBeenCalledWith('speaker');
  });

  it('calls NativeModules.VoiceActivator.setAudioRoute with "bluetooth"', async () => {
    const { setAudioRoute } = await import('../public/voice-activator');
    await setAudioRoute('bluetooth');

    const native = getNativeVoiceActivatorMock();
    expect(native.setAudioRoute).toHaveBeenCalledWith('bluetooth');
  });

  it('is a no-op when native setAudioRoute method is absent', async () => {
    // Simulate a platform (e.g. web/TV) that does not implement setAudioRoute.
    const nativeAny = getNativeVoiceActivatorMock() as Record<string, unknown>;
    const originalFn = nativeAny.setAudioRoute;
    nativeAny.setAudioRoute = undefined;

    const { setAudioRoute } = await import('../public/voice-activator');
    // Should resolve without throwing
    await expect(setAudioRoute('default')).resolves.toBeUndefined();

    // Restore
    nativeAny.setAudioRoute = originalFn;
  });
});

describe('VoiceActivatorOnRuntimeInterruption event', () => {
  it('is surfaced through the runtime event system when received from native', async () => {
    // The runtime interruption event is already wired up by voice-activator.ts via
    // setRuntimeInterruptionHandler → emitRuntimeEvent('interruption', payload).
    // This test verifies that the listener subscription works end-to-end via
    // addWakeWordListener.

    const { addWakeWordListener } = await import('../public/voice-activator');
    const interruptionSpy = jest.fn();

    const subscription = addWakeWordListener('interruption', interruptionSpy);

    // Emit the interruption event through the runtime event system directly.
    // (In production this is triggered by the iOS AudioSessionManager via
    // kRuntimeInterruptionEventName, which flows through NativeEventEmitter →
    // setRuntimeInterruptionHandler → emitRuntimeEvent.)
    const { emitRuntimeEvent } = await import('../internal/runtime-events');
    emitRuntimeEvent('interruption', {
      reason: 'audio_interruption',
      recoverable: true,
    });

    expect(interruptionSpy).toHaveBeenCalledTimes(1);
    expect(interruptionSpy).toHaveBeenCalledWith({
      reason: 'audio_interruption',
      recoverable: true,
    });

    subscription.remove();
  });
});

describe('VoiceActivatorOnAudioRouteChanged event', () => {
  it('is surfaced through the runtime event system when received from native', async () => {
    const { addWakeWordListener } = await import('../public/voice-activator');
    const routeSpy = jest.fn();

    const subscription = addWakeWordListener('audioRouteChanged', routeSpy);

    const { emitRuntimeEvent } = await import('../internal/runtime-events');
    emitRuntimeEvent('audioRouteChanged', {
      route: 'carplay',
      previousRoute: 'speaker',
    });

    expect(routeSpy).toHaveBeenCalledTimes(1);
    expect(routeSpy).toHaveBeenCalledWith({
      route: 'carplay',
      previousRoute: 'speaker',
    });

    subscription.remove();
  });
});
