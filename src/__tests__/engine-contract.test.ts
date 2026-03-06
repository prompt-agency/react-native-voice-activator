import {
  createDefaultRuntimeConfiguration,
  createRuntimeConfiguration,
} from '../domain/detection-config';
import {
  DEFAULT_ENGINE_ID,
  defaultEngineContract,
  defaultEngineMetadata,
  resolveEngineRuntimeConfiguration,
  resolveEngineSelection,
} from '../engines';
import type {
  WakeWordEngineConfiguration,
  WakeWordInitializationOptions,
} from '../index';

describe('engine-agnostic runtime contract', () => {
  it('normalizes runtime configuration around an engine-neutral default engine', () => {
    const configuration = createRuntimeConfiguration({
      profile: 'accuracy',
      enableDebugLogging: true,
      engine: {
        id: DEFAULT_ENGINE_ID,
      },
      engineConfig: {
        sensitivity: 0.8,
        assetKeys: {
          keywordAssetKey: 'keyword/default',
        },
        metadata: {
          locale: 'en-US',
        },
      },
    });

    expect(configuration).toEqual({
      profile: 'accuracy',
      enableDebugLogging: true,
      engine: {
        id: 'default',
      },
      engineConfig: {
        sensitivity: 0.8,
        assetKeys: {
          keywordAssetKey: 'keyword/default',
        },
        metadata: {
          locale: 'en-US',
        },
      },
      engineMetadata: {
        id: 'default',
        displayName: 'Default built-in wake word engine',
        assetRequirement: 'bundled',
        capabilities: {
          onDeviceDetection: true,
          backgroundDetection: false,
          customKeywordAssets: true,
          runtimeConfigurationUpdates: true,
        },
      },
    });
  });

  it('provides a stable default engine contract without vendor-specific ids', () => {
    expect(defaultEngineContract.id).toBe('default');
    expect(defaultEngineMetadata.id).toBe('default');
    expect(defaultEngineMetadata.displayName).toBe(
      'Default built-in wake word engine'
    );
    expect(defaultEngineMetadata.capabilities).toEqual({
      onDeviceDetection: true,
      backgroundDetection: false,
      customKeywordAssets: true,
      runtimeConfigurationUpdates: true,
    });
    expect(
      JSON.stringify({
        contract: defaultEngineContract.id,
        metadata: defaultEngineMetadata,
      }).toLowerCase()
    ).not.toContain('porcupine');
  });

  it('supports extension without changing the initialize API shape', () => {
    const options: WakeWordInitializationOptions = {
      engine: resolveEngineSelection({
        id: 'custom-engine',
        variant: 'experimental',
      }),
      engineConfig: {
        sensitivity: 0.35,
        metadata: {
          profile: 'custom',
        },
      },
    };

    const configuration = createRuntimeConfiguration(options);

    expect(configuration.engine).toEqual({
      id: 'custom-engine',
      variant: 'experimental',
    });
    expect(configuration.engineConfig).toEqual({
      sensitivity: 0.35,
      metadata: {
        profile: 'custom',
      },
    });
    expect(configuration.engineMetadata).toEqual(defaultEngineMetadata);
  });

  it('keeps the default runtime configuration deterministic', () => {
    expect(createDefaultRuntimeConfiguration()).toEqual({
      profile: 'balanced',
      enableDebugLogging: false,
      engine: {
        id: 'default',
      },
      engineConfig: {
        sensitivity: 0.5,
        metadata: {},
      },
      engineMetadata: {
        id: 'default',
        displayName: 'Default built-in wake word engine',
        assetRequirement: 'bundled',
        capabilities: {
          onDeviceDetection: true,
          backgroundDetection: false,
          customKeywordAssets: true,
          runtimeConfigurationUpdates: true,
        },
      },
    });
  });

  it('resolves runtime engine details from the selected engine id', () => {
    const resolved = resolveEngineRuntimeConfiguration(
      {
        id: 'custom-engine',
        variant: 'preview',
      },
      {
        sensitivity: 0.4,
        metadata: {
          locale: 'en-US',
        },
      }
    );

    expect(resolved).toEqual({
      selection: {
        id: 'custom-engine',
        variant: 'preview',
      },
      config: {
        sensitivity: 0.4,
        metadata: {
          locale: 'en-US',
        },
      },
      metadata: defaultEngineMetadata,
    });
  });

  it('retains engine-neutral public exports', async () => {
    const VoiceActivator = await import('../index');
    const exportKeys = Object.keys(VoiceActivator).map((value) =>
      value.toLowerCase()
    );

    expect(exportKeys.some((key) => key.includes('porcupine'))).toBe(false);
  });

  it('accepts engine-neutral configuration types at compile time', () => {
    const engineConfig: WakeWordEngineConfiguration = {
      sensitivity: 0.55,
      metadata: {
        locale: 'en-US',
        offline: true,
      },
    };

    expect(engineConfig).toEqual({
      sensitivity: 0.55,
      metadata: {
        locale: 'en-US',
        offline: true,
      },
    });
  });
});
