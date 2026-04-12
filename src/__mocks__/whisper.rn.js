// Stub for whisper.rn — replaced by jest.mock() factory in tests
module.exports = {
  initWhisper: () => Promise.resolve({}),
  releaseAllWhisper: () => Promise.resolve(),
};
