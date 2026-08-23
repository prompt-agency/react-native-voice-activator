import RNFS from 'react-native-fs';
import {
  initialize,
  SherpaOnnxSpeakerVerificationAdapter,
} from 'react-native-voice-activator';

// ─── Shared provider singletons ───────────────────────────────────────────────

/**
 * Shared across every screen because the runtime is a module-level singleton:
 * whichever screen calls initialize() last determines whether speaker APIs are
 * available at all. `initialize()` resolves the provider as
 * `options?.speakerVerificationProvider ?? null`, so a call that omits it
 * silently clears enrollment support for the whole app.
 *
 * Must also outlive any single initialize() call so in-memory speaker
 * embeddings survive preset switches and re-initialization. Native speaker
 * registrations may still be cleared if the runtime is fully disposed — call
 * clearEnrollment() explicitly before dispose if persistence matters.
 */
export const speakerVerificationProvider =
  new SherpaOnnxSpeakerVerificationAdapter();

const DEFAULT_KEYWORD_ASSET = 'keywords.txt';

// ─── Speaker model download ───────────────────────────────────────────────────

/**
 * The speaker embedding model is ~28 MB and is NOT bundled in the app, so it is
 * fetched on first use and cached in the app's document directory. The native
 * layer loads absolute paths from disk (newFromFile) and relative paths from
 * APK assets (newFromAsset), so this must stay absolute.
 *
 * wespeaker CAM++ trained on VoxCeleb (English), from the sherpa-onnx model
 * releases. Apache-2.0, same as sherpa-onnx itself.
 */
const SPEAKER_MODEL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_CAM%2B%2B.onnx';

/** Byte size of the published artifact; used to detect truncated downloads. */
const SPEAKER_MODEL_BYTES = 29_292_684;

const SPEAKER_MODEL_DIR = `${RNFS.DocumentDirectoryPath}/speaker-model`;
export const SPEAKER_MODEL_PATH = `${SPEAKER_MODEL_DIR}/wespeaker_en_voxceleb_CAMPP.onnx`;

export interface DownloadProgress {
  /** 0–100, or null while the total size is still unknown. */
  percent: number | null;
  receivedBytes: number;
  totalBytes: number;
}

/**
 * Ensures the speaker model exists on disk, downloading it if needed.
 * Safe to call repeatedly: it returns immediately once the file is present and
 * the right size. Concurrent callers share one in-flight download.
 */
let inFlightDownload: Promise<string> | null = null;

/**
 * Path to the model if it is already downloaded and complete, else null.
 *
 * Lets the Wake Word and Conversation screens configure speaker verification
 * opportunistically without forcing a 28 MB download on someone who only wants
 * wake word detection. Enrollment is the one flow that downloads on demand.
 */
export async function getDownloadedSpeakerModelPath(): Promise<string | null> {
  try {
    if (!(await RNFS.exists(SPEAKER_MODEL_PATH))) return null;
    const stat = await RNFS.stat(SPEAKER_MODEL_PATH);
    return Number(stat.size) === SPEAKER_MODEL_BYTES ? SPEAKER_MODEL_PATH : null;
  } catch {
    return null;
  }
}

export function ensureSpeakerModel(
  onProgress?: (p: DownloadProgress) => void
): Promise<string> {
  inFlightDownload ??= downloadSpeakerModel(onProgress).finally(() => {
    inFlightDownload = null;
  });
  return inFlightDownload;
}

async function downloadSpeakerModel(
  onProgress?: (p: DownloadProgress) => void
): Promise<string> {
  const stat = await RNFS.exists(SPEAKER_MODEL_PATH)
    .then((exists) => (exists ? RNFS.stat(SPEAKER_MODEL_PATH) : null))
    .catch(() => null);

  // A partial file from an interrupted download would make sherpa abort, so
  // treat any unexpected size as absent and re-fetch.
  if (stat && Number(stat.size) === SPEAKER_MODEL_BYTES) {
    return SPEAKER_MODEL_PATH;
  }

  await RNFS.mkdir(SPEAKER_MODEL_DIR);
  const tmpPath = `${SPEAKER_MODEL_PATH}.part`;
  if (await RNFS.exists(tmpPath)) {
    await RNFS.unlink(tmpPath).catch(() => {});
  }

  const { promise } = RNFS.downloadFile({
    fromUrl: SPEAKER_MODEL_URL,
    toFile: tmpPath,
    progressInterval: 250,
    begin: ({ contentLength }) => {
      onProgress?.({
        percent: contentLength > 0 ? 0 : null,
        receivedBytes: 0,
        totalBytes: contentLength,
      });
    },
    progress: ({ bytesWritten, contentLength }) => {
      onProgress?.({
        percent:
          contentLength > 0
            ? Math.round((bytesWritten / contentLength) * 100)
            : null,
        receivedBytes: bytesWritten,
        totalBytes: contentLength,
      });
    },
  });

  const result = await promise;
  if (result.statusCode !== 200) {
    await RNFS.unlink(tmpPath).catch(() => {});
    throw new Error(
      `Speaker model download failed with HTTP ${result.statusCode}`
    );
  }

  const downloaded = await RNFS.stat(tmpPath);
  if (Number(downloaded.size) !== SPEAKER_MODEL_BYTES) {
    await RNFS.unlink(tmpPath).catch(() => {});
    throw new Error(
      `Speaker model download incomplete: got ${downloaded.size} bytes, expected ${SPEAKER_MODEL_BYTES}`
    );
  }

  await RNFS.moveFile(tmpPath, SPEAKER_MODEL_PATH);
  return SPEAKER_MODEL_PATH;
}

// ─── Runtime readiness ────────────────────────────────────────────────────────

/**
 * Tracks whether the live runtime was initialized with the speaker provider.
 * getStatus() cannot answer this: `isAvailable` only reports that the native
 * module exists, so it stays true even when nothing has been initialized and
 * the speaker APIs would throw.
 */
let speakerRuntimeReady = false;

/** Call after any initialize() that passes speakerVerificationProvider. */
export function markSpeakerRuntimeReady(): void {
  speakerRuntimeReady = true;
}

/** Call after dispose(), which tears the provider down again. */
export function markSpeakerRuntimeDisposed(): void {
  speakerRuntimeReady = false;
}

/**
 * Guarantees the speaker APIs are usable before enrollment.
 *
 * The Enrollment tab is the first screen in the app, so on a cold launch no
 * screen has called initialize() yet and enrollSpeaker() throws
 * "requires a speakerVerificationProvider". initialize() is re-entrant — it
 * disposes and rebuilds the engine — so this is safe to call on demand, but it
 * will end an in-flight voice session.
 */
export async function ensureSpeakerRuntime(
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  if (speakerRuntimeReady) return;
  // Must complete before initialize(): the model is loaded lazily on the first
  // embedding extraction, and a missing file is unrecoverable at that point.
  const modelPath = await ensureSpeakerModel(onProgress);
  await initialize({
    engineConfig: { assetKeys: { keywordAssetKey: DEFAULT_KEYWORD_ASSET } },
    speakerVerificationProvider,
    speakerModelPath: modelPath,
    verificationFailureBehavior: 'open',
  });
  speakerRuntimeReady = true;
}
