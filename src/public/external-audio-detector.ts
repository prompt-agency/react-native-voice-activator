import NativeVoiceActivator from '../NativeVoiceActivator';
import {
  getModelBundleStatus,
  resolveModelAssetRoot,
} from '../internal/model-store';
import { writeWakePhraseKeywords } from '../internal/wake-phrase';
import { uint8ArrayToBase64 } from '../internal/base64';

export interface ExternalAudioDetectorOptions {
  wakePhrase: string | readonly string[];
  /** Same 0 to 1 sensitivity scale as `initialize()`. Defaults to 0.5. */
  sensitivity?: number;
}

export interface ExternalAudioDetection {
  /** The matched phrase, or null when the frame completes no phrase. */
  keyword: string | null;
}

export interface ExternalAudioDetector {
  /** Feed 16 kHz mono float32 PCM, or its little-endian base64 representation. */
  processFrame(frame: Float32Array | string): Promise<ExternalAudioDetection>;
  /** Clear all accumulated audio without unloading the models. */
  reset(): Promise<void>;
  /** Release native resources. Safe to call repeatedly. */
  dispose(): Promise<void>;
}

/**
 * Create a detector for audio captured by the app. This does not request
 * microphone permission or open an audio session.
 *
 * Call `prepareModels()` first. Each handle has its own native stream, so
 * it does not alter the managed wake-word listener or its microphone.
 */
export async function createExternalAudioDetector(
  options: ExternalAudioDetectorOptions
): Promise<ExternalAudioDetector> {
  if (!NativeVoiceActivator?.createExternalDetector) {
    throw new Error('External audio detection is unavailable in this build.');
  }
  const native = NativeVoiceActivator;
  if (
    options.sensitivity !== undefined &&
    (!Number.isFinite(options.sensitivity) ||
      options.sensitivity < 0 ||
      options.sensitivity > 1)
  ) {
    throw new RangeError('sensitivity must be between 0 and 1.');
  }

  const modelStatus = await getModelBundleStatus();
  if (!modelStatus.ready) {
    throw new Error(
      'Call prepareModels() before creating an external detector.'
    );
  }
  const modelPath = resolveModelAssetRoot(modelStatus.directory);
  const { path: keywordsPath } = await writeWakePhraseKeywords(
    options.wakePhrase,
    modelPath
  );
  const detectorId = await native.createExternalDetector({
    modelPath,
    keywordsPath,
    sensitivity: options.sensitivity ?? 0.5,
  });
  let disposed = false;
  let pending: Promise<unknown> = Promise.resolve();
  let queuedFrames = 0;
  let resetRequirement = 0;
  let completedReset = 0;
  let failureResetRequirement = 0;

  // Serialize operations per stream. A second frame must never overtake the
  // first while native code is decoding, and dispose must wait for in-flight work.
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(operation);
    pending = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  return {
    processFrame(frame) {
      if (disposed) return Promise.reject(new Error('Detector is disposed.'));
      if (typeof frame !== 'string' && !(frame instanceof Float32Array)) {
        return Promise.reject(
          new TypeError('frame must be Float32Array or base64.')
        );
      }
      if (
        frame.length === 0 ||
        (frame instanceof Float32Array && frame.length > 16000) ||
        (typeof frame === 'string' && frame.length > 85336)
      ) {
        return Promise.reject(
          new RangeError('frame must contain 1 to 16000 samples.')
        );
      }
      if (queuedFrames >= 2) {
        resetRequirement += 1;
        return Promise.reject(
          new Error('External detector backpressure: await earlier frames.')
        );
      }
      let pcmBase64: string;
      try {
        // Snapshot caller-owned buffers now. Audio capture often reuses them
        // before the queued native operation begins.
        pcmBase64 =
          typeof frame === 'string'
            ? frame
            : uint8ArrayToBase64(
                new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength)
              );
      } catch (error) {
        return Promise.reject(error);
      }
      queuedFrames += 1;
      const requiredReset = resetRequirement;
      return enqueue(async () => {
        const neededReset = Math.max(requiredReset, failureResetRequirement);
        if (neededReset > completedReset) {
          await native.resetExternalDetector(detectorId);
          completedReset = neededReset;
        }
        try {
          const result = await native.processExternalDetectorFrame(
            detectorId,
            pcmBase64,
            16000
          );
          const keyword = (result as { keyword?: unknown }).keyword;
          if (
            keyword !== null &&
            keyword !== undefined &&
            typeof keyword !== 'string'
          ) {
            throw new Error('Native detector returned an invalid keyword.');
          }
          return { keyword: keyword ?? null } as ExternalAudioDetection;
        } catch (error) {
          resetRequirement += 1;
          failureResetRequirement = resetRequirement;
          throw error;
        }
      }).finally(() => {
        queuedFrames -= 1;
      });
    },
    reset() {
      if (disposed) return Promise.reject(new Error('Detector is disposed.'));
      resetRequirement += 1;
      const requiredReset = resetRequirement;
      return enqueue(async () => {
        await native.resetExternalDetector(detectorId);
        completedReset = requiredReset;
      });
    },
    dispose() {
      if (disposed) return pending.then(() => undefined);
      disposed = true;
      return enqueue(() => native.disposeExternalDetector(detectorId)).catch(
        (error) => {
          disposed = false;
          throw error;
        }
      );
    },
  };
}
