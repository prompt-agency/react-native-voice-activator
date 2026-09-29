/**
 * startAudioCapture shares one hardware stream with the wake-word gate and the
 * session detector through a reference count. The failure modes worth pinning
 * are all about that sharing, plus the listener lifecycle: a leaked listener
 * lives for the life of the app, and a leaked reference count means the
 * microphone never closes.
 */
const mockNative = {
  startVADCapture: jest.fn().mockResolvedValue(undefined),
  stopVADCapture: jest.fn().mockResolvedValue(undefined),
};

const mockListener = { remove: jest.fn() };
const mockAddListener = jest.fn().mockReturnValue(mockListener);

// jest.mock is hoisted above the consts above, so the factory must not touch
// them at definition time. Getters defer the read until the module under test
// actually looks the value up, which it only does inside its functions.
jest.mock('react-native', () => ({
  NativeModules: {
    get VoiceActivator() {
      return mockNative;
    },
  },
  NativeEventEmitter: class {
    addListener(...args: readonly unknown[]) {
      return mockAddListener(...args);
    }
  },
}));

import { startAudioCapture } from '../public/audio-capture';
import {
  __resetNativeCaptureRefCountForTests,
  VAD_NATIVE_PCM_FRAME_EVENT,
} from '../internal/native-pcm-capture';

/** Invokes whatever listener the most recent subscribe attached. */
function emitFrame(payload: unknown) {
  const handler = mockAddListener.mock.calls.at(-1)?.[1] as (
    ...args: readonly unknown[]
  ) => void;
  handler(payload);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.startVADCapture.mockResolvedValue(undefined);
  mockNative.stopVADCapture.mockResolvedValue(undefined);
  mockAddListener.mockReturnValue(mockListener);
  __resetNativeCaptureRefCountForTests();
});

it('opens the microphone and delivers frames as float32 at 16 kHz', async () => {
  const frames: Array<{ pcmBase64: string; sampleRate: number }> = [];
  const capture = await startAudioCapture((frame) => frames.push(frame));

  expect(mockNative.startVADCapture).toHaveBeenCalledWith(16000);
  expect(mockAddListener).toHaveBeenCalledWith(
    VAD_NATIVE_PCM_FRAME_EVENT,
    expect.any(Function)
  );

  emitFrame({ pcm: 'AAAAAA==' });
  expect(frames).toEqual([{ pcmBase64: 'AAAAAA==', sampleRate: 16000 }]);

  await capture.remove();
  expect(mockNative.stopVADCapture).toHaveBeenCalledTimes(1);
  expect(mockListener.remove).toHaveBeenCalledTimes(1);
});

it('does not close the shared stream while another consumer holds it', async () => {
  const first = await startAudioCapture(() => undefined);
  const second = await startAudioCapture(() => undefined);

  // One hardware open for two consumers.
  expect(mockNative.startVADCapture).toHaveBeenCalledTimes(1);

  await first.remove();
  // This is the bug the refcount exists to prevent: releasing one consumer must
  // not starve the other of frames.
  expect(mockNative.stopVADCapture).not.toHaveBeenCalled();

  await second.remove();
  expect(mockNative.stopVADCapture).toHaveBeenCalledTimes(1);
});

it('remove() is idempotent, so a double stop cannot close someone else’s stream', async () => {
  const first = await startAudioCapture(() => undefined);
  const second = await startAudioCapture(() => undefined);

  await first.remove();
  await first.remove();
  await first.remove();

  // Without the guard, the extra removes would drain the refcount to zero and
  // stop capture out from under `second`.
  expect(mockNative.stopVADCapture).not.toHaveBeenCalled();

  await second.remove();
  expect(mockNative.stopVADCapture).toHaveBeenCalledTimes(1);
});

it('leaves no listener behind when opening the microphone fails', async () => {
  mockNative.startVADCapture.mockRejectedValue(new Error('mic busy'));

  await expect(startAudioCapture(() => undefined)).rejects.toThrow('mic busy');

  // A listener attached but never removed survives for the life of the app.
  expect(mockListener.remove).toHaveBeenCalledTimes(1);
});

it('a failed start does not leak a reference that wedges the next stop', async () => {
  mockNative.startVADCapture.mockRejectedValueOnce(new Error('mic busy'));
  await expect(startAudioCapture(() => undefined)).rejects.toThrow('mic busy');

  mockNative.startVADCapture.mockResolvedValue(undefined);
  const capture = await startAudioCapture(() => undefined);
  await capture.remove();

  // If the failed attempt had left the count at 1, this stop would have been
  // swallowed and the microphone would stay open forever.
  expect(mockNative.stopVADCapture).toHaveBeenCalledTimes(1);
});

it('a throwing consumer callback does not escape into the native emitter', async () => {
  const capture = await startAudioCapture(() => {
    throw new Error('consumer bug');
  });

  expect(() => emitFrame({ pcm: 'AAAA' })).not.toThrow();
  await capture.remove();
});

it('ignores malformed frames rather than handing them to the consumer', async () => {
  const frames: unknown[] = [];
  const capture = await startAudioCapture((frame) => frames.push(frame));

  emitFrame(undefined);
  emitFrame({});
  emitFrame({ pcm: 42 });
  expect(frames).toEqual([]);

  emitFrame({ pcm: 'ok' });
  expect(frames).toHaveLength(1);

  await capture.remove();
});

it('throws a rebuild-the-app error when the native module lacks capture', async () => {
  const saved = mockNative.startVADCapture;
  // @ts-expect-error deliberately modelling an out-of-date native binary
  delete mockNative.startVADCapture;

  await expect(startAudioCapture(() => undefined)).rejects.toThrow(
    /rebuild the app/i
  );
  // Nothing was subscribed, so nothing needs cleaning up.
  expect(mockAddListener).not.toHaveBeenCalled();

  mockNative.startVADCapture = saved;
});
