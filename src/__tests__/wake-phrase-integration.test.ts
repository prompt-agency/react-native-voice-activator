/**
 * wake-phrase-integration.test.ts
 *
 * End to end for `initialize({ wakePhrase })`: the phrase becomes a plain-text
 * keywords file next to the model bundle, and the native payload carries both
 * its absolute path and the flag that tells sherpa-onnx to tokenize the text via
 * bpe.model rather than expecting pre-tokenized BPE output.
 *
 * Getting that flag wrong is silent: a pre-tokenized file run through the
 * tokenizer, or plain text passed without it, produces a keyword that simply
 * never matches. So the flag is asserted explicitly, both ways round.
 */

const mockWritten = new Map<string, string>();

jest.mock('@dr.pogodin/react-native-fs', () => ({
  LibraryDirectoryPath: '/Library',
  DocumentDirectoryPath: '/Documents',
  mkdir: jest.fn(async () => undefined),
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

  it('writes a plain-text keywords file and points the engine at it', async () => {
    const bridge = setupMocks();
    const { initialize } = await import('../public/voice-activator');

    await initialize({ wakePhrase: 'hey acme' });

    const [written] = [...mockWritten.entries()];
    expect(written).toBeDefined();
    const [path, contents] = written!;

    // Plain text, uppercased, one phrase per line — not pre-tokenized.
    expect(contents).toBe('HEY ACME\n');
    expect(contents).not.toContain('▁');
    // Beside the model files, so clearing app storage clears both. This
    // follows modelAssetKey rather than the bundle root: the keywords file is
    // documented as living next to the model root, and there is only one
    // notion of that root.
    expect(path.startsWith(`${MODEL_ASSET_ROOT}/generated-keywords/`)).toBe(
      true
    );

    expect(bridge.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        engineConfig: expect.objectContaining({
          keywordsAreRawText: true,
          assetKeys: expect.objectContaining({
            modelAssetKey: MODEL_ASSET_ROOT,
            keywordAssetKey: path,
          }),
        }),
      })
    );
  });

  it('does not set the raw-text flag for a bundled preset', async () => {
    const bridge = setupMocks();
    const { initialize } = await import('../public/voice-activator');

    await initialize({
      engineConfig: {
        assetKeys: { keywordAssetKey: 'keywords-hello-world.txt' },
      },
    });

    const payload = bridge.initialize.mock.calls[0]![0] as {
      engineConfig?: { keywordsAreRawText?: boolean };
    };
    // The bundled presets are already tokenized; running them through the
    // tokenizer would produce a keyword that never matches.
    expect(payload.engineConfig?.keywordsAreRawText).toBeUndefined();
    expect(mockWritten.size).toBe(0);
  });

  it('supports several phrases in one file', async () => {
    const { initialize } = await import('../public/voice-activator');

    await initialize({ wakePhrase: ['hey acme', 'ok acme'] });

    const [, contents] = [...mockWritten.entries()][0]!;
    expect(contents).toBe('HEY ACME\nOK ACME\n');
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
