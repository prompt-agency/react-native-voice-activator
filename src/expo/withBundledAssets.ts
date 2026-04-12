import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { withDangerousMod } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

const PACKAGE_NAME = 'react-native-voice-activator';
const IOS_ASSET_ROOT = path.join(
  'ios',
  'Assets',
  'SherpaOnnxKws',
  'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
);
const ANDROID_ASSET_ROOT = path.join(
  'android',
  'src',
  'main',
  'assets',
  'voice-activator-sherpa-onnx',
  'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
);
const SUPPORTING_ASSET_FILES = ['tokens.txt', 'keywords.txt'] as const;
const MODEL_PREFIXES = ['encoder', 'decoder', 'joiner'] as const;
const MANIFEST_FILE_NAME = 'voice-activator-sherpa-assets.json';
const PACKAGE_ROOT_OVERRIDE_ENV = 'RNVA_PACKAGE_ROOT_OVERRIDE';

type PlatformLabel = 'iOS' | 'Android';

type SherpaAssetManifest = {
  generatedBy: string;
  packageName: string;
  platform: 'ios' | 'android';
  packageRootRelativeToApp: string;
  assetRootRelativeToApp: string;
  modelFilesRelativeToApp: Record<(typeof MODEL_PREFIXES)[number], string>;
  supportingFilesRelativeToApp: {
    tokens: string;
    keywords: string;
  };
  runtimeContract: string;
};

function findPackageRoot(startDir: string): string {
  const override = process.env[PACKAGE_ROOT_OVERRIDE_ENV]?.trim();
  if (override) {
    return override;
  }

  let currentDir = startDir;
  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        name?: string;
      };
      if (packageJson.name === PACKAGE_NAME) {
        return currentDir;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  throw new Error(
    `[${PACKAGE_NAME}] Unable to resolve package root from ${startDir}.`
  );
}

function isWithinDirectory(parentDir: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentDir, candidatePath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function getModelCandidates(prefix: (typeof MODEL_PREFIXES)[number]) {
  return [
    `${prefix}.onnx`,
    `${prefix}-epoch-12-avg-2-chunk-16-left-64.int8.onnx`,
    `${prefix}-epoch-12-avg-2-chunk-16-left-64.onnx`,
  ] as const;
}

function resolveModelFile(
  assetRoot: string,
  prefix: (typeof MODEL_PREFIXES)[number],
  platformLabel: PlatformLabel
): string {
  const existingCandidate = getModelCandidates(prefix).find((candidate) =>
    existsSync(path.join(assetRoot, candidate))
  );

  if (!existingCandidate) {
    throw new Error(
      `[${PACKAGE_NAME}] Missing bundled Sherpa-ONNX ${platformLabel} model for ${prefix} under ${assetRoot}.`
    );
  }

  return existingCandidate;
}

function resolveBundledAssets(
  packageRoot: string,
  relativeRoot: string,
  platformLabel: PlatformLabel
) {
  const assetRoot = path.join(packageRoot, relativeRoot);
  if (!existsSync(assetRoot)) {
    throw new Error(
      `[${PACKAGE_NAME}] Missing bundled Sherpa-ONNX ${platformLabel} asset directory at ${assetRoot}. ` +
        'The Expo config plugin expects package-owned native assets to be present before prebuild.'
    );
  }

  const missingSupportingFiles = SUPPORTING_ASSET_FILES.filter(
    (fileName) => !existsSync(path.join(assetRoot, fileName))
  );

  if (missingSupportingFiles.length > 0) {
    throw new Error(
      `[${PACKAGE_NAME}] Missing bundled Sherpa-ONNX ${platformLabel} asset files: ${missingSupportingFiles.join(
        ', '
      )}. Checked under ${assetRoot}.`
    );
  }

  return {
    assetRoot,
    modelFiles: {
      encoder: resolveModelFile(assetRoot, 'encoder', platformLabel),
      decoder: resolveModelFile(assetRoot, 'decoder', platformLabel),
      joiner: resolveModelFile(assetRoot, 'joiner', platformLabel),
    },
    supportingFiles: {
      tokens: 'tokens.txt',
      keywords: 'keywords.txt',
    },
  };
}

function writeAssetManifest(
  appRoot: string,
  platformProjectRoot: string,
  platform: 'ios' | 'android',
  packageRoot: string,
  relativeRoot: string,
  platformLabel: PlatformLabel
) {
  const resolvedAssets = resolveBundledAssets(
    packageRoot,
    relativeRoot,
    platformLabel
  );
  const manifestPath = path.join(platformProjectRoot, MANIFEST_FILE_NAME);
  const manifest: SherpaAssetManifest = {
    generatedBy: `${PACKAGE_NAME} Expo config plugin`,
    packageName: PACKAGE_NAME,
    platform,
    packageRootRelativeToApp: path.relative(appRoot, packageRoot),
    assetRootRelativeToApp: path.relative(appRoot, resolvedAssets.assetRoot),
    modelFilesRelativeToApp: {
      encoder: path.relative(
        appRoot,
        path.join(resolvedAssets.assetRoot, resolvedAssets.modelFiles.encoder)
      ),
      decoder: path.relative(
        appRoot,
        path.join(resolvedAssets.assetRoot, resolvedAssets.modelFiles.decoder)
      ),
      joiner: path.relative(
        appRoot,
        path.join(resolvedAssets.assetRoot, resolvedAssets.modelFiles.joiner)
      ),
    },
    supportingFilesRelativeToApp: {
      tokens: path.relative(
        appRoot,
        path.join(
          resolvedAssets.assetRoot,
          resolvedAssets.supportingFiles.tokens
        )
      ),
      keywords: path.relative(
        appRoot,
        path.join(
          resolvedAssets.assetRoot,
          resolvedAssets.supportingFiles.keywords
        )
      ),
    },
    runtimeContract:
      'Generated during Expo prebuild for validation/troubleshooting only. Runtime assets remain package-owned native resources.',
  };

  mkdirSync(platformProjectRoot, { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/**
 * Generates platform-native Sherpa asset manifests and verifies the package
 * bundle is present during Expo config and prebuild runs.
 *
 * The plugin intentionally does not copy runtime assets into a separate
 * Expo-managed location. Instead, it emits deterministic prebuild artifacts in
 * the generated native projects and fails fast if the package-native asset
 * roots that the iOS podspec and Android Gradle config rely on are missing.
 */
export const withBundledAssets: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const packageRoot = findPackageRoot(__dirname);
      const shouldWriteManifest = isWithinDirectory(
        modConfig.modRequest.projectRoot,
        modConfig.modRequest.platformProjectRoot
      );

      if (!shouldWriteManifest) {
        resolveBundledAssets(packageRoot, IOS_ASSET_ROOT, 'iOS');
        return modConfig;
      }

      writeAssetManifest(
        modConfig.modRequest.projectRoot,
        modConfig.modRequest.platformProjectRoot,
        'ios',
        packageRoot,
        IOS_ASSET_ROOT,
        'iOS'
      );
      return modConfig;
    },
  ]);

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const packageRoot = findPackageRoot(__dirname);
      const shouldWriteManifest = isWithinDirectory(
        modConfig.modRequest.projectRoot,
        modConfig.modRequest.platformProjectRoot
      );

      if (!shouldWriteManifest) {
        resolveBundledAssets(packageRoot, ANDROID_ASSET_ROOT, 'Android');
        return modConfig;
      }

      writeAssetManifest(
        modConfig.modRequest.projectRoot,
        modConfig.modRequest.platformProjectRoot,
        'android',
        packageRoot,
        ANDROID_ASSET_ROOT,
        'Android'
      );
      return modConfig;
    },
  ]);

  return config;
};
