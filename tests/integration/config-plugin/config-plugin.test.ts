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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

async function runDangerousMod(
  config: MockExpoConfig,
  platform: 'ios' | 'android',
  projectRoot: string = process.cwd(),
  platformProjectRoot: string = path.join(projectRoot, platform)
): Promise<void> {
  const mod = (config.mods as Record<string, Record<string, unknown>>)?.[
    platform
  ]?.dangerous;
  if (typeof mod !== 'function') {
    throw new Error(`No ${platform}.dangerous mod found on config`);
  }

  await (mod as Function)({
    ...config,
    modResults: {},
    modRequest: {
      projectRoot,
      platformProjectRoot,
      platform,
    },
  });
}

function makeTempProjectRoot(prefix: string): string {
  const projectRoot = mkdtempSync(path.join(tmpdir(), prefix));
  mkdirSync(path.join(projectRoot, 'ios'), { recursive: true });
  mkdirSync(path.join(projectRoot, 'android'), { recursive: true });
  return projectRoot;
}

function withPackageRootOverride<T>(
  packageRoot: string,
  callback: () => Promise<T>
): Promise<T> {
  const previousValue = process.env.RNVA_PACKAGE_ROOT_OVERRIDE;
  process.env.RNVA_PACKAGE_ROOT_OVERRIDE = packageRoot;
  return callback().finally(() => {
    if (previousValue === undefined) {
      delete process.env.RNVA_PACKAGE_ROOT_OVERRIDE;
    } else {
      process.env.RNVA_PACKAGE_ROOT_OVERRIDE = previousValue;
    }
  });
}

function createPackageAssetRoot(
  packageRoot: string,
  relativeRoot: string,
  options: {
    encoderFile?: string;
    decoderFile?: string;
    joinerFile?: string;
    includeTokens?: boolean;
    includeKeywords?: boolean;
  } = {}
) {
  const assetRoot = path.join(packageRoot, relativeRoot);
  mkdirSync(assetRoot, { recursive: true });

  const files = [
    options.encoderFile ?? 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
    options.decoderFile ?? 'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
    options.joinerFile ?? 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  ];

  for (const fileName of files) {
    writeFileSync(path.join(assetRoot, fileName), 'model', 'utf8');
  }

  if (options.includeTokens ?? true) {
    writeFileSync(path.join(assetRoot, 'tokens.txt'), 'tokens', 'utf8');
  }

  if (options.includeKeywords ?? true) {
    writeFileSync(path.join(assetRoot, 'keywords.txt'), 'keywords', 'utf8');
  }

  return assetRoot;
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

// ─── withBundledAssets ───────────────────────────────────────────────────────

describe('withBundledAssets', () => {
  let withBundledAssets: (config: MockExpoConfig) => MockExpoConfig;
  const manifestName = 'voice-activator-sherpa-assets.json';

  beforeEach(() => {
    jest.resetModules();
    ({ withBundledAssets } = require('../../../src/expo/withBundledAssets'));
  });

  it('registers dangerous mods that write Expo prebuild asset manifests', async () => {
    const tempPackageRoot = mkdtempSync(path.join(tmpdir(), 'rnva-package-'));
    const tempProjectRoot = makeTempProjectRoot('rnva-project-');
    const config = withBundledAssets(makeMockConfig());

    createPackageAssetRoot(
      tempPackageRoot,
      path.join(
        'ios',
        'Assets',
        'SherpaOnnxKws',
        'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
      )
    );
    createPackageAssetRoot(
      tempPackageRoot,
      path.join(
        'android',
        'src',
        'main',
        'assets',
        'voice-activator-sherpa-onnx',
        'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
      )
    );

    try {
      await withPackageRootOverride(tempPackageRoot, async () => {
        await expect(
          runDangerousMod(config, 'ios', tempProjectRoot)
        ).resolves.toBeUndefined();
        await expect(
          runDangerousMod(config, 'android', tempProjectRoot)
        ).resolves.toBeUndefined();
      });

      const iosManifest = JSON.parse(
        readFileSync(path.join(tempProjectRoot, 'ios', manifestName), 'utf8')
      );
      const androidManifest = JSON.parse(
        readFileSync(
          path.join(tempProjectRoot, 'android', manifestName),
          'utf8'
        )
      );

      expect(iosManifest.platform).toBe('ios');
      expect(iosManifest.runtimeContract).toContain(
        'Runtime assets remain package-owned'
      );
      expect(iosManifest.modelFilesRelativeToApp.encoder).toContain('encoder');
      expect(androidManifest.platform).toBe('android');
      expect(androidManifest.supportingFilesRelativeToApp.tokens).toContain(
        'tokens.txt'
      );
    } finally {
      rmSync(tempPackageRoot, { recursive: true, force: true });
      rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it('fails fast when the bundled iOS Sherpa assets are missing', async () => {
    const tempPackageRoot = mkdtempSync(
      path.join(tmpdir(), 'rnva-ios-assets-')
    );
    const tempProjectRoot = makeTempProjectRoot('rnva-ios-project-');
    const config = withBundledAssets(makeMockConfig());

    try {
      await withPackageRootOverride(tempPackageRoot, async () => {
        await expect(
          runDangerousMod(config, 'ios', tempProjectRoot)
        ).rejects.toThrow(/Missing bundled Sherpa-ONNX iOS asset directory/);
      });
    } finally {
      rmSync(tempPackageRoot, { recursive: true, force: true });
      rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it('fails fast when the bundled Android Sherpa assets are missing', async () => {
    const tempPackageRoot = mkdtempSync(
      path.join(tmpdir(), 'rnva-android-assets-')
    );
    const tempProjectRoot = makeTempProjectRoot('rnva-android-project-');
    const config = withBundledAssets(makeMockConfig());

    try {
      await withPackageRootOverride(tempPackageRoot, async () => {
        await expect(
          runDangerousMod(config, 'android', tempProjectRoot)
        ).rejects.toThrow(
          /Missing bundled Sherpa-ONNX Android asset directory/
        );
      });
    } finally {
      rmSync(tempPackageRoot, { recursive: true, force: true });
      rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it('accepts non-int8 model variants that the native loaders already support', async () => {
    const tempPackageRoot = mkdtempSync(
      path.join(tmpdir(), 'rnva-variant-package-')
    );
    const tempProjectRoot = makeTempProjectRoot('rnva-variant-project-');
    const config = withBundledAssets(makeMockConfig());

    createPackageAssetRoot(
      tempPackageRoot,
      path.join(
        'ios',
        'Assets',
        'SherpaOnnxKws',
        'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
      ),
      {
        encoderFile: 'encoder.onnx',
        decoderFile: 'decoder-epoch-12-avg-2-chunk-16-left-64.onnx',
        joinerFile: 'joiner.onnx',
      }
    );

    try {
      await withPackageRootOverride(tempPackageRoot, async () => {
        await expect(
          runDangerousMod(config, 'ios', tempProjectRoot)
        ).resolves.toBeUndefined();
      });

      const iosManifest = JSON.parse(
        readFileSync(path.join(tempProjectRoot, 'ios', manifestName), 'utf8')
      );
      expect(iosManifest.modelFilesRelativeToApp.encoder).toContain(
        'encoder.onnx'
      );
      expect(iosManifest.modelFilesRelativeToApp.decoder).toContain(
        'decoder-epoch-12-avg-2-chunk-16-left-64.onnx'
      );
      expect(iosManifest.modelFilesRelativeToApp.joiner).toContain(
        'joiner.onnx'
      );
    } finally {
      rmSync(tempPackageRoot, { recursive: true, force: true });
      rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it('verifies package assets during Expo config without writing manifests into the package tree', async () => {
    const tempPackageRoot = mkdtempSync(
      path.join(tmpdir(), 'rnva-config-package-')
    );
    const tempProjectRoot = makeTempProjectRoot('rnva-config-project-');
    const config = withBundledAssets(makeMockConfig());
    const packageIosRoot = path.join(tempPackageRoot, 'ios');

    createPackageAssetRoot(
      tempPackageRoot,
      path.join(
        'ios',
        'Assets',
        'SherpaOnnxKws',
        'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
      )
    );

    try {
      await withPackageRootOverride(tempPackageRoot, async () => {
        await expect(
          runDangerousMod(config, 'ios', tempProjectRoot, packageIosRoot)
        ).resolves.toBeUndefined();
      });

      expect(existsSync(path.join(packageIosRoot, manifestName))).toBe(false);
    } finally {
      rmSync(tempPackageRoot, { recursive: true, force: true });
      rmSync(tempProjectRoot, { recursive: true, force: true });
    }
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

  it('wires the composed plugin through Sherpa bundled-asset verification', async () => {
    const tempPackageRoot = mkdtempSync(path.join(tmpdir(), 'rnva-composed-'));
    const tempProjectRoot = makeTempProjectRoot('rnva-composed-project-');
    const config = withVoiceActivator(makeMockConfig());

    createPackageAssetRoot(
      tempPackageRoot,
      path.join(
        'ios',
        'Assets',
        'SherpaOnnxKws',
        'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
      )
    );
    createPackageAssetRoot(
      tempPackageRoot,
      path.join(
        'android',
        'src',
        'main',
        'assets',
        'voice-activator-sherpa-onnx',
        'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
      )
    );

    try {
      await withPackageRootOverride(tempPackageRoot, async () => {
        await expect(
          runDangerousMod(config, 'ios', tempProjectRoot)
        ).resolves.toBeUndefined();
        await expect(
          runDangerousMod(config, 'android', tempProjectRoot)
        ).resolves.toBeUndefined();
      });
    } finally {
      rmSync(tempPackageRoot, { recursive: true, force: true });
      rmSync(tempProjectRoot, { recursive: true, force: true });
    }
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
