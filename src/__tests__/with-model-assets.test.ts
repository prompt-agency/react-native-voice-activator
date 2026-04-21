/**
 * with-model-assets.test.ts
 *
 * Unit tests for the withModelAssets Expo config plugin.
 *
 * Tests verify:
 *   - Correct iOS copy destination: platformProjectRoot/appName/subdir/filename
 *   - Correct Android copy destination: platformProjectRoot/app/src/main/assets/voice-activator-sherpa-onnx/filename
 *   - Xcode project registration via addResourceFile
 *   - Hard-fail (throws) when a configured path does not exist
 *   - No copy when fields are undefined (independently optional)
 *   - Absolute paths used as-is without re-joining against projectRoot
 *   - Both models copied when both fields are set
 *
 * Requirements: PLUGIN-02
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mock node:fs
// ---------------------------------------------------------------------------
jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  copyFileSync: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @expo/config-plugins — captures and synchronously invokes callbacks,
// awaiting async ones via Promise.resolve() to flush microtasks.
// ---------------------------------------------------------------------------
const mockAddResourceFile = jest.fn();
const mockGetFirstTarget = jest.fn(() => ({ uuid: 'target-uuid' }));

// Stores settled results from withDangerousMod callbacks so tests can inspect them
interface CallbackResult {
  error?: unknown;
  settled: Promise<void>;
}
const _callbackResults: CallbackResult[] = [];

jest.mock('@expo/config-plugins', () => ({
  withDangerousMod: jest.fn(
    (
      cfg: unknown,
      [platform, callback]: [string, (mod: unknown) => Promise<unknown>]
    ) => {
      const platformProjectRoot =
        platform === 'ios' ? '/project/ios' : '/project/android';
      const modConfig = {
        modRequest: {
          projectRoot: '/project',
          platformProjectRoot,
          projectName: 'MyApp',
        },
      };
      const result: CallbackResult = { settled: Promise.resolve() };
      // Attach .catch immediately to prevent unhandled rejection warnings
      result.settled = callback(modConfig).then(
        () => undefined,
        (err: unknown) => {
          result.error = err;
        }
      );
      _callbackResults.push(result);
      return cfg;
    }
  ),
  withXcodeProject: jest.fn(
    (cfg: unknown, callback: (mod: unknown) => unknown) => {
      const modConfig = {
        modRequest: { projectName: 'MyApp' },
        modResults: {
          addResourceFile: mockAddResourceFile,
          getFirstTarget: mockGetFirstTarget,
        },
      };
      callback(modConfig);
      return cfg;
    }
  ),
}));

// eslint-disable-next-line import/first -- must come after jest.mock calls
import { withModelAssets } from '../expo/withModelAssets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const config = { name: 'MyApp' } as any;

/** Flush all pending microtasks — lets async callbacks resolve/reject */
async function flushPromises(): Promise<void> {
  await Promise.all(_callbackResults.map((r) => r.settled));
}

/** Flush all pending callbacks and return any rejection errors */
async function flushCallbackErrors(): Promise<unknown[]> {
  await flushPromises();
  return _callbackResults
    .filter((r) => r.error !== undefined)
    .map((r) => r.error);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('withModelAssets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _callbackResults.length = 0;
    (existsSync as jest.Mock).mockReturnValue(true);
  });

  // -----------------------------------------------------------------------
  // iOS — speaker model
  // -----------------------------------------------------------------------
  it('copies speaker model to correct iOS destination', async () => {
    withModelAssets(config, { speakerModelPath: './models/campplus.onnx' });
    await flushPromises();

    const calls = (copyFileSync as jest.Mock).mock.calls as [string, string][];
    const iosCalls = calls.filter(([, dest]) => dest.includes('/ios/'));

    expect(iosCalls.length).toBeGreaterThanOrEqual(1);
    const [src, dest] = iosCalls[0]!;
    expect(src).toBe(path.resolve('/project', './models/campplus.onnx'));
    expect(dest).toBe('/project/ios/MyApp/SherpaOnnxSpeaker/campplus.onnx');
  });

  it('creates iOS destination directory with recursive option for speaker model', async () => {
    withModelAssets(config, { speakerModelPath: './models/campplus.onnx' });
    await flushPromises();

    const mkdirCalls = (mkdirSync as jest.Mock).mock.calls as [
      string,
      { recursive: boolean },
    ][];
    const iosMkdirCalls = mkdirCalls.filter(([dir]) => dir.includes('/ios/'));

    expect(iosMkdirCalls.length).toBeGreaterThanOrEqual(1);
    expect(iosMkdirCalls[0]![0]).toBe('/project/ios/MyApp/SherpaOnnxSpeaker');
    expect(iosMkdirCalls[0]![1]).toEqual({ recursive: true });
  });

  // -----------------------------------------------------------------------
  // iOS — denoiser model
  // -----------------------------------------------------------------------
  it('copies denoiser model to correct iOS destination', async () => {
    withModelAssets(config, { denoiserModelPath: './models/gtcrn.onnx' });
    await flushPromises();

    const calls = (copyFileSync as jest.Mock).mock.calls as [string, string][];
    const iosCalls = calls.filter(([, dest]) => dest.includes('/ios/'));

    expect(iosCalls.length).toBeGreaterThanOrEqual(1);
    const [src, dest] = iosCalls[0]!;
    expect(src).toBe(path.resolve('/project', './models/gtcrn.onnx'));
    expect(dest).toBe('/project/ios/MyApp/SherpaOnnxDenoiser/gtcrn.onnx');
  });

  // -----------------------------------------------------------------------
  // Android
  // -----------------------------------------------------------------------
  it('copies model to correct Android destination', async () => {
    withModelAssets(config, { speakerModelPath: './models/campplus.onnx' });
    await flushPromises();

    const calls = (copyFileSync as jest.Mock).mock.calls as [string, string][];
    const androidCalls = calls.filter(([, dest]) =>
      dest.includes('/android/')
    );

    expect(androidCalls.length).toBeGreaterThanOrEqual(1);
    const [, dest] = androidCalls[0]!;
    expect(dest).toBe(
      '/project/android/app/src/main/assets/voice-activator-sherpa-onnx/campplus.onnx'
    );
  });

  // -----------------------------------------------------------------------
  // Xcode project registration
  // -----------------------------------------------------------------------
  it('registers iOS file in Xcode project via addResourceFile', () => {
    withModelAssets(config, { speakerModelPath: './models/campplus.onnx' });

    expect(mockAddResourceFile).toHaveBeenCalledWith(
      'MyApp/SherpaOnnxSpeaker/campplus.onnx',
      { target: 'target-uuid' }
    );
  });

  it('passes getFirstTarget uuid to addResourceFile', () => {
    withModelAssets(config, { denoiserModelPath: './models/gtcrn.onnx' });

    expect(mockGetFirstTarget).toHaveBeenCalled();
    expect(mockAddResourceFile).toHaveBeenCalledWith(
      'MyApp/SherpaOnnxDenoiser/gtcrn.onnx',
      { target: 'target-uuid' }
    );
  });

  // -----------------------------------------------------------------------
  // Missing file — hard fail
  // -----------------------------------------------------------------------
  it('throws with descriptive error containing field name when path does not exist', async () => {
    (existsSync as jest.Mock).mockReturnValue(false);

    withModelAssets(config, { speakerModelPath: './missing/model.onnx' });

    const errors = await flushCallbackErrors();
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(String(errors[0])).toMatch(/speakerModelPath/);
  });

  it('throws with "does not exist" when configured path is missing', async () => {
    (existsSync as jest.Mock).mockReturnValue(false);

    withModelAssets(config, { speakerModelPath: './missing/model.onnx' });

    const errors = await flushCallbackErrors();
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(String(errors[0])).toMatch(/does not exist/);
  });

  it('includes the resolved absolute path in the error message', async () => {
    (existsSync as jest.Mock).mockReturnValue(false);

    withModelAssets(config, { speakerModelPath: './missing/model.onnx' });

    const errors = await flushCallbackErrors();
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(String(errors[0])).toContain(
      path.resolve('/project', './missing/model.onnx')
    );
  });

  // -----------------------------------------------------------------------
  // Independently optional fields — no copy when undefined
  // -----------------------------------------------------------------------
  it('skips copy when both fields are undefined', async () => {
    withModelAssets(config, {});
    await flushPromises();

    expect(copyFileSync).not.toHaveBeenCalled();
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('skips addResourceFile when fields are undefined', () => {
    withModelAssets(config, {});

    expect(mockAddResourceFile).not.toHaveBeenCalled();
  });

  it('copies only denoiser when speakerModelPath is omitted', async () => {
    withModelAssets(config, { denoiserModelPath: './models/gtcrn.onnx' });
    await flushPromises();

    const calls = (copyFileSync as jest.Mock).mock.calls as [string, string][];
    // No call should touch SherpaOnnxSpeaker paths
    const speakerCalls = calls.filter(([, dest]) =>
      dest.includes('SherpaOnnxSpeaker')
    );
    expect(speakerCalls).toHaveLength(0);

    // Denoiser calls exist for iOS
    const iosDenoiserCalls = calls.filter(([, dest]) =>
      dest.includes('SherpaOnnxDenoiser')
    );
    expect(iosDenoiserCalls.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Absolute paths
  // -----------------------------------------------------------------------
  it('uses absolute path as-is without joining against projectRoot', async () => {
    withModelAssets(config, {
      speakerModelPath: '/absolute/path/model.onnx',
    });
    await flushPromises();

    const calls = (copyFileSync as jest.Mock).mock.calls as [string, string][];
    const matchingCalls = calls.filter(
      ([src]) => src === '/absolute/path/model.onnx'
    );
    expect(matchingCalls.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Both models at once
  // -----------------------------------------------------------------------
  it('copies both models when both fields are set', async () => {
    withModelAssets(config, {
      speakerModelPath: './models/campplus.onnx',
      denoiserModelPath: './models/gtcrn.onnx',
    });
    await flushPromises();

    // 2 iOS copies + 2 Android copies = 4 total
    expect(copyFileSync).toHaveBeenCalledTimes(4);
  });

  it('registers both models in Xcode project when both fields are set', () => {
    withModelAssets(config, {
      speakerModelPath: './models/campplus.onnx',
      denoiserModelPath: './models/gtcrn.onnx',
    });

    expect(mockAddResourceFile).toHaveBeenCalledTimes(2);
    expect(mockAddResourceFile).toHaveBeenCalledWith(
      'MyApp/SherpaOnnxSpeaker/campplus.onnx',
      { target: 'target-uuid' }
    );
    expect(mockAddResourceFile).toHaveBeenCalledWith(
      'MyApp/SherpaOnnxDenoiser/gtcrn.onnx',
      { target: 'target-uuid' }
    );
  });
});
