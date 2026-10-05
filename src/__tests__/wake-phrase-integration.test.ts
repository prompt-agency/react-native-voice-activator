/**
 * wake-phrase-integration.test.ts
 *
 * End to end for `initialize({ wakePhrase })`: the phrase becomes a
 * pre-tokenized keywords file next to the model bundle, and the native payload
 * carries its absolute path.
 *
 * Nothing tells the native side to tokenize anything any more. It used to, via
 * `keywordsAreRawText`, and that path called exit(-1) inside sherpa-onnx: the
 * app vanished with no crash report and nothing on the JS error path. The
 * absence of the flag is asserted rather than assumed, because reintroducing it
 * would fail silently in tests and fatally on a device.
 */

const mockWritten = new Map<string, string>();

jest.mock('@dr.pogodin/react-native-fs', () => ({
  LibraryDirectoryPath: '/Library',
  DocumentDirectoryPath: '/Documents',
  mkdir: jest.fn(async () => undefined),
  exists: jest.fn(async (p: string) => mockWritten.has(p)),
  readFile: jest.fn(async (p: string) => {
    const value = mockWritten.get(p);
    if (value === undefined) throw new Error(`ENOENT: ${p}`);
    return value;
  }),
  writeFile: jest.fn(async (p: string, contents: string) => {
    mockWritten.set(p, contents);
  }),
}));

import type { WakeWordDetectedEvent } from '../public/types';

const MODEL_DIR = '/Library/voice-activator/models/1';

/**
 * Where the model files actually sit inside the bundle, and therefore what
 * initialize() hands the native loader as modelAssetKey. The bundle root is
 * one level up; an absolute root is joined straight onto a file name by both
 * native loaders, so the root has to be this directory and not MODEL_DIR.
 */
const MODEL_ASSET_ROOT = `${MODEL_DIR}/SherpaOnnxKws/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01`;

describe('initialize({ wakePhrase })', () => {
  function setupMocks() {
    const runtimeBridge = {
      initialize: jest.fn().mockResolvedValue(undefined),
      startDetection: jest.fn().mockResolvedValue(undefined),
      stopDetection: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({
        state: 'ready',
        isAvailable: true,
        isListening: false,
        canStart: true,
        lastError: null,
      }),
    };

    jest.doMock('../internal/native-module', () => ({
      getVoiceActivatorRuntimeBridge: jest.fn(() => runtimeBridge),
      setWakeWordDetectedHandler: jest.fn(
        (_h: (p: WakeWordDetectedEvent) => void) => undefined
      ),
      setRuntimeStatusHandler: jest.fn(),
      setRuntimeErrorHandler: jest.fn(),
      setRuntimeInterruptionHandler: jest.fn(),
      setRuntimeAudioRouteChangedHandler: jest.fn(),
    }));

    jest.doMock('../engines', () => ({
      createNativeManagedEngineRuntime: jest.fn(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    jest.doMock('../internal/session-events', () => ({
      addSessionListener: jest.fn(() => ({ remove: jest.fn() })),
      emitSessionEvent: jest.fn(),
    }));

    jest.doMock('../internal/model-store', () => {
      const actual = jest.requireActual('../internal/model-store');
      return {
        ...actual,
        getModelBundleStatus: jest.fn(async () => ({
          ready: true,
          directory: MODEL_DIR,
          bundleVersion: actual.modelBundleManifest.bundleVersion,
          missing: [],
          bytesTotal: actual.modelBundleManifest.totalBytes,
        })),
      };
    });

    return runtimeBridge;
  }

  beforeEach(() => {
    jest.resetModules();
    mockWritten.clear();
    setupMocks();
  });

  it('writes a pre-tokenized keywords file and points the engine at it', async () => {
    const bridge = setupMocks();
    const { initialize } = await import('../public/voice-activator');

    await initialize({ wakePhrase: 'hey acme' });

    const [written] = [...mockWritten.entries()];
    expect(written).toBeDefined();
    const [path, contents] = written!;

    // Pre-tokenized vocabulary pieces, like the bundled presets.
    expect(contents).toBe('\u2581HE Y \u2581A C ME\n');
    expect(contents).toContain('\u2581');
    expect(path.startsWith(`${MODEL_ASSET_ROOT}/generated-keywords/`)).toBe(
      true
    );

    const payload = bridge.initialize.mock.calls[0]![0] as {
      engineConfig?: Record<string, unknown>;
    };
    expect(payload.engineConfig).not.toHaveProperty('keywordsAreRawText');

    expect(bridge.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        engineConfig: expect.objectContaining({
          assetKeys: expect.objectContaining({
            modelAssetKey: MODEL_ASSET_ROOT,
            keywordAssetKey: path,
          }),
        }),
      })
    );
  });

  it('never sends a raw-text flag, for a preset or a generated phrase', async () => {
    const bridge = setupMocks();
    const { initialize, dispose } = await import('../public/voice-activator');

    await initialize({
      engineConfig: {
        assetKeys: { keywordAssetKey: 'keywords-hello-world.txt' },
      },
    });
    await dispose();
    await initialize({ wakePhrase: 'hey acme' });

    for (const call of bridge.initialize.mock.calls) {
      const payload = call[0] as { engineConfig?: Record<string, unknown> };
      expect(payload.engineConfig ?? {}).not.toHaveProperty(
        'keywordsAreRawText'
      );
    }
  });

  it('supports several phrases in one file', async () => {
    const { initialize } = await import('../public/voice-activator');

    await initialize({ wakePhrase: ['hey acme', 'ok acme'] });

    const [, contents] = [...mockWritten.entries()][0]!;
    expect(contents).toBe('\u2581HE Y \u2581A C ME\n\u2581O K \u2581A C ME\n');
  });

  it('reuses the file across initialize() calls with the same phrase', async () => {
    const { initialize, dispose } = await import('../public/voice-activator');
    const rnfs = jest.requireMock('@dr.pogodin/react-native-fs') as {
      writeFile: jest.Mock;
    };

    await initialize({ wakePhrase: 'hey acme' });
    await dispose();
    await initialize({ wakePhrase: 'hey acme' });

    // Written once; the second call found matching contents already on disk.
    expect(rnfs.writeFile).toHaveBeenCalledTimes(1);
    expect(mockWritten.size).toBe(1);
  });

  it('writes a different file when the phrase changes', async () => {
    const { initialize, dispose } = await import('../public/voice-activator');

    await initialize({ wakePhrase: 'hey acme' });
    await dispose();
    await initialize({ wakePhrase: 'ok acme' });

    expect(mockWritten.size).toBe(2);
  });

  it('rejects an invalid phrase before touching the native runtime', async () => {
    const bridge = setupMocks();
    const { initialize, getStatus } = await import('../public/voice-activator');

    await expect(initialize({ wakePhrase: 'go' })).rejects.toThrow(
      /shorter than/
    );

    expect(bridge.initialize).not.toHaveBeenCalled();
    const lastError = getStatus().lastError;
    expect(lastError?.code).toBe('wake_phrase_invalid');
    expect(lastError?.category).toBe('configuration');
    expect(lastError?.recoverable).toBe(false);
  });

  it('rejects wakePhrase combined with an explicit keywordAssetKey', async () => {
    const { initialize, getStatus } = await import('../public/voice-activator');

    await expect(
      initialize({
        wakePhrase: 'hey acme',
        engineConfig: { assetKeys: { keywordAssetKey: 'keywords-alexa.txt' } },
      })
    ).rejects.toThrow(/not\s+both/);

    expect(getStatus().lastError?.code).toBe('wake_phrase_conflict');
  });

  it('rejects a model bundle whose vocabulary cannot represent the phrase', async () => {
    const bridge = setupMocks();
    const { initialize, getStatus } = await import('../public/voice-activator');
    const vocabulary = require('../internal/keyword-vocab.generated.json') as {
      pieces: Array<[string, number]>;
    };

    // A tokens.txt built from the real vocabulary minus one piece "HEY ACME"
    // needs: what a fine-tuned or replacement keyword-spotter bundle looks like
    // from here. Writing the generated tokens anyway would reach sherpa-onnx's
    // EncodeBase, which calls exit(-1) and kills the app. That is issue #31.
    mockWritten.set(
      `${MODEL_ASSET_ROOT}/tokens.txt`,
      vocabulary.pieces
        .map(([piece], index) =>
          piece === '\u2581HE' ? null : `${piece} ${index}`
        )
        .filter((line): line is string => line !== null)
        .join('\n')
    );

    await expect(initialize({ wakePhrase: 'hey acme' })).rejects.toThrow(
      /different vocabulary/
    );

    const lastError = getStatus().lastError;
    expect(lastError?.code).toBe('wake_phrase_model_incompatible');
    expect(lastError?.category).toBe('configuration');
    expect(lastError?.recoverable).toBe(false);
    expect(bridge.initialize).not.toHaveBeenCalled();
    // Only the fixture, so no keywords file was written.
    expect([...mockWritten.keys()]).toEqual([`${MODEL_ASSET_ROOT}/tokens.txt`]);
  });

  it('rejects wakePhrase with an app-bundled model root', async () => {
    const { initialize, getStatus } = await import('../public/voice-activator');

    await expect(
      initialize({
        wakePhrase: 'hey acme',
        engineConfig: { assetKeys: { modelAssetKey: 'my-bundled-models' } },
      })
    ).rejects.toThrow(/requires the on-demand model bundle/);

    expect(getStatus().lastError?.code).toBe('wake_phrase_unsupported_root');
  });
});

describe('evaluating a generated keywords file', () => {
  it('sends no raw-text flag to the native evaluator', async () => {
    jest.resetModules();
    const evaluateWavFile = jest.fn(async (_options: unknown) => ({
      detections: [],
      durationMs: 1000,
      sampleRate: 16000,
    }));

    // wake-word-evaluation.ts imports the codegen spec directly as a default
    // export, not through internal/native-module. Mock the module it actually
    // imports, in the __esModule shape the other native tests use.
    jest.doMock('../NativeVoiceActivator', () => ({
      __esModule: true,
      default: { evaluateWavFile },
    }));

    const { evaluateWakeWordCorpus } =
      await import('../internal/wake-word-evaluation');

    await evaluateWakeWordCorpus({
      positives: ['/audio/positive.wav'],
      negatives: [],
      keywordsPath: '/models/generated-keywords/hey-acme-8b30f51d.txt',
    });

    expect(evaluateWavFile).toHaveBeenCalledTimes(1);
    // The flag was what made sherpa-onnx tokenize, and tokenizing a
    // pre-tokenized file matches nothing. It must not come back.
    expect(evaluateWavFile.mock.calls[0]![0]).not.toHaveProperty(
      'keywordsAreRawText'
    );
  });
});
