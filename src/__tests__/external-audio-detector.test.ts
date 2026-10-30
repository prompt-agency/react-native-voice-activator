import NativeVoiceActivator from '../NativeVoiceActivator';
import { getModelBundleStatus } from '../internal/model-store';
import { writeWakePhraseKeywords } from '../internal/wake-phrase';
import { createExternalAudioDetector } from '../public/external-audio-detector';

jest.mock('../NativeVoiceActivator', () => ({
  __esModule: true,
  default: {
    createExternalDetector: jest.fn(async () => 'detector-1'),
    processExternalDetectorFrame: jest.fn(async () => ({ keyword: null })),
    resetExternalDetector: jest.fn(async () => undefined),
    disposeExternalDetector: jest.fn(async () => undefined),
  },
}));

jest.mock('../internal/wake-phrase', () => ({
  writeWakePhraseKeywords: jest.fn(async () => ({
    path: '/models/keywords.txt',
  })),
}));

const native = NativeVoiceActivator!;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(native.processExternalDetectorFrame).mockReset();
  jest
    .mocked(native.processExternalDetectorFrame)
    .mockResolvedValue({ keyword: null });
});

it('creates an independent detector and returns a matched phrase', async () => {
  jest.mocked(native.processExternalDetectorFrame).mockResolvedValueOnce({
    keyword: 'HEY ACME',
  });
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });

  expect(writeWakePhraseKeywords).toHaveBeenCalledWith(
    'hey acme',
    '/mock/voice-activator/models/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
  );
  expect(native.createExternalDetector).toHaveBeenCalledWith({
    modelPath:
      '/mock/voice-activator/models/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01',
    keywordsPath: '/models/keywords.txt',
    sensitivity: 0.5,
  });
  await expect(detector.processFrame('AAAAAA==')).resolves.toEqual({
    keyword: 'HEY ACME',
  });
  expect(native.processExternalDetectorFrame).toHaveBeenCalledWith(
    'detector-1',
    'AAAAAA==',
    16000
  );
});

it('rejects missing models and invalid sensitivity before native creation', async () => {
  jest.mocked(getModelBundleStatus).mockResolvedValueOnce({
    ready: false,
    directory: '/models',
    bundleVersion: '1',
    missing: ['encoder.onnx'],
    bytesTotal: 1,
  });
  await expect(
    createExternalAudioDetector({ wakePhrase: 'hey acme' })
  ).rejects.toThrow('prepareModels()');
  await expect(
    createExternalAudioDetector({ wakePhrase: 'hey acme', sensitivity: 2 })
  ).rejects.toThrow('between 0 and 1');
  expect(native.createExternalDetector).not.toHaveBeenCalled();
});

it('waits for an in-flight frame before reset and dispose', async () => {
  let resolveFrame: ((value: { keyword: null }) => void) | undefined;
  jest.mocked(native.processExternalDetectorFrame).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFrame = resolve;
      })
  );
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });
  const frame = detector.processFrame('AAAAAA==');
  const reset = detector.reset();
  const dispose = detector.dispose();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(native.resetExternalDetector).not.toHaveBeenCalled();
  expect(native.disposeExternalDetector).not.toHaveBeenCalled();

  resolveFrame!({ keyword: null });
  await Promise.all([frame, reset, dispose]);
  expect(native.resetExternalDetector).toHaveBeenCalledWith('detector-1');
  expect(native.disposeExternalDetector).toHaveBeenCalledTimes(1);
  await detector.dispose();
  await expect(detector.processFrame('AAAAAA==')).rejects.toThrow('disposed');
  expect(native.disposeExternalDetector).toHaveBeenCalledTimes(1);
});

it('keeps the queue usable after one native frame fails', async () => {
  jest
    .mocked(native.processExternalDetectorFrame)
    .mockRejectedValueOnce(new Error('invalid PCM'))
    .mockResolvedValueOnce({ keyword: null });
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });
  const failed = detector.processFrame('bad');
  const next = detector.processFrame('AAAAAA==');
  await expect(failed).rejects.toThrow('invalid PCM');
  await expect(next).resolves.toEqual({
    keyword: null,
  });
  expect(native.resetExternalDetector).toHaveBeenCalledTimes(1);
});

it('accepts float32 samples and rejects oversized frames', async () => {
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });
  await detector.processFrame(new Float32Array([0, 0.5, -0.5]));
  expect(native.processExternalDetectorFrame).toHaveBeenCalledWith(
    'detector-1',
    'AAAAAAAAAD8AAAC/',
    16000
  );
  await expect(detector.processFrame(new Float32Array(16001))).rejects.toThrow(
    '1 to 16000'
  );
});

it('bounds queued frames when the producer outruns inference', async () => {
  let resolveFrame: ((value: { keyword: null }) => void) | undefined;
  jest.mocked(native.processExternalDetectorFrame).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFrame = resolve;
      })
  );
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });
  const first = detector.processFrame(new Float32Array(1280));
  const second = detector.processFrame(new Float32Array(1280));
  await expect(detector.processFrame(new Float32Array(1280))).rejects.toThrow(
    'backpressure'
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveFrame!({ keyword: null });
  await Promise.all([first, second]);
  await detector.processFrame(new Float32Array(1280));
  expect(native.resetExternalDetector).toHaveBeenCalledTimes(1);
  expect(native.processExternalDetectorFrame).toHaveBeenCalledTimes(3);
});

it('snapshots a caller-owned frame before it can be reused', async () => {
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });
  const frame = new Float32Array([0.5]);
  const detection = detector.processFrame(frame);
  frame[0] = -0.5;
  await detection;
  expect(native.processExternalDetectorFrame).toHaveBeenCalledWith(
    'detector-1',
    'AAAAPw==',
    16000
  );
});

it('preserves a drop that happens after reset was queued', async () => {
  let resolveFrame: ((value: { keyword: null }) => void) | undefined;
  jest.mocked(native.processExternalDetectorFrame).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFrame = resolve;
      })
  );
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });
  const first = detector.processFrame(new Float32Array(1280));
  const explicitReset = detector.reset();
  const second = detector.processFrame(new Float32Array(1280));
  await expect(detector.processFrame(new Float32Array(1280))).rejects.toThrow(
    'backpressure'
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveFrame!({ keyword: null });
  await Promise.all([first, explicitReset, second]);
  await detector.processFrame(new Float32Array(1280));
  expect(native.resetExternalDetector).toHaveBeenCalledTimes(2);
});

it('retries a failed reset before processing a queued frame', async () => {
  jest
    .mocked(native.resetExternalDetector)
    .mockRejectedValueOnce(new Error('reset failed'))
    .mockResolvedValueOnce(undefined);
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });
  const reset = detector.reset();
  const frame = detector.processFrame(new Float32Array(1280));
  await expect(reset).rejects.toThrow('reset failed');
  await frame;
  expect(native.resetExternalDetector).toHaveBeenCalledTimes(2);
  expect(native.processExternalDetectorFrame).toHaveBeenCalledTimes(1);
});

it('retries a failed gap reset before the next queued frame', async () => {
  let resolveFirst: ((value: { keyword: null }) => void) | undefined;
  jest.mocked(native.processExternalDetectorFrame).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
  );
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });
  const first = detector.processFrame(new Float32Array(1280));
  const second = detector.processFrame(new Float32Array(1280));
  await expect(detector.processFrame(new Float32Array(1280))).rejects.toThrow(
    'backpressure'
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveFirst!({ keyword: null });
  await Promise.all([first, second]);

  jest
    .mocked(native.resetExternalDetector)
    .mockRejectedValueOnce(new Error('gap reset failed'))
    .mockResolvedValueOnce(undefined);
  const rejected = detector.processFrame(new Float32Array(1280));
  const recovered = detector.processFrame(new Float32Array(1280));
  await expect(rejected).rejects.toThrow('gap reset failed');
  await recovered;
  expect(native.resetExternalDetector).toHaveBeenCalledTimes(2);
  expect(native.processExternalDetectorFrame).toHaveBeenCalledTimes(3);
});

it('allows disposal to be retried after a native failure', async () => {
  jest
    .mocked(native.disposeExternalDetector)
    .mockRejectedValueOnce(new Error('native dispose failed'))
    .mockResolvedValueOnce(undefined);
  const detector = await createExternalAudioDetector({
    wakePhrase: 'hey acme',
  });
  await expect(detector.dispose()).rejects.toThrow('native dispose failed');
  await detector.dispose();
  expect(native.disposeExternalDetector).toHaveBeenCalledTimes(2);
});
