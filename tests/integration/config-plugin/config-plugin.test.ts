/**
 * Integration tests for the Expo config plugin.
 *
 * Tests verify that each with* modifier correctly mutates the mock
 * platform data (Info.plist / AndroidManifest) and that the composed
 * plugin chains all modifiers together.
 *
 * NOTE: Expo Go is NOT supported. These tests validate development-build
 * config-plugin behavior only.
 */

import type { ManifestUsesPermission } from '@expo/config-plugins/build/android/Manifest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import rootPackageJson from '../../../package.json';

const REQUIRED_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.POST_NOTIFICATIONS',
];

type MockExpoConfig = {
  name: string;
  slug: string;
  ios?: Record<string, unknown>;
  android?: Record<string, unknown>;
  mods?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid Expo config shape for plugin testing. */
function makeMockConfig(
  overrides: Partial<MockExpoConfig> = {}
): MockExpoConfig {
  return {
    name: 'TestApp',
    slug: 'test-app',
    ios: {},
    android: {},
    ...overrides,
  };
}

/**
 * Extracts and executes an ios.infoPlist mod that was attached to a config by
 * a withInfoPlist call. Returns the mutated modResults (the plist object).
 */
async function runInfoPlistMod(
  config: MockExpoConfig,
  initialPlist: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const mod = (config.mods as Record<string, Record<string, unknown>>)?.ios
    ?.infoPlist;
  if (typeof mod !== 'function') {
    throw new Error('No infoPlist mod found on config');
  }
  const result = await (mod as Function)({
    ...config,
    modResults: initialPlist,
  });
  return result.modResults as Record<string, unknown>;
}

/**
 * Extracts and executes an android.manifest mod that was attached to a config
 * by a withAndroidManifest call. Returns the mutated modResults.
 */
async function runAndroidManifestMod(
  config: MockExpoConfig,
  initialManifest: object = {
    manifest: {
      '$': { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      'uses-permission': [],
      'application': [
        { $: { 'android:name': '.MainApplication' }, service: [] },
      ],
    },
  }
): Promise<any> {
  const mod = (config.mods as Record<string, Record<string, unknown>>)?.android
    ?.manifest;
  if (typeof mod !== 'function') {
    throw new Error('No android.manifest mod found on config');
  }
  const result = await (mod as Function)({
    ...config,
    modResults: initialManifest,
  });
  return result.modResults;
}

// ─── withMicrophonePermissions ────────────────────────────────────────────────

describe('withMicrophonePermissions', () => {
  let withMicrophonePermissions: (
    config: MockExpoConfig,
    props: { microphonePermissionText?: string }
  ) => MockExpoConfig;

  beforeEach(() => {
    jest.resetModules();
    ({
      withMicrophonePermissions,
    } = require('../../../src/expo/withMicrophonePermissions'));
  });

  it('adds NSMicrophoneUsageDescription with default text when not set', async () => {
    const config = withMicrophonePermissions(makeMockConfig(), {});
    const plist = await runInfoPlistMod(config, {});
    expect(plist.NSMicrophoneUsageDescription).toBe(
      'This app uses the microphone to detect wake words.'
    );
  });

  it('uses custom microphonePermissionText when provided', async () => {
    const config = withMicrophonePermissions(makeMockConfig(), {
      microphonePermissionText: 'Custom mic message',
    });
    const plist = await runInfoPlistMod(config, {});
    expect(plist.NSMicrophoneUsageDescription).toBe('Custom mic message');
  });

  it('does not overwrite an existing NSMicrophoneUsageDescription', async () => {
    const config = withMicrophonePermissions(makeMockConfig(), {});
    const plist = await runInfoPlistMod(config, {
      NSMicrophoneUsageDescription: 'App-level description',
    });
    expect(plist.NSMicrophoneUsageDescription).toBe('App-level description');
  });
});

// ─── withBackgroundModes ──────────────────────────────────────────────────────

describe('withBackgroundModes', () => {
  let withBackgroundModes: (config: MockExpoConfig) => MockExpoConfig;

  beforeEach(() => {
    jest.resetModules();
    ({
      withBackgroundModes,
    } = require('../../../src/expo/withBackgroundModes'));
  });

  it('adds audio to UIBackgroundModes when not present', async () => {
    const config = withBackgroundModes(makeMockConfig());
    const plist = await runInfoPlistMod(config, {});
    expect(plist.UIBackgroundModes).toContain('audio');
  });

  it('does not duplicate audio if UIBackgroundModes already contains it', async () => {
    const config = withBackgroundModes(makeMockConfig());
    const plist = await runInfoPlistMod(config, {
      UIBackgroundModes: ['audio'],
    });
    const modes = plist.UIBackgroundModes as string[];
    expect(modes.filter((m) => m === 'audio').length).toBe(1);
  });

  it('preserves existing UIBackgroundModes entries', async () => {
    const config = withBackgroundModes(makeMockConfig());
    const plist = await runInfoPlistMod(config, {
      UIBackgroundModes: ['fetch', 'remote-notification'],
    });
    const modes = plist.UIBackgroundModes as string[];
    expect(modes).toContain('fetch');
    expect(modes).toContain('remote-notification');
    expect(modes).toContain('audio');
  });
});

// ─── withAndroidForegroundService ────────────────────────────────────────────

describe('withAndroidForegroundService', () => {
  let withAndroidForegroundService: (config: MockExpoConfig) => MockExpoConfig;

  beforeEach(() => {
    jest.resetModules();
    ({
      withAndroidForegroundService,
    } = require('../../../src/expo/withAndroidForegroundService'));
  });

  function makeMinimalManifest() {
    return {
      manifest: {
        '$': {
          'xmlns:android': 'http://schemas.android.com/apk/res/android',
        },
        'uses-permission': [] as ManifestUsesPermission[],
        'application': [
          {
            $: { 'android:name': '.MainApplication' },
            service: [] as any[],
          },
        ],
      },
    };
  }

  it('adds all required permissions to AndroidManifest', async () => {
    const config = withAndroidForegroundService(makeMockConfig());
    const manifest = await runAndroidManifestMod(config, makeMinimalManifest());
    const permissionNames = (
      manifest.manifest['uses-permission'] as ManifestUsesPermission[]
    ).map((p) => p.$['android:name']);
    for (const perm of REQUIRED_PERMISSIONS) {
      expect(permissionNames).toContain(perm);
    }
  });

  it('is idempotent — running twice does not duplicate permissions', async () => {
    let config = withAndroidForegroundService(makeMockConfig());
    let manifest = await runAndroidManifestMod(config, makeMinimalManifest());

    // Run again
    config = withAndroidForegroundService({
      ...makeMockConfig(),
      mods: undefined,
    });
    manifest = await runAndroidManifestMod(config, manifest);

    const permissionNames = (
      manifest.manifest['uses-permission'] as ManifestUsesPermission[]
    ).map((p) => p.$['android:name']);
    for (const perm of REQUIRED_PERMISSIONS) {
      expect(permissionNames.filter((n) => n === perm).length).toBe(1);
    }
  });

  it('declares WakeWordForegroundService with foregroundServiceType microphone', async () => {
    const config = withAndroidForegroundService(makeMockConfig());
    const manifest = await runAndroidManifestMod(config, makeMinimalManifest());
    const services: any[] = manifest.manifest.application[0].service ?? [];
    const svc = services.find((s: any) =>
      (s.$?.['android:name'] as string)?.includes('WakeWordForegroundService')
    );
    expect(svc).toBeDefined();
    expect(svc?.$?.['android:foregroundServiceType']).toBe('microphone');
    expect(svc?.$?.['android:exported']).toBe('false');
  });

  it('repairs an existing WakeWordForegroundService declaration to the required shape', async () => {
    const config = withAndroidForegroundService(makeMockConfig());
    const manifest = await runAndroidManifestMod(config, {
      manifest: {
        '$': { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        'uses-permission': [],
        'application': [
          {
            $: { 'android:name': '.MainApplication' },
            service: [
              {
                $: {
                  'android:name':
                    'com.voiceactivator.Runtime.WakeWordForegroundService',
                  'android:enabled': 'false',
                },
              },
            ],
          },
        ],
      },
    });
    const services: any[] = manifest.manifest.application[0].service ?? [];
    expect(services).toHaveLength(1);
    expect(services[0].$['android:enabled']).toBe('true');
    expect(services[0].$['android:exported']).toBe('false');
    expect(services[0].$['android:foregroundServiceType']).toBe('microphone');
  });
});

// ─── config-plugin (composed) ────────────────────────────────────────────────

describe('config-plugin (composed withVoiceActivator)', () => {
  let withVoiceActivator: (
    config: MockExpoConfig,
    props?: { microphonePermissionText?: string }
  ) => MockExpoConfig;

  beforeEach(() => {
    jest.resetModules();
    const mod = require('../../../src/expo/config-plugin');
    withVoiceActivator = mod.default ?? mod;
  });

  it('applies the composed iOS plugin mutations', async () => {
    const config = withVoiceActivator(makeMockConfig());
    const plist = await runInfoPlistMod(config, {});
    expect(plist.NSMicrophoneUsageDescription).toBe(
      'This app uses the microphone to detect wake words.'
    );
    expect(plist.UIBackgroundModes).toContain('audio');
  });

  it('applies the composed Android plugin mutations', async () => {
    const config = withVoiceActivator(makeMockConfig());
    const manifest = await runAndroidManifestMod(config);
    const permissionNames = (
      manifest.manifest['uses-permission'] as ManifestUsesPermission[]
    ).map((p) => p.$['android:name']);
    expect(permissionNames).toEqual(
      expect.arrayContaining(REQUIRED_PERMISSIONS as unknown as string[])
    );
    const services: any[] = manifest.manifest.application[0].service ?? [];
    const svc = services.find(
      (service: any) =>
        service.$?.['android:name'] ===
        'com.voiceactivator.Runtime.WakeWordForegroundService'
    );
    expect(svc).toBeDefined();
    expect(svc?.$?.['android:foregroundServiceType']).toBe('microphone');
  });

  it('registers the Expo plugin entry points correctly', () => {
    expect(rootPackageJson.expo.plugin).toBe('./app.plugin.js');
    const appPlugin = require('../../../app.plugin.js');
    const pluginEntry = require('../../../plugin');
    const appPluginSource = readFileSync(
      path.join(process.cwd(), 'app.plugin.js'),
      'utf8'
    );
    const pluginEntrySource = readFileSync(
      path.join(process.cwd(), 'plugin/index.js'),
      'utf8'
    );

    expect(appPlugin).toBe(pluginEntry);
    expect(typeof (pluginEntry.default ?? pluginEntry)).toBe('function');
    expect(appPluginSource).toContain("require('./plugin')");
    expect(pluginEntrySource).toContain('./build/src/expo/config-plugin.js');
    expect(pluginEntrySource).toContain('../lib/module/expo/config-plugin.js');
  });

  it('documents that Expo Go is unsupported and Expo prebuild/native apps are required', () => {
    const configPluginSource = readFileSync(
      path.join(process.cwd(), 'src/expo/config-plugin.ts'),
      'utf8'
    );

    expect(configPluginSource).toContain('Expo Go is NOT supported');
    expect(configPluginSource).toContain('Expo prebuild');
  });

  it('is idempotent when applying the composed plugin twice', async () => {
    const config = withVoiceActivator(withVoiceActivator(makeMockConfig()));
    const plist = await runInfoPlistMod(config, {
      UIBackgroundModes: ['audio'],
    });
    const manifest = await runAndroidManifestMod(config, {
      manifest: {
        '$': { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        'uses-permission': [
          { $: { 'android:name': 'android.permission.RECORD_AUDIO' } },
        ],
        'application': [
          {
            $: { 'android:name': '.MainApplication' },
            service: [
              {
                $: {
                  'android:name':
                    'com.voiceactivator.Runtime.WakeWordForegroundService',
                },
              },
            ],
          },
        ],
      },
    });

    const modes = plist.UIBackgroundModes as string[];
    expect(modes.filter((mode) => mode === 'audio')).toHaveLength(1);

    const permissionNames = (
      manifest.manifest['uses-permission'] as ManifestUsesPermission[]
    ).map((permission) => permission.$['android:name']);
    for (const permissionName of REQUIRED_PERMISSIONS) {
      expect(
        permissionNames.filter((currentName) => currentName === permissionName)
      ).toHaveLength(1);
    }

    const services: any[] = manifest.manifest.application[0].service ?? [];
    expect(
      services.filter(
        (service) =>
          service.$?.['android:name'] ===
          'com.voiceactivator.Runtime.WakeWordForegroundService'
      )
    ).toHaveLength(1);
    expect(services[0].$['android:foregroundServiceType']).toBe('microphone');
    expect(services[0].$['android:exported']).toBe('false');
  });
});
