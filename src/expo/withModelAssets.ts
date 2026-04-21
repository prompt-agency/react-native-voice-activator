import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { withDangerousMod, withXcodeProject } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

const PACKAGE_NAME = 'react-native-voice-activator';

export interface ModelAssetsProps {
  /** Relative (to app root) or absolute path to speaker embedding model (e.g. campplus.onnx) */
  speakerModelPath?: string;
  /** Relative (to app root) or absolute path to speech denoiser model (e.g. gtcrn_simple.onnx) */
  denoiserModelPath?: string;
}

const MODEL_FIELDS = [
  { field: 'speakerModelPath' as const, subdir: 'SherpaOnnxSpeaker' },
  { field: 'denoiserModelPath' as const, subdir: 'SherpaOnnxDenoiser' },
] as const;

function resolveModelPath(
  projectRoot: string,
  rawPath: string,
  fieldName: string
): string {
  const resolved = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(projectRoot, rawPath);
  if (!existsSync(resolved)) {
    throw new Error(
      `[${PACKAGE_NAME}] ${fieldName}: configured path does not exist: ${resolved}`
    );
  }
  return resolved;
}

export const withModelAssets: ConfigPlugin<ModelAssetsProps> = (
  config,
  props
) => {
  // iOS: copy model files into the native project directory
  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const platformProjectRoot = modConfig.modRequest.platformProjectRoot;
      const appName = modConfig.modRequest.projectName ?? 'App';

      for (const { field, subdir } of MODEL_FIELDS) {
        const rawPath = props[field];
        if (!rawPath) continue;

        const srcPath = resolveModelPath(projectRoot, rawPath, field);
        const destDir = path.join(platformProjectRoot, appName, subdir);
        mkdirSync(destDir, { recursive: true });
        copyFileSync(srcPath, path.join(destDir, path.basename(srcPath)));
      }

      return modConfig;
    },
  ]);

  // iOS: register copied files in .pbxproj via withXcodeProject so they appear
  // in the Copy Bundle Resources build phase and are included in the .app bundle.
  config = withXcodeProject(config, (modConfig) => {
    const xcodeProject = modConfig.modResults;
    const appName = modConfig.modRequest.projectName ?? 'App';

    for (const { field, subdir } of MODEL_FIELDS) {
      const rawPath = props[field];
      if (!rawPath) continue;

      const relativePath = path.join(
        appName,
        subdir,
        path.basename(rawPath)
      );
      xcodeProject.addResourceFile(relativePath, {
        target: xcodeProject.getFirstTarget().uuid,
      });
    }

    return modConfig;
  });

  // Android: copy model files into the app's assets directory.
  // Gradle auto-includes all files under android/app/src/main/assets/ — no extra step needed.
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const platformProjectRoot = modConfig.modRequest.platformProjectRoot;

      const destDir = path.join(
        platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
        'voice-activator-sherpa-onnx'
      );

      for (const { field } of MODEL_FIELDS) {
        const rawPath = props[field];
        if (!rawPath) continue;

        const srcPath = resolveModelPath(projectRoot, rawPath, field);
        mkdirSync(destDir, { recursive: true });
        copyFileSync(srcPath, path.join(destDir, path.basename(srcPath)));
      }

      return modConfig;
    },
  ]);

  return config;
};
