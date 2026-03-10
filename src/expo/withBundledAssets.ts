import type { ConfigPlugin } from '@expo/config-plugins';

/**
 * Handles wake word asset expectations for Expo config/prebuild workflows.
 *
 * For v1, this is intentionally a no-op:
 * - default detection relies on Porcupine built-in keywords, so Expo does not
 *   need to copy additional keyword/model files at prebuild time
 * - custom file-based Porcupine assets are supported only when the app passes
 *   absolute paths or file:// URLs at runtime; the config plugin does not
 *   provision or rewrite those assets yet
 *
 * This plugin exists as an explicit extension point for future support of
 * Expo-managed asset provisioning once the package supports it end-to-end.
 */
export const withBundledAssets: ConfigPlugin = (config) => {
  // No-op for v1: the plugin does not mutate Expo config for wake word assets.
  return config;
};
