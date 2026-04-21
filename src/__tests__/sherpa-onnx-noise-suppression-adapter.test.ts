/**
 * sherpa-onnx-noise-suppression-adapter.test.ts
 *
 * Unit tests for SherpaOnnxNoiseSuppressionAdapter.
 *
 * Requirements: NOISE-02, NOISE-04, D-10
 */

jest.mock('../NativeVoiceActivator', () => ({
  __esModule: true,
  default: {
    denoiseAudio: jest.fn<Promise<string>, [string, number]>(
      async () => 'Y2xlYW5hdWRpbw==' // "cleanaudio" in base64
    ),
  },
}));

import { SherpaOnnxNoiseSuppressionAdapter } from '../providers/noise-suppression';

function getNativeMock() {
  return jest.requireMock('../NativeVoiceActivator').default as Record<
    string,
    jest.Mock
  >;
}

describe('SherpaOnnxNoiseSuppressionAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('process calls denoiseAudio with base64 PCM and sampleRate (NOISE-02)', async () => {
    const adapter = new SherpaOnnxNoiseSuppressionAdapter({
      modelPath: '/path/to/model.onnx',
    });
    const mock = getNativeMock();

    await adapter.process(new ArrayBuffer(16), 16000);

    expect(mock['denoiseAudio']).toHaveBeenCalledTimes(1);
    expect(mock['denoiseAudio']).toHaveBeenCalledWith(
      expect.any(String),
      16000
    );
    // Verify the first argument is a valid base64 string
    const [base64Arg] = mock['denoiseAudio']!.mock.calls[0]!;
    expect(typeof base64Arg).toBe('string');
    expect((base64Arg as string).length).toBeGreaterThan(0);
  });

  it('process returns non-empty ArrayBuffer (NOISE-02)', async () => {
    const adapter = new SherpaOnnxNoiseSuppressionAdapter({
      modelPath: '/path/to/model.onnx',
    });

    const result = await adapter.process(new ArrayBuffer(16), 16000);

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it('constructor stores modelPath (NOISE-04)', () => {
    const adapter = new SherpaOnnxNoiseSuppressionAdapter({
      modelPath: '/path/to/model.onnx',
    });

    expect(adapter.modelPath).toBe('/path/to/model.onnx');
  });

  it('process passes sampleRate at call time, not constructor (D-10)', async () => {
    const adapter = new SherpaOnnxNoiseSuppressionAdapter({
      modelPath: '/path/to/model.onnx',
    });
    const mock = getNativeMock();

    await adapter.process(new ArrayBuffer(16), 48000);

    expect(mock['denoiseAudio']).toHaveBeenCalledWith(expect.any(String), 48000);
  });
});
