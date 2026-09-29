import { NativeEventEmitter, NativeModules } from 'react-native';

import {
  acquireNativeCapture,
  NATIVE_CAPTURE_SAMPLE_RATE,
  releaseNativeCapture,
  requireVADNativeModule,
  VAD_NATIVE_PCM_FRAME_EVENT,
} from '../internal/native-pcm-capture';

/**
 * Sample rate of every frame delivered by {@link startAudioCapture}.
 *
 * Fixed, not configurable: the native layer taps at the hardware rate and
 * converts to this, and the wake-word engine and speaker-verification model are
 * both trained at it.
 */
export const AUDIO_CAPTURE_SAMPLE_RATE = NATIVE_CAPTURE_SAMPLE_RATE;

/**
 * One frame of captured microphone audio.
 *
 * `pcmBase64` is base64-encoded **little-endian float32** mono samples, the same
 * format `enrollSpeaker()` and the native speaker-embedding bridge expect. It is
 * NOT 16-bit integer PCM. Decoding it as int16 yields noise, and encoding int16
 * into it yields noise, because the native side reads it as
 * `bytes.length / 4` floats.
 */
export type AudioCaptureFrame = {
  pcmBase64: string;
  sampleRate: number;
};

export type AudioCaptureSubscription = {
  /**
   * Stops delivering frames and releases this consumer's claim on the
   * microphone. Safe to call more than once. The hardware stream closes only
   * when the last consumer releases it, so calling this while wake-word
   * detection is running does not stop detection.
   */
  remove(): Promise<void>;
};

/**
 * Subscribes to raw microphone frames from the package's own capture.
 *
 * Exists so an app can reach the audio the package is already capturing, rather
 * than opening a second microphone stream of its own. Two independent streams on
 * one device is not a configuration that reliably works: on iOS the second tap
 * can fail outright, and on Android whichever consumer stops last silently
 * starves the other. This routes through the same reference count the wake-word
 * gate and the session detector use, so the hardware opens once and closes when
 * the last consumer is done.
 *
 * Concatenate the decoded frames to build a buffer for `enrollSpeaker()`; the
 * format already matches, so no conversion is needed.
 *
 * ```ts
 * const capture = await startAudioCapture(({ pcmBase64 }) => chunks.push(pcmBase64));
 * // ... later
 * await capture.remove();
 * ```
 *
 * Requires microphone permission, which the caller must already hold. On
 * Android request `RECORD_AUDIO` first.
 *
 * @param onFrame Called per frame. A throw here is swallowed and warned about in
 *   dev, because nothing upstream of a native event listener can handle it.
 */
export async function startAudioCapture(
  onFrame: (frame: AudioCaptureFrame) => void
): Promise<AudioCaptureSubscription> {
  const native = requireVADNativeModule();
  const emitter = new NativeEventEmitter(NativeModules.VoiceActivator);

  const listener = emitter.addListener(VAD_NATIVE_PCM_FRAME_EVENT, ((
    ...args: readonly object[]
  ) => {
    try {
      const event = args[0] as { pcm?: string } | undefined;
      if (typeof event?.pcm !== 'string') return;
      onFrame({
        pcmBase64: event.pcm,
        sampleRate: AUDIO_CAPTURE_SAMPLE_RATE,
      });
    } catch (cause) {
      if (__DEV__) {
        console.warn('[VoiceActivator] audio capture listener threw:', cause);
      }
    }
  }) as (...args: readonly object[]) => unknown);

  try {
    await acquireNativeCapture(native);
  } catch (cause) {
    // The listener is attached before the acquire so no frame between the two
    // can be missed. If the acquire fails there is nothing to listen to, and a
    // left-behind listener would leak for the life of the app.
    listener.remove();
    throw cause;
  }

  let released = false;
  return {
    async remove() {
      if (released) return;
      released = true;
      listener.remove();
      await releaseNativeCapture();
    },
  };
}
