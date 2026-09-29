/**
 * Local Expo config plugin: bundle the sherpa-onnx Piper TTS assets with the example app.
 *
 * `example/scripts/setup-sherpa-tts.sh` downloads three artifacts into
 * `example/assets/sherpa-tts/`:
 *
 *   espeak-ng-data/        phoneme data directory, ~5000 files
 *   piper-tokens.txt       token table
 *   en_US-ryan-low.onnx    VITS model weights, ~63 MB
 *
 * They used to be written straight into `example/ios/VoiceActivatorExample/` and added to the
 * Xcode target by hand. That cannot survive `expo prebuild --clean`, which deletes and
 * regenerates `example/ios` and `example/android` on every run of the example app. This plugin
 * keeps the source of truth outside the generated projects and re-applies the wiring on each
 * prebuild.
 *
 * iOS: the three artifacts are copied next to the generated app sources and registered as
 * resources of the app target. `espeak-ng-data` is registered as a FOLDER REFERENCE
 * (`lastKnownFileType = folder`), not as a group. sherpa-onnx resolves paths *inside* the
 * directory, for example `espeak-ng-data/phontab`, so the directory structure has to survive
 * into the app bundle. A group-style add would flatten it and the app would fail at runtime
 * with:
 *
 *   offline-tts-vits-model-config.cc:Validate:56
 *   '.../espeak-ng-data/phontab' does not exist. Please check --vits-data-dir
 *
 * Android: the same artifacts are copied into `android/app/src/main/assets/sherpa-tts/`,
 * matching the layout `example/src/sherpa-tts-utils.ts` reads with `RNFS.copyFileAssets`.
 * Note the tokens file is named `tokens.txt` there and `piper-tokens.txt` on iOS; that is what
 * the app code expects on each platform.
 *
 * ── Absent assets versus broken assets ───────────────────────────────────────────────────────
 *
 * These two cases are handled deliberately differently:
 *
 *   1. The asset directory is missing or incomplete. The developer simply has not run the
 *      download script. Sherpa TTS is an optional feature of the example app, and
 *      `scripts/verify-expo-prebuild.mjs` (part of `yarn verify:release-readiness`) runs a real
 *      prebuild in an environment where these ~65 MB of downloaded artifacts will never exist.
 *      So: log one clear line and SKIP. A prebuild must still succeed.
 *
 *   2. The assets ARE present but applying them fails: a copy throws, the Xcode app target or
 *      group cannot be found, or a helper API we depend on is gone. That is a real breakage and
 *      it must THROW. A plugin that half-applies here is worse than one that errors, because
 *      the app then fails at launch with the opaque sherpa message above and nothing points
 *      back at the plugin.
 */
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'with-sherpa-tts-assets';

/** Source directory, relative to the Expo project root (`example/`). */
const ASSET_SOURCE_DIR = path.join('assets', 'sherpa-tts');

const ESPEAK_DIR_NAME = 'espeak-ng-data';
const MODEL_FILE_NAME = 'en_US-ryan-low.onnx';
/** iOS reads this from the app bundle root; Android reads `tokens.txt` from its assets. */
const IOS_TOKENS_FILE_NAME = 'piper-tokens.txt';
const ANDROID_TOKENS_FILE_NAME = 'tokens.txt';

/** A file inside espeak-ng-data that sherpa-onnx resolves; used as a sanity check. */
const ESPEAK_SENTINEL = 'phontab';

const ANDROID_ASSET_SUBDIR = path.join(
  'app',
  'src',
  'main',
  'assets',
  'sherpa-tts'
);

function fail(reason) {
  throw new Error(
    `${PLUGIN_NAME}: ${reason}\n` +
      `The sherpa TTS assets in ${ASSET_SOURCE_DIR} are present, so they were expected to be ` +
      'wired into the generated project, but that failed. Refusing to continue with a ' +
      'half-applied configuration: the app would build and then fail at runtime with an ' +
      'opaque sherpa-onnx "--vits-data-dir" error. Fix the plugin or remove ' +
      `${ASSET_SOURCE_DIR} to opt out of bundled TTS.`
  );
}

// The skip notice is the same for every mod this plugin registers, so print it once per
// prebuild rather than once per platform.
let skipNoticeLogged = false;

function skip(reason) {
  if (skipNoticeLogged) {
    return;
  }
  skipNoticeLogged = true;
  console.log(`${PLUGIN_NAME}: ${reason} Skipping bundled sherpa TTS assets.`);
}

/**
 * Resolves the downloaded assets.
 *
 * Returns `null` when they are absent or incomplete, which is the "developer has not run
 * example/scripts/setup-sherpa-tts.sh" case and is not an error. Never throws.
 */
function resolveAssets(projectRoot) {
  const sourceDir = path.join(projectRoot, ASSET_SOURCE_DIR);

  if (!fs.existsSync(sourceDir)) {
    skip(`${ASSET_SOURCE_DIR} does not exist.`);
    return null;
  }

  const espeakDir = path.join(sourceDir, ESPEAK_DIR_NAME);
  const tokensFile = path.join(sourceDir, IOS_TOKENS_FILE_NAME);
  const modelFile = path.join(sourceDir, MODEL_FILE_NAME);

  const missing = [];
  if (!fs.existsSync(path.join(espeakDir, ESPEAK_SENTINEL))) {
    missing.push(`${ESPEAK_DIR_NAME}/${ESPEAK_SENTINEL}`);
  }
  if (!fs.existsSync(tokensFile)) {
    missing.push(IOS_TOKENS_FILE_NAME);
  }
  if (!fs.existsSync(modelFile)) {
    missing.push(MODEL_FILE_NAME);
  }

  if (missing.length > 0) {
    skip(
      `${ASSET_SOURCE_DIR} is incomplete (missing ${missing.join(', ')}). ` +
        'Run `bash example/scripts/setup-sherpa-tts.sh` to download them.'
    );
    return null;
  }

  return { espeakDir, tokensFile, modelFile };
}

/**
 * Copies a file or a directory tree, replacing whatever was there.
 *
 * Only reached once the assets are known to be present, so any failure here is case 2 above
 * and is rethrown as a plugin error.
 */
function copyInto(source, destination) {
  try {
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
  } catch (error) {
    fail(`failed to copy "${source}" to "${destination}": ${error.message}`);
  }

  if (!fs.existsSync(destination)) {
    fail(
      `copied "${source}" to "${destination}" but the destination is missing.`
    );
  }
}

// ── iOS: copy the artifacts next to the generated app sources ────────────────────────────────

const withSherpaTTSAssetsIOSFiles = (config) => {
  return withDangerousMod(config, [
    'ios',
    (dangerousConfig) => {
      const { projectRoot, platformProjectRoot } = dangerousConfig.modRequest;
      const assets = resolveAssets(projectRoot);
      if (!assets) {
        return dangerousConfig;
      }

      const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const appDir = path.join(platformProjectRoot, projectName);
      if (!fs.existsSync(appDir)) {
        fail(
          `the generated iOS app directory "${appDir}" does not exist, so the assets have ` +
            'nowhere to go.'
        );
      }

      copyInto(assets.espeakDir, path.join(appDir, ESPEAK_DIR_NAME));
      copyInto(assets.tokensFile, path.join(appDir, IOS_TOKENS_FILE_NAME));
      copyInto(assets.modelFile, path.join(appDir, MODEL_FILE_NAME));

      if (!fs.existsSync(path.join(appDir, ESPEAK_DIR_NAME, ESPEAK_SENTINEL))) {
        fail(
          `"${ESPEAK_DIR_NAME}/${ESPEAK_SENTINEL}" is missing after the copy, so the directory ` +
            'structure was not preserved.'
        );
      }

      return dangerousConfig;
    },
  ]);
};

// ── iOS: register the artifacts on the app target ────────────────────────────────────────────

function unquote(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
}

/**
 * Turns an already-added PBXFileReference into a folder reference.
 *
 * `IOSConfig.XcodeUtils.addResourceFileToGroup` builds the file reference through `xcode`'s
 * `pbxFile`, which derives `lastKnownFileType` from the file extension and has no option to
 * override it; `espeak-ng-data` has no extension, so it lands as `unknown`. Xcode distinguishes
 * a folder reference (blue, copied verbatim with its subdirectories) from a group (yellow,
 * children copied individually and flattened) purely by `lastKnownFileType = folder`, so the
 * reference is rewritten in place afterwards.
 */
function markAsFolderReference(project, expectedPath) {
  const section = project.pbxFileReferenceSection();
  let patched = 0;

  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) {
      continue;
    }
    const entry = section[key];
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (unquote(entry.path) !== expectedPath) {
      continue;
    }
    entry.lastKnownFileType = 'folder';
    delete entry.explicitFileType;
    delete entry.fileEncoding;
    patched += 1;
  }

  if (patched !== 1) {
    fail(
      `expected exactly one PBXFileReference with path "${expectedPath}" to convert into a ` +
        `folder reference but patched ${patched}. Without a folder reference, espeak-ng-data ` +
        'is flattened into the app bundle and sherpa-onnx cannot find espeak-ng-data/phontab.'
    );
  }
}

function addResource(project, projectName, fileName) {
  const filepath = `${projectName}/${fileName}`;

  if (project.hasFile(filepath)) {
    return filepath;
  }

  if (typeof IOSConfig.XcodeUtils.addResourceFileToGroup !== 'function') {
    fail(
      'IOSConfig.XcodeUtils.addResourceFileToGroup is not available in the installed ' +
        '@expo/config-plugins. The Xcode resource registration API changed.'
    );
  }

  IOSConfig.XcodeUtils.addResourceFileToGroup({
    filepath,
    groupName: projectName,
    project,
    isBuildFile: true,
    verbose: true,
  });

  if (!project.hasFile(filepath)) {
    fail(`"${filepath}" was not added to the Xcode project.`);
  }

  return filepath;
}

const withSherpaTTSAssetsXcodeProject = (config) => {
  return withXcodeProject(config, (xcodeConfig) => {
    const { projectRoot, platformProjectRoot } = xcodeConfig.modRequest;
    const assets = resolveAssets(projectRoot);
    if (!assets) {
      return xcodeConfig;
    }

    const project = xcodeConfig.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);

    // The dangerous mod above runs first and put the files here. If they are missing, the mod
    // order changed and registering paths that hold nothing would produce exactly the silent
    // half-application this plugin is meant to avoid.
    const appDir = path.join(platformProjectRoot, projectName);
    for (const name of [
      ESPEAK_DIR_NAME,
      IOS_TOKENS_FILE_NAME,
      MODEL_FILE_NAME,
    ]) {
      if (!fs.existsSync(path.join(appDir, name))) {
        fail(
          `"${name}" is not in "${appDir}" at Xcode registration time. The copy step did not ` +
            'run before this mod.'
        );
      }
    }

    if (!project.getTarget('com.apple.product-type.application')) {
      fail(
        'the Xcode project has no application target to attach resources to.'
      );
    }

    const espeakPath = addResource(project, projectName, ESPEAK_DIR_NAME);
    markAsFolderReference(project, espeakPath);

    addResource(project, projectName, IOS_TOKENS_FILE_NAME);
    addResource(project, projectName, MODEL_FILE_NAME);

    console.log(
      `${PLUGIN_NAME}: bundled ${ESPEAK_DIR_NAME} (folder reference), ` +
        `${IOS_TOKENS_FILE_NAME} and ${MODEL_FILE_NAME} into the iOS app target.`
    );

    return xcodeConfig;
  });
};

// ── Android: copy the artifacts into the APK assets ──────────────────────────────────────────

const withSherpaTTSAssetsAndroid = (config) => {
  return withDangerousMod(config, [
    'android',
    (dangerousConfig) => {
      const { projectRoot, platformProjectRoot } = dangerousConfig.modRequest;
      const assets = resolveAssets(projectRoot);
      if (!assets) {
        return dangerousConfig;
      }

      const assetDir = path.join(platformProjectRoot, ANDROID_ASSET_SUBDIR);

      copyInto(assets.espeakDir, path.join(assetDir, ESPEAK_DIR_NAME));
      copyInto(assets.modelFile, path.join(assetDir, MODEL_FILE_NAME));
      copyInto(
        assets.tokensFile,
        path.join(assetDir, ANDROID_TOKENS_FILE_NAME)
      );

      if (
        !fs.existsSync(path.join(assetDir, ESPEAK_DIR_NAME, ESPEAK_SENTINEL))
      ) {
        fail(
          `"${ESPEAK_DIR_NAME}/${ESPEAK_SENTINEL}" is missing under "${assetDir}" after the copy.`
        );
      }

      console.log(
        `${PLUGIN_NAME}: copied sherpa TTS assets into android/${ANDROID_ASSET_SUBDIR}.`
      );

      return dangerousConfig;
    },
  ]);
};

const withSherpaTTSAssets = (config) => {
  config = withSherpaTTSAssetsIOSFiles(config);
  config = withSherpaTTSAssetsXcodeProject(config);
  config = withSherpaTTSAssetsAndroid(config);
  return config;
};

module.exports = withSherpaTTSAssets;
