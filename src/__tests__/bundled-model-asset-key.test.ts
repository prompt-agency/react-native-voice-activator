/**
 * BUNDLED_MODEL_ASSET_KEY names a directory that only the native asset loaders
 * can actually resolve, and `modelAssetKey` is used verbatim, so a value that
 * drifts from either loader's default root does not fall back to anything. It
 * fails at initialize() on a device.
 *
 * These tests read the constants out of the native sources rather than
 * restating them, so renaming the model directory on one platform and not the
 * other fails here rather than on a phone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BUNDLED_MODEL_ASSET_KEYS_BY_PLATFORM } from '../internal/bundled-model-asset-key';

const repoRoot = join(__dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('BUNDLED_MODEL_ASSET_KEY matches the native loaders', () => {
  it('matches the iOS loader kAssetRoot', () => {
    const source = read('ios/Engines/SherpaOnnx/SherpaOnnxAssetLoader.mm');
    // NSString *const kAssetRoot =
    //     @"SherpaOnnxKws/sherpa-onnx-kws-...";
    const match = source.match(/kAssetRoot\s*=\s*@"([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(BUNDLED_MODEL_ASSET_KEYS_BY_PLATFORM.ios);
  });

  it('matches the Android loader DEFAULT_MODEL_ROOT', () => {
    const source = read(
      'android/src/main/java/com/voiceactivator/Engines/SherpaOnnx/SherpaOnnxAssetLoader.kt'
    );
    // The Kotlin constant is written as two concatenated string literals.
    const declaration = source.match(
      /DEFAULT_MODEL_ROOT\s*=\s*((?:\s*"[^"]*"\s*\+?)+)/
    );
    expect(declaration).not.toBeNull();
    const joined = Array.from(declaration![1]!.matchAll(/"([^"]*)"/g))
      .map((literal) => literal[1])
      .join('');
    expect(joined).toBe(BUNDLED_MODEL_ASSET_KEYS_BY_PLATFORM.android);
  });

  it('is platform specific, because the two roots genuinely differ', () => {
    // If these two were ever equal, every consumer could hardcode one string
    // and the platform branch in BUNDLED_MODEL_ASSET_KEY would be dead weight.
    // They are not equal, which is exactly why the constant is exported.
    expect(BUNDLED_MODEL_ASSET_KEYS_BY_PLATFORM.ios).not.toBe(
      BUNDLED_MODEL_ASSET_KEYS_BY_PLATFORM.android
    );
  });

  it('resolves to the running platform at import time', () => {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
      const {
        BUNDLED_MODEL_ASSET_KEY,
      } = require('../internal/bundled-model-asset-key');
      expect(BUNDLED_MODEL_ASSET_KEY).toBe(
        BUNDLED_MODEL_ASSET_KEYS_BY_PLATFORM.android
      );
    });

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
      const {
        BUNDLED_MODEL_ASSET_KEY,
      } = require('../internal/bundled-model-asset-key');
      expect(BUNDLED_MODEL_ASSET_KEY).toBe(
        BUNDLED_MODEL_ASSET_KEYS_BY_PLATFORM.ios
      );
    });
  });

  it('is the value the getting-started guide tells people to use', () => {
    // The guide is where most people will copy this from, so a drift between
    // the doc and the export reaches users as a broken first run.
    const guide = read('docs/getting-started.md');
    expect(guide).toContain('BUNDLED_MODEL_ASSET_KEY');
    // The guide must not restate the roots; that is what created the fourth
    // copy this constant exists to remove.
    expect(guide).not.toContain('voice-activator-sherpa-onnx/sherpa-onnx-kws');
  });
});
