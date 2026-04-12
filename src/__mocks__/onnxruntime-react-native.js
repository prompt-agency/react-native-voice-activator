// Jest manual mock for onnxruntime-react-native
// Usage: automatic via moduleNameMapper in package.json

const mockSession = {
  run: jest.fn().mockResolvedValue({
    output: { data: new Float32Array(22050) }, // 1 second of silence at 22050 Hz
  }),
  release: jest.fn().mockResolvedValue(undefined),
  inputNames: ['input', 'input_lengths', 'scales'],
  outputNames: ['output'],
};

const InferenceSession = {
  create: jest.fn().mockResolvedValue(mockSession),
};

const Tensor = jest.fn((type, data, dims) => ({ type, data, dims }));

module.exports = {
  __esModule: true,
  InferenceSession,
  Tensor,
};
