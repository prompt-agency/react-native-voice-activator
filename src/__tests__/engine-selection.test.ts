import {
  DEFAULT_ENGINE_ID,
  defaultEngineMetadata,
  defaultEngineContract,
  resolveEngineSelection,
  resolveEngineContract,
  resolveEngineConfiguration,
  resolveEngineRuntimeConfiguration,
} from '../engines/shared/engine-selection';

describe('engine selection helpers', () => {
  // ─── Constants ──────────────────────────────────────────────────────────────

  describe('DEFAULT_ENGINE_ID', () => {
    it('is "default"', () => {
      expect(DEFAULT_ENGINE_ID).toBe('default');
    });
  });

  describe('defaultEngineMetadata', () => {
    it('reports on-device detection capability', () => {
      expect(defaultEngineMetadata.capabilities.onDeviceDetection).toBe(true);
    });

    it('reports no background detection', () => {
      expect(defaultEngineMetadata.capabilities.backgroundDetection).toBe(
        false
      );
    });

    it('requires bundled assets', () => {
      expect(defaultEngineMetadata.assetRequirement).toBe('bundled');
    });

    it('supports custom keyword assets', () => {
      expect(defaultEngineMetadata.capabilities.customKeywordAssets).toBe(true);
    });
  });

  describe('defaultEngineContract', () => {
    it('has id matching DEFAULT_ENGINE_ID', () => {
      expect(defaultEngineContract.id).toBe(DEFAULT_ENGINE_ID);
    });

    it('createDefaultConfig returns sensitivity 0.5', () => {
      expect(defaultEngineContract.createDefaultConfig()).toEqual({
        sensitivity: 0.5,
      });
    });

    it('normalizeConfig applies default sensitivity when called with no args', () => {
      expect(defaultEngineContract.normalizeConfig()).toMatchObject({
        sensitivity: 0.5,
      });
    });

    it('normalizeConfig merges provided sensitivity', () => {
      expect(
        defaultEngineContract.normalizeConfig({ sensitivity: 0.9 })
      ).toMatchObject({ sensitivity: 0.9 });
    });

    it('normalizeConfig copies assetKeys by value', () => {
      const assetKeys = {
        modelAssetKey: 'model.onnx',
        keywordAssetKey: 'kw.txt',
      };
      const config = defaultEngineContract.normalizeConfig({ assetKeys });
      expect(config.assetKeys).toEqual(assetKeys);
      expect(config.assetKeys).not.toBe(assetKeys); // copied, not same reference
    });

    it('normalizeConfig leaves assetKeys undefined when not provided', () => {
      expect(defaultEngineContract.normalizeConfig({})).toMatchObject({
        assetKeys: undefined,
      });
    });
  });

  // ─── resolveEngineSelection ─────────────────────────────────────────────────

  describe('resolveEngineSelection', () => {
    it('defaults to default id when called with no args', () => {
      expect(resolveEngineSelection()).toEqual({ id: DEFAULT_ENGINE_ID });
    });

    it('uses provided id', () => {
      expect(resolveEngineSelection({ id: 'porcupine' })).toMatchObject({
        id: 'porcupine',
      });
    });

    it('includes variant when provided', () => {
      expect(
        resolveEngineSelection({ id: DEFAULT_ENGINE_ID, variant: 'lite' })
      ).toEqual({
        id: DEFAULT_ENGINE_ID,
        variant: 'lite',
      });
    });

    it('omits variant when not provided', () => {
      const result = resolveEngineSelection({ id: DEFAULT_ENGINE_ID });
      expect('variant' in result).toBe(false);
    });

    it('defaults id to default when selection has no id', () => {
      // @ts-expect-error testing incomplete selection
      expect(resolveEngineSelection({}).id).toBe(DEFAULT_ENGINE_ID);
    });
  });

  // ─── resolveEngineContract ──────────────────────────────────────────────────

  describe('resolveEngineContract', () => {
    it('returns default contract when called with no args', () => {
      expect(resolveEngineContract().id).toBe(DEFAULT_ENGINE_ID);
    });

    it('returns default contract for explicit default id', () => {
      expect(resolveEngineContract({ id: DEFAULT_ENGINE_ID }).id).toBe(
        DEFAULT_ENGINE_ID
      );
    });

    it('falls back to default for an unregistered engine id', () => {
      expect(resolveEngineContract({ id: 'nonexistent-engine-xyz' }).id).toBe(
        DEFAULT_ENGINE_ID
      );
    });
  });

  // ─── resolveEngineConfiguration ─────────────────────────────────────────────

  describe('resolveEngineConfiguration', () => {
    it('returns default sensitivity 0.5 when no config provided', () => {
      expect(resolveEngineConfiguration().sensitivity).toBe(0.5);
    });

    it('uses provided sensitivity', () => {
      expect(
        resolveEngineConfiguration(undefined, { sensitivity: 0.7 }).sensitivity
      ).toBe(0.7);
    });

    it('includes assetKeys when provided', () => {
      const config = resolveEngineConfiguration(undefined, {
        assetKeys: { modelAssetKey: 'model.onnx', keywordAssetKey: 'kw.txt' },
      });
      expect(config.assetKeys).toEqual({
        modelAssetKey: 'model.onnx',
        keywordAssetKey: 'kw.txt',
      });
    });

    it('assetKeys is undefined when not provided', () => {
      expect(resolveEngineConfiguration().assetKeys).toBeUndefined();
    });
  });

  // ─── resolveEngineRuntimeConfiguration ──────────────────────────────────────

  describe('resolveEngineRuntimeConfiguration', () => {
    it('returns selection, config, and metadata', () => {
      const result = resolveEngineRuntimeConfiguration();
      expect(result.selection).toEqual({ id: DEFAULT_ENGINE_ID });
      expect(result.config).toMatchObject({ sensitivity: 0.5 });
      expect(result.metadata.id).toBe(DEFAULT_ENGINE_ID);
    });

    it('normalizes sensitivity from provided config', () => {
      const result = resolveEngineRuntimeConfiguration(undefined, {
        sensitivity: 0.3,
      });
      expect(result.config.sensitivity).toBe(0.3);
    });

    it('includes metadata capabilities', () => {
      const result = resolveEngineRuntimeConfiguration();
      expect(result.metadata.capabilities).toMatchObject({
        onDeviceDetection: true,
        backgroundDetection: false,
      });
    });

    it('includes assetKeys in config when provided', () => {
      const result = resolveEngineRuntimeConfiguration(undefined, {
        assetKeys: { modelAssetKey: 'a.onnx', keywordAssetKey: 'b.txt' },
      });
      expect(result.config.assetKeys).toEqual({
        modelAssetKey: 'a.onnx',
        keywordAssetKey: 'b.txt',
      });
    });
  });
});
