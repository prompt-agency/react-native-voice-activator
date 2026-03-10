import { withInfoPlist } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

import type { VoiceActivatorPluginProps } from './config-plugin';

const DEFAULT_MICROPHONE_PERMISSION_TEXT =
  'This app uses the microphone to detect wake words.';

/**
 * Adds NSMicrophoneUsageDescription to the iOS Info.plist.
 *
 * Non-destructive: does not overwrite an existing value set by the app.
 */
export const withMicrophonePermissions: ConfigPlugin<
  Pick<VoiceActivatorPluginProps, 'microphonePermissionText'>
> = (config, props) => {
  const text =
    props.microphonePermissionText ?? DEFAULT_MICROPHONE_PERMISSION_TEXT;

  return withInfoPlist(config, (plistConfig) => {
    if (!plistConfig.modResults.NSMicrophoneUsageDescription) {
      plistConfig.modResults.NSMicrophoneUsageDescription = text;
    }
    return plistConfig;
  });
};
