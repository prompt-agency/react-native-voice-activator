/**
 * Expo config plugin for react-native-voice-activator.
 *
 * Applies all required native configuration changes for wake word detection
 * in Expo config/prebuild workflows:
 *   - iOS: NSMicrophoneUsageDescription, UIBackgroundModes: audio
 *   - Android: RECORD_AUDIO / FOREGROUND_SERVICE* / POST_NOTIFICATIONS
 *     permissions plus WakeWordForegroundService declaration
 *
 * ⚠️  Expo Go is NOT supported. Generate native projects with Expo prebuild
 *     or run the Expo-generated native app directly.
 *     See docs/expo-setup.md for integration guidance.
 */

import { createRunOncePlugin } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

import { withAndroidForegroundService } from './withAndroidForegroundService';
import { withBackgroundModes } from './withBackgroundModes';
import { withBundledAssets } from './withBundledAssets';
import { withMicrophonePermissions } from './withMicrophonePermissions';
import { withModelAssets } from './withModelAssets';

// Re-exported so dependent with* modules can reference the type without
// creating a circular dependency through config-plugin.ts.
export interface VoiceActivatorPluginProps {
  /**
   * iOS microphone usage description shown in the permission dialog.
   *
   * @default "This app uses the microphone to detect wake words."
   */
  microphonePermissionText?: string;
  /** Relative (to app root) or absolute path to speaker embedding model (e.g. campplus.onnx) */
  speakerModelPath?: string;
  /** Relative (to app root) or absolute path to speech denoiser model (e.g. gtcrn_simple.onnx) */
  denoiserModelPath?: string;
}

const withVoiceActivator: ConfigPlugin<VoiceActivatorPluginProps | void> = (
  config,
  props
) => {
  const resolvedProps: VoiceActivatorPluginProps = props ?? {};

  config = withMicrophonePermissions(config, resolvedProps);
  config = withBackgroundModes(config);
  config = withAndroidForegroundService(config);
  config = withBundledAssets(config);
  config = withModelAssets(config, resolvedProps);

  return config;
};

export default createRunOncePlugin(
  withVoiceActivator,
  'react-native-voice-activator',
  '0.1.0'
);
