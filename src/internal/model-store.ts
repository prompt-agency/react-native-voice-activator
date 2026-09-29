import { Platform } from 'react-native';

import manifest from './model-manifest.json';

/**
 * On-demand model storage.
 *
 * The ONNX models are not shipped in the npm tarball. They were duplicated
 * across `ios/Assets` and `android/src/main/assets`, so they cost 15.7 MB of
 * every install and 7.8 MB of every shipped app binary, on both platforms,
 * whether or not the app ever started detection.
 *
 * They are instead uploaded as release assets and downloaded once, verified
 * against `model-manifest.json`, into a persistent per-app directory.
 *
 * Unlike the native binaries — which must be linked at build time and cannot be
 * fetched at runtime at all — model weights are plain data, so both app stores
 * permit downloading them.
 */

export interface ModelFileSpec {
  /** Path inside the model directory on device. */
  path: string;
  /**
   * Name the file is published under.
   *
   * Flattened, because GitHub release asset names cannot contain slashes. A
   * custom `baseUrl` serving a directory tree can ignore this and be pointed at
   * `path` instead — see `flatAssets`.
   */
  asset: string;
  bytes: number;
  sha256: string;
}

export interface ModelBundleManifest {
  bundleVersion: string;
  algorithm: string;
  totalBytes: number;
  files: ModelFileSpec[];
}

export const modelBundleManifest = manifest as ModelBundleManifest;

export interface ModelPreparationProgress {
  /** Manifest-relative path of the file currently being fetched. */
  file: string;
  /** 1-based index of that file within the bundle. */
  fileIndex: number;
  /** Total number of files in the bundle. */
  fileCount: number;
  /** Bytes written across the whole bundle, including files already present. */
  bytesCompleted: number;
  /** Total bytes the bundle occupies once complete. */
  bytesTotal: number;
  /** 0-100, across the whole bundle rather than the current file. */
  percent: number;
}

export interface ModelPreparationOptions {
  /**
   * Base URL the bundle is fetched from. Files are appended as
   * `<baseUrl>/<manifest path>`.
   *
   * Defaults to the GitHub release for the installed package version. Override
   * it to serve the models from your own CDN, which also removes a runtime
   * dependency on GitHub availability.
   */
  baseUrl?: string;
  /**
   * Whether the host serves the flattened asset names (`true`, the default,
   * matching GitHub releases) or the original directory tree (`false`).
   *
   * Set this to `false` when self-hosting a mirror of the model directory, so
   * files are fetched as `<baseUrl>/<path>` rather than `<baseUrl>/<asset>`.
   */
  flatAssets?: boolean;
  onProgress?: (progress: ModelPreparationProgress) => void;
  /**
   * Re-download and re-verify every file even if it is already present and its
   * checksum matches. Defaults to `false`.
   */
  force?: boolean;
}

export interface ModelBundleStatus {
  ready: boolean;
  /** Absolute directory the bundle lives in, whether or not it exists yet. */
  directory: string;
  bundleVersion: string;
  /** Manifest-relative paths that are absent or fail verification. */
  missing: string[];
  bytesTotal: number;
}

export interface ModelPreparationResult {
  directory: string;
  downloaded: string[];
  /** Files already present with a matching checksum. */
  verified: string[];
}

export class ModelPreparationError extends Error {
  constructor(
    message: string,
    readonly file?: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ModelPreparationError';
  }
}

type RNFS = typeof import('@dr.pogodin/react-native-fs');

let cachedRnfs: RNFS | null = null;

async function loadRnfs(): Promise<RNFS> {
  if (cachedRnfs) return cachedRnfs;
  try {
    cachedRnfs = (await import('@dr.pogodin/react-native-fs')) as RNFS;
  } catch (cause) {
    throw new ModelPreparationError(
      '@dr.pogodin/react-native-fs is required to download models on demand. Install it, or ' +
        'bundle the models into your app and pass engineConfig.assetKeys instead.',
      undefined,
      cause
    );
  }
  return cachedRnfs;
}

/**
 * Root the bundle is stored under.
 *
 * iOS uses Library rather than Caches: Caches is purgeable by the OS at any
 * time, and losing the models mid-session would stop detection with no warning.
 * Android uses the app's internal files directory, which is not backed up by
 * default and not subject to the same reclamation.
 *
 * Either way a purge is survivable rather than fatal: every file is checksum
 * verified on `getModelBundleStatus()`, so a missing or truncated file is simply
 * reported as missing and re-fetched by the next `prepareModelBundle()`.
 */
function resolveModelRoot(rnfs: RNFS): string {
  const base =
    Platform.OS === 'ios'
      ? rnfs.LibraryDirectoryPath
      : rnfs.DocumentDirectoryPath;

  return `${base}/voice-activator/models/${modelBundleManifest.bundleVersion}`;
}

function defaultBaseUrl(): string {
  // Kept in sync with the podspec and the Gradle task, which resolve their own
  // binaries from the matching release tag.
  const version = require('../../package.json').version as string;
  return `https://github.com/prompt-agency/react-native-voice-activator/releases/download/v${version}/models`;
}

async function fileMatches(
  rnfs: RNFS,
  absolutePath: string,
  spec: ModelFileSpec
): Promise<boolean> {
  try {
    const info = await rnfs.stat(absolutePath);
    // A size check first: cheap, and catches the common truncation case without
    // hashing several megabytes.
    if (Number(info.size) !== spec.bytes) return false;
  } catch {
    return false;
  }

  try {
    const digest = await rnfs.hash(absolutePath, 'sha256');
    return digest.toLowerCase() === spec.sha256.toLowerCase();
  } catch {
    return false;
  }
}

export async function getModelBundleStatus(): Promise<ModelBundleStatus> {
  const rnfs = await loadRnfs();
  const directory = resolveModelRoot(rnfs);

  const missing: string[] = [];
  for (const spec of modelBundleManifest.files) {
    if (!(await fileMatches(rnfs, `${directory}/${spec.path}`, spec))) {
      missing.push(spec.path);
    }
  }

  return {
    ready: missing.length === 0,
    directory,
    bundleVersion: modelBundleManifest.bundleVersion,
    missing,
    bytesTotal: modelBundleManifest.totalBytes,
  };
}

/**
 * Download any missing or corrupt model files.
 *
 * Idempotent: files already present with a matching checksum are left alone, so
 * calling this on every app launch costs a few stat and hash calls once the
 * bundle is complete.
 */
export async function prepareModelBundle(
  options: ModelPreparationOptions = {}
): Promise<ModelPreparationResult> {
  const rnfs = await loadRnfs();
  const directory = resolveModelRoot(rnfs);
  const baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/+$/, '');
  const flatAssets = options.flatAssets ?? true;

  const downloaded: string[] = [];
  const verified: string[] = [];

  const { files, totalBytes } = modelBundleManifest;
  let bytesCompleted = 0;

  for (const [index, spec] of files.entries()) {
    const target = `${directory}/${spec.path}`;

    if (!options.force && (await fileMatches(rnfs, target, spec))) {
      verified.push(spec.path);
      bytesCompleted += spec.bytes;
      options.onProgress?.({
        file: spec.path,
        fileIndex: index + 1,
        fileCount: files.length,
        bytesCompleted,
        bytesTotal: totalBytes,
        percent: Math.round((bytesCompleted / totalBytes) * 100),
      });
      continue;
    }

    const parent = target.slice(0, target.lastIndexOf('/'));
    await rnfs.mkdir(parent);

    // Download beside the target, then move, so an interrupted download cannot
    // leave a truncated file that a later `exists()` check would trust. The
    // checksum makes this belt-and-braces, but it also avoids re-hashing a file
    // that was obviously never finished.
    const partial = `${target}.part`;
    try {
      await rnfs.unlink(partial);
    } catch {
      /* nothing to clean up */
    }

    const bytesBefore = bytesCompleted;

    try {
      const { promise } = rnfs.downloadFile({
        fromUrl: `${baseUrl}/${flatAssets ? spec.asset : spec.path}`,
        toFile: partial,
        progress: (res) => {
          options.onProgress?.({
            file: spec.path,
            fileIndex: index + 1,
            fileCount: files.length,
            bytesCompleted: bytesBefore + res.bytesWritten,
            bytesTotal: totalBytes,
            percent: Math.min(
              100,
              Math.round(((bytesBefore + res.bytesWritten) / totalBytes) * 100)
            ),
          });
        },
      });

      const result = await promise;
      if (result.statusCode !== undefined && result.statusCode >= 400) {
        throw new ModelPreparationError(
          `Model download failed for ${spec.path}: HTTP ${result.statusCode}.`,
          spec.path
        );
      }
    } catch (cause) {
      await rnfs.unlink(partial).catch(() => undefined);
      if (cause instanceof ModelPreparationError) throw cause;
      throw new ModelPreparationError(
        `Model download failed for ${spec.path}.`,
        spec.path,
        cause
      );
    }

    if (!(await fileMatches(rnfs, partial, spec))) {
      await rnfs.unlink(partial).catch(() => undefined);
      throw new ModelPreparationError(
        `Checksum mismatch for ${spec.path}. Refusing to use an unverified model file.`,
        spec.path
      );
    }

    await rnfs.unlink(target).catch(() => undefined);
    await rnfs.moveFile(partial, target);

    downloaded.push(spec.path);
    bytesCompleted = bytesBefore + spec.bytes;

    // The in-flight progress callback reports whatever the transport last saw.
    // Emit the settled total for this file so the sequence is monotonic in terms
    // of completed bytes and reaches 100 on the final file.
    options.onProgress?.({
      file: spec.path,
      fileIndex: index + 1,
      fileCount: files.length,
      bytesCompleted,
      bytesTotal: totalBytes,
      percent: Math.round((bytesCompleted / totalBytes) * 100),
    });
  }

  return { directory, downloaded, verified };
}

/** Delete the stored bundle. Mainly useful for tests and for reclaiming space. */
export async function clearModelBundle(): Promise<void> {
  const rnfs = await loadRnfs();
  const directory = resolveModelRoot(rnfs);
  await rnfs.unlink(directory).catch(() => undefined);
}

/** @internal Test seam so the lazily-imported peer can be reset between tests. */
export function __resetModelStoreForTests(): void {
  cachedRnfs = null;
}
