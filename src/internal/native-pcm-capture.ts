import { NativeModules } from 'react-native';

/**
 * Shared access to the package's native microphone capture.
 *
 * One hardware stream serves several consumers at once: the pre-wake VAD gate
 * (`vadGateEnabled`), the session utterance detector (`session.vad`), and
 * `WhisperRNSTTAdapter` on platforms where it records through the package rather
 * than a third-party module.
 *
 * This lived inside SileroVADEngine, where its refcount was private. A second
 * consumer with its own refcount would fight over the same native stream — an
 * unconditional stop starves every other live consumer of frames — so it is
 * extracted here to keep exactly one.
 */

export type VADPCMFrameEvent = { pcm: string };

export type VoiceActivatorVADNative = {
  startVADCapture: (sampleRate: number) => Promise<void>;
  stopVADCapture: () => Promise<void>;
};

/** Native event name for 16 kHz float32 PCM frames. */
export const VAD_NATIVE_PCM_FRAME_EVENT = 'VoiceActivatorOnVADPCMFrame';

export const NATIVE_CAPTURE_SAMPLE_RATE = 16000;

export function requireVADNativeModule(): VoiceActivatorVADNative {
  const mod =
    NativeModules.VoiceActivator as Partial<VoiceActivatorVADNative> | null;
  if (!mod?.startVADCapture || !mod?.stopVADCapture) {
    throw new Error(
      'VoiceActivator native module is missing VAD capture methods; rebuild the app with an up-to-date native binary.'
    );
  }
  return mod as VoiceActivatorVADNative;
}

/**
 * Refcount so the first start opens capture and only the last stop closes it.
 * An unconditional stop used to silently starve every other live consumer of
 * frames, leaving the pre-wake gate stuck on its last speech state.
 *
 * Transitions are serialised through a single promise chain so an overlapping
 * start/stop pair cannot interleave into the wrong native call order.
 */
let nativeCaptureRefCount = 0;
let nativeCaptureQueue: Promise<void> = Promise.resolve();

export function acquireNativeCapture(
  native: VoiceActivatorVADNative
): Promise<void> {
  nativeCaptureQueue = nativeCaptureQueue
    .catch(() => undefined)
    .then(async () => {
      nativeCaptureRefCount += 1;
      if (nativeCaptureRefCount !== 1) {
        return;
      }
      try {
        await native.startVADCapture(NATIVE_CAPTURE_SAMPLE_RATE);
      } catch (cause) {
        nativeCaptureRefCount -= 1;
        throw cause;
      }
    });
  return nativeCaptureQueue;
}

export function releaseNativeCapture(): Promise<void> {
  nativeCaptureQueue = nativeCaptureQueue
    .catch(() => undefined)
    .then(async () => {
      if (nativeCaptureRefCount === 0) {
        return;
      }
      nativeCaptureRefCount -= 1;
      if (nativeCaptureRefCount !== 0) {
        return;
      }
      const mod =
        NativeModules.VoiceActivator as Partial<VoiceActivatorVADNative> | null;
      await mod?.stopVADCapture?.();
    });
  return nativeCaptureQueue;
}

/**
 * @internal Test-only hook. The refcount is module-level and survives between
 * tests, so a suite that starts capture without stopping it would otherwise leak
 * a reference into the next test and suppress its `stopVADCapture` call.
 */
export function __resetNativeCaptureRefCountForTests(): void {
  nativeCaptureRefCount = 0;
  nativeCaptureQueue = Promise.resolve();
}
