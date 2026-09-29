/**
 * Default the on-demand model bundle to "ready" for every test.
 *
 * initialize() refuses to start when the model bundle is absent, which is the
 * intended production behaviour but is incidental to almost every test in this
 * suite: they exercise the runtime state machine, the orchestration queue, the
 * hooks and so on, none of which care where the models came from.
 *
 * Tests that need the real store call:
 *   jest.unmock('../internal/model-store');
 * Tests that need the absent-models path mock getModelBundleStatus themselves.
 */

jest.mock('./src/internal/model-store', () => {
  const actual = jest.requireActual('./src/internal/model-store');

  return {
    ...actual,
    getModelBundleStatus: jest.fn(async () => ({
      ready: true,
      directory: '/mock/voice-activator/models',
      bundleVersion: actual.modelBundleManifest.bundleVersion,
      missing: [],
      bytesTotal: actual.modelBundleManifest.totalBytes,
    })),
    prepareModelBundle: jest.fn(async () => ({
      directory: '/mock/voice-activator/models',
      downloaded: [],
      verified: actual.modelBundleManifest.files.map((f) => f.path),
    })),
    clearModelBundle: jest.fn(async () => undefined),
  };
});
