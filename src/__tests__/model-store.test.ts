/**
 * model-store.test.ts
 *
 * Models are no longer shipped in the npm tarball; they are downloaded once and
 * verified against model-manifest.json.
 *
 * The tests that matter here are the failure modes, not the happy path. The
 * pre-existing download in WhisperRNSTTAdapter checks only `exists()`, so an
 * interrupted download leaves a truncated file that is trusted forever. This
 * store must not repeat that.
 */

// jest.setup.js mocks this module to "ready" for the rest of the suite; these
// tests are the ones that must exercise the real implementation.
jest.unmock('../internal/model-store');

const mockFiles = new Map<string, { size: number; sha256: string }>();
let mockDownloadBehaviour: (
  url: string,
  toFile: string
) => Promise<void> | void = () => undefined;
let mockDownloadCalls: string[] = [];

jest.mock('@dr.pogodin/react-native-fs', () => ({
  LibraryDirectoryPath: '/Library',
  DocumentDirectoryPath: '/Documents',
  CachesDirectoryPath: '/Caches',
  mkdir: jest.fn(async () => undefined),
  stat: jest.fn(async (p: string) => {
    const f = mockFiles.get(p);
    if (!f) throw new Error(`ENOENT: ${p}`);
    return { size: f.size };
  }),
  hash: jest.fn(async (p: string) => {
    const f = mockFiles.get(p);
    if (!f) throw new Error(`ENOENT: ${p}`);
    return f.sha256;
  }),
  unlink: jest.fn(async (p: string) => {
    if (!mockFiles.has(p)) throw new Error(`ENOENT: ${p}`);
    mockFiles.delete(p);
  }),
  moveFile: jest.fn(async (from: string, to: string) => {
    const f = mockFiles.get(from);
    if (!f) throw new Error(`ENOENT: ${from}`);
    mockFiles.delete(from);
    mockFiles.set(to, f);
  }),
  downloadFile: jest.fn(
    ({
      fromUrl,
      toFile,
      progress,
    }: {
      fromUrl: string;
      toFile: string;
      progress?: (r: { bytesWritten: number; contentLength: number }) => void;
    }) => {
      mockDownloadCalls.push(fromUrl);
      return {
        promise: (async () => {
          progress?.({ bytesWritten: 10, contentLength: 10 });
          await mockDownloadBehaviour(fromUrl, toFile);
          return { statusCode: 200, bytesWritten: 10 };
        })(),
      };
    }
  ),
}));

import {
  __resetModelStoreForTests,
  getModelBundleStatus,
  modelBundleManifest,
  ModelPreparationError,
  prepareModelBundle,
} from '../internal/model-store';

const ROOT = `/Library/voice-activator/models/${modelBundleManifest.bundleVersion}`;

/** Write every manifest file with its correct size and checksum. */
function seedCompleteBundle(dir = ROOT) {
  for (const spec of modelBundleManifest.files) {
    mockFiles.set(`${dir}/${spec.path}`, {
      size: spec.bytes,
      sha256: spec.sha256,
    });
  }
}

/** Default download behaviour: produce a correct file at the .part path. */
function downloadsCorrectly() {
  mockDownloadBehaviour = (url, toFile) => {
    // The URL carries either the flattened asset name or the original nested
    // path, depending on the flatAssets option.
    const spec = modelBundleManifest.files.find(
      (f) => url.endsWith(`/${f.asset}`) || url.endsWith(`/${f.path}`)
    );
    if (!spec) throw new Error(`no manifest entry for ${url}`);
    mockFiles.set(toFile, { size: spec.bytes, sha256: spec.sha256 });
  };
}

beforeEach(() => {
  mockFiles.clear();
  mockDownloadCalls = [];
  __resetModelStoreForTests();
  downloadsCorrectly();
  jest.clearAllMocks();
});

describe('model bundle status', () => {
  it('reports every file missing when nothing is stored', async () => {
    const status = await getModelBundleStatus();

    expect(status.ready).toBe(false);
    expect(status.missing).toHaveLength(modelBundleManifest.files.length);
    expect(status.directory).toBe(ROOT);
    expect(status.bytesTotal).toBe(modelBundleManifest.totalBytes);
  });

  it('reports ready once every file is present and verified', async () => {
    seedCompleteBundle();

    const status = await getModelBundleStatus();

    expect(status.ready).toBe(true);
    expect(status.missing).toEqual([]);
  });

  it('treats a truncated file as missing rather than present', async () => {
    seedCompleteBundle();
    const victim = modelBundleManifest.files[0]!;
    mockFiles.set(`${ROOT}/${victim.path}`, {
      size: victim.bytes - 1, // interrupted download
      sha256: victim.sha256,
    });

    const status = await getModelBundleStatus();

    expect(status.ready).toBe(false);
    expect(status.missing).toEqual([victim.path]);
  });

  it('treats a right-sized file with the wrong content as missing', async () => {
    seedCompleteBundle();
    const victim = modelBundleManifest.files[0]!;
    mockFiles.set(`${ROOT}/${victim.path}`, {
      size: victim.bytes,
      sha256: 'f'.repeat(64),
    });

    const status = await getModelBundleStatus();

    expect(status.ready).toBe(false);
    expect(status.missing).toEqual([victim.path]);
  });
});

describe('preparing the model bundle', () => {
  it('downloads every file and verifies each one', async () => {
    const result = await prepareModelBundle();

    expect(result.downloaded).toHaveLength(modelBundleManifest.files.length);
    expect(result.verified).toEqual([]);
    expect(await getModelBundleStatus()).toMatchObject({ ready: true });
  });

  it('is idempotent — a second call downloads nothing', async () => {
    await prepareModelBundle();
    mockDownloadCalls = [];

    const result = await prepareModelBundle();

    expect(mockDownloadCalls).toEqual([]);
    expect(result.downloaded).toEqual([]);
    expect(result.verified).toHaveLength(modelBundleManifest.files.length);
  });

  it('re-downloads only the files that are missing', async () => {
    seedCompleteBundle();
    const victim = modelBundleManifest.files[2]!;
    mockFiles.delete(`${ROOT}/${victim.path}`);
    mockDownloadCalls = [];

    const result = await prepareModelBundle();

    expect(result.downloaded).toEqual([victim.path]);
    expect(mockDownloadCalls).toHaveLength(1);
  });

  it('refuses a file whose checksum does not match, and does not keep it', async () => {
    const victim = modelBundleManifest.files[0]!;
    mockDownloadBehaviour = (url, toFile) => {
      const name = url.slice(url.lastIndexOf('/') + 1);
      const spec = modelBundleManifest.files.find((f) => f.asset === name)!;
      mockFiles.set(toFile, {
        size: spec.bytes,
        // Right size, wrong bytes — the case a size check alone would pass.
        sha256: spec.path === victim.path ? 'a'.repeat(64) : spec.sha256,
      });
    };

    await expect(prepareModelBundle()).rejects.toThrow(ModelPreparationError);
    await expect(prepareModelBundle()).rejects.toThrow(/Checksum mismatch/);

    // Nothing unverified was left behind at the real path.
    expect(mockFiles.has(`${ROOT}/${victim.path}`)).toBe(false);
    expect(mockFiles.has(`${ROOT}/${victim.path}.part`)).toBe(false);
  });

  it('does not leave a partial file behind when the download throws', async () => {
    mockDownloadBehaviour = () => {
      throw new Error('socket closed');
    };

    await expect(prepareModelBundle()).rejects.toThrow(ModelPreparationError);

    const partials = [...mockFiles.keys()].filter((k) => k.endsWith('.part'));
    expect(partials).toEqual([]);
  });

  it('writes to a .part path and moves it into place, never straight to the target', async () => {
    const seen: string[] = [];
    mockDownloadBehaviour = (url, toFile) => {
      seen.push(toFile);
      const name = url.slice(url.lastIndexOf('/') + 1);
      const spec = modelBundleManifest.files.find((f) => f.asset === name)!;
      mockFiles.set(toFile, { size: spec.bytes, sha256: spec.sha256 });
    };

    await prepareModelBundle();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((p) => p.endsWith('.part'))).toBe(true);
  });

  it('reports monotonic progress that ends at 100', async () => {
    const percents: number[] = [];

    await prepareModelBundle({ onProgress: (p) => percents.push(p.percent) });

    expect(percents.length).toBeGreaterThan(0);
    expect(percents[percents.length - 1]).toBe(100);
    for (let i = 1; i < percents.length; i += 1) {
      expect(percents[i]!).toBeGreaterThanOrEqual(percents[i - 1]!);
    }
  });

  it('honours a custom baseUrl so models can be self-hosted', async () => {
    await prepareModelBundle({ baseUrl: 'https://cdn.example.com/models/' });

    expect(mockDownloadCalls.length).toBeGreaterThan(0);
    for (const url of mockDownloadCalls) {
      expect(url.startsWith('https://cdn.example.com/models/')).toBe(true);
      // The trailing slash must not produce a double slash.
      expect(url).not.toContain('models//');
      // Flattened asset names by default, so no nested path in the URL.
      expect(url.slice('https://cdn.example.com/models/'.length)).not.toContain(
        '/'
      );
    }
  });

  it('fetches the original directory tree when flatAssets is false', async () => {
    await prepareModelBundle({
      baseUrl: 'https://cdn.example.com/models',
      flatAssets: false,
    });

    const nested = mockDownloadCalls.filter((url) =>
      url.slice('https://cdn.example.com/models/'.length).includes('/')
    );
    expect(nested.length).toBeGreaterThan(0);
  });

  it('force re-downloads mockFiles that are already valid', async () => {
    seedCompleteBundle();
    mockDownloadCalls = [];

    const result = await prepareModelBundle({ force: true });

    expect(result.downloaded).toHaveLength(modelBundleManifest.files.length);
    expect(mockDownloadCalls).toHaveLength(modelBundleManifest.files.length);
  });
});

describe('the manifest itself', () => {
  it('pins a sha256 and a positive size for every file', () => {
    expect(modelBundleManifest.algorithm).toBe('sha256');
    expect(modelBundleManifest.files.length).toBeGreaterThan(0);

    for (const spec of modelBundleManifest.files) {
      expect(spec.sha256).toMatch(/^[0-9a-f]{64}$/);
      // GitHub release asset names cannot contain slashes.
      expect(spec.asset).not.toContain('/');
      expect(spec.bytes).toBeGreaterThan(0);
      expect(spec.path).not.toMatch(/^\//);
      // Must not escape the bundle directory.
      expect(spec.path).not.toContain('..');
    }
  });

  it('declares a totalBytes matching the sum of its mockFiles', () => {
    const sum = modelBundleManifest.files.reduce((a, f) => a + f.bytes, 0);
    expect(modelBundleManifest.totalBytes).toBe(sum);
  });

  it('excludes the fp32 model variants the runtime never loads', () => {
    const fp32 = modelBundleManifest.files.filter((f) =>
      /-epoch-12-avg-2-chunk-16-left-64\.onnx$/.test(f.path)
    );
    expect(fp32).toEqual([]);
  });
});
