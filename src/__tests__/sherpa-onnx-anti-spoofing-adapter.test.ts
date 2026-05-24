/**
 * sherpa-onnx-anti-spoofing-adapter.test.ts
 *
 * Unit tests for SherpaOnnxAntiSpoofingAdapter.
 *
 * Requirements: SPOOF-02
 */

jest.mock('../NativeVoiceActivator', () => ({
  __esModule: true,
  default: {
    detectSpoofing: jest.fn<Promise<number>, [string, number]>(async () => 0.0),
  },
}));

import { SherpaOnnxAntiSpoofingAdapter } from '../providers/anti-spoofing';

function getNativeMock() {
  return jest.requireMock('../NativeVoiceActivator').default as Record<
    string,
    jest.Mock
  >;
}

describe('SherpaOnnxAntiSpoofingAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detectSpoofing calls bridge detectSpoofing with base64 PCM (SPOOF-02)', async () => {
    const adapter = new SherpaOnnxAntiSpoofingAdapter();
    const mock = getNativeMock();

    await adapter.detectSpoofing(new ArrayBuffer(16), 16000);

    expect(mock.detectSpoofing).toHaveBeenCalledTimes(1);
    expect(mock.detectSpoofing).toHaveBeenCalledWith(expect.any(String), 16000);
    // Verify the first argument is a valid base64 string
    const [base64Arg] = mock.detectSpoofing!.mock.calls[0]!;
    expect(typeof base64Arg).toBe('string');
    expect((base64Arg as string).length).toBeGreaterThan(0);
  });

  it('detectSpoofing returns number 0-1 (SPOOF-02)', async () => {
    const adapter = new SherpaOnnxAntiSpoofingAdapter();

    const result = await adapter.detectSpoofing(new ArrayBuffer(16), 16000);

    expect(typeof result).toBe('number');
    expect(result).toBe(0.0);
  });

  it('detectSpoofing does not throw on stub 0.0 result', async () => {
    const adapter = new SherpaOnnxAntiSpoofingAdapter();

    await expect(
      adapter.detectSpoofing(new ArrayBuffer(16), 16000)
    ).resolves.not.toThrow();
  });

  it('detectSpoofing passes through non-zero scores', async () => {
    const adapter = new SherpaOnnxAntiSpoofingAdapter();
    const mock = getNativeMock();
    mock.detectSpoofing?.mockResolvedValueOnce(0.75);

    const result = await adapter.detectSpoofing(new ArrayBuffer(16), 16000);

    expect(result).toBe(0.75);
  });
});
