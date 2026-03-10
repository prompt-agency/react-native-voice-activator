import { withAndroidManifest } from '@expo/config-plugins';
import type { AndroidManifest, ConfigPlugin } from '@expo/config-plugins';

/** Fully qualified service class name used in the consuming app manifest. */
const WAKE_WORD_SERVICE_CLASS =
  'com.voiceactivator.Runtime.WakeWordForegroundService';

const REQUIRED_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.POST_NOTIFICATIONS',
] as const;

const REQUIRED_SERVICE_ATTRIBUTES = {
  'android:name': WAKE_WORD_SERVICE_CLASS,
  'android:enabled': 'true',
  'android:exported': 'false',
  'android:foregroundServiceType': 'microphone',
} as const;

/**
 * Ensures the required Android manifest entries for wake word detection are
 * present in the consuming Expo app's AndroidManifest.xml.
 *
 * Idempotent: all mutations check for existence before inserting.
 *
 * Note: The library's own android/src/main/AndroidManifest.xml already
 * declares these entries; Gradle merges them automatically. This plugin adds
 * explicit declarations for edge cases and Expo prebuild clarity.
 */
export const withAndroidForegroundService: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (manifestConfig) => {
    const manifest: AndroidManifest['manifest'] =
      manifestConfig.modResults.manifest;

    // ── Permissions ──────────────────────────────────────────────────────────
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    for (const permissionName of REQUIRED_PERMISSIONS) {
      const alreadyDeclared = manifest['uses-permission'].some(
        (p) => p.$['android:name'] === permissionName
      );
      if (!alreadyDeclared) {
        manifest['uses-permission'].push({
          $: { 'android:name': permissionName },
        });
      }
    }

    // ── WakeWordForegroundService ─────────────────────────────────────────────
    const app = manifest.application?.[0];
    if (!app) return manifestConfig;

    if (!app.service) {
      app.service = [];
    }

    const services = app.service as { $: Record<string, string> }[];
    const existingService = services.find(
      (s) => s.$?.['android:name'] === WAKE_WORD_SERVICE_CLASS
    );

    if (existingService) {
      existingService.$ = {
        ...existingService.$,
        ...REQUIRED_SERVICE_ATTRIBUTES,
      };
    } else {
      services.push({
        $: { ...REQUIRED_SERVICE_ATTRIBUTES },
      });
    }

    return manifestConfig;
  });
};
