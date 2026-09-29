import { Platform } from 'react-native';

/**
 * Directory name of the default keyword-spotting model bundle, as published
 * upstream. Shared by both platforms' asset roots.
 */
const SHERPA_KWS_MODEL_DIR =
  'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01';

/**
 * Asset root of the model bundle the Expo config plugin copies into your app,
 * for apps that ship the models rather than downloading them at runtime.
 *
 * Pass it as `engineConfig.assetKeys.modelAssetKey` to skip `prepareModels()`
 * entirely:
 *
 * ```ts
 * import { initialize, BUNDLED_MODEL_ASSET_KEY } from 'react-native-voice-activator';
 *
 * await initialize({
 *   engineConfig: { assetKeys: { modelAssetKey: BUNDLED_MODEL_ASSET_KEY } },
 * });
 * ```
 *
 * The value is PLATFORM SPECIFIC, which is the reason it is exported rather
 * than left for each app to write out. `modelAssetKey` is used verbatim: each
 * native loader falls back to its own default root only when the key is absent
 * entirely, never when it is present but wrong. The two roots are
 *
 *   Android: an AssetManager key under the library's asset namespace, matching
 *            `SherpaOnnxAssetLoader.DEFAULT_MODEL_ROOT`
 *   iOS:     a bundle-relative path, matching `SherpaOnnxAssetLoader`'s
 *            `kAssetRoot`
 *
 * and a single hardcoded string cannot be right for both. Getting it wrong
 * fails on Android with "Missing bundled Sherpa-ONNX asset for encoder in model
 * root". iOS happens to tolerate a wrong root today, because the podspec also
 * copies these files flat into the bundle and the loader then finds them by
 * filename, so this is a mistake that passes an iOS device test and fails on
 * Android.
 *
 * These strings are kept in step with the two native loaders by
 * `src/__tests__/bundled-model-asset-key.test.ts`, which reads the constants
 * out of the native sources.
 */
export const BUNDLED_MODEL_ASSET_KEY: string =
  Platform.OS === 'android'
    ? `voice-activator-sherpa-onnx/${SHERPA_KWS_MODEL_DIR}`
    : `SherpaOnnxKws/${SHERPA_KWS_MODEL_DIR}`;

/**
 * Both platforms' roots, regardless of which platform is running. Exported for
 * the contract test; apps want {@link BUNDLED_MODEL_ASSET_KEY}.
 *
 * @internal
 */
export const BUNDLED_MODEL_ASSET_KEYS_BY_PLATFORM = {
  android: `voice-activator-sherpa-onnx/${SHERPA_KWS_MODEL_DIR}`,
  ios: `SherpaOnnxKws/${SHERPA_KWS_MODEL_DIR}`,
} as const;
