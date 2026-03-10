import { withInfoPlist } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

/**
 * Ensures UIBackgroundModes includes 'audio' in the iOS Info.plist.
 *
 * Idempotent: does not duplicate 'audio' if already present. Preserves
 * any existing background-mode entries added by the app or other plugins.
 */
export const withBackgroundModes: ConfigPlugin = (config) => {
  return withInfoPlist(config, (plistConfig) => {
    const modes: string[] =
      (plistConfig.modResults.UIBackgroundModes as string[] | undefined) ?? [];

    if (!modes.includes('audio')) {
      modes.push('audio');
    }

    plistConfig.modResults.UIBackgroundModes = modes;
    return plistConfig;
  });
};
