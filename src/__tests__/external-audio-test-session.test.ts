import {
  ExternalAudioTestSession,
  type ExternalTestServices,
  type ExternalTestSnapshot,
} from '../../example/src/external-audio-test-session';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const PCM_FRAME = btoa('\0'.repeat(512 * 4));

function markedFrame(marker: number) {
  return btoa(String.fromCharCode(marker) + '\0'.repeat(512 * 4 - 1));
}

function emitBatch(emit: (frame?: string) => void) {
  for (let i = 0; i < 16; i++) emit();
}

function setup(overrides: Partial<ExternalTestServices> = {}) {
  let onFrame: ((frame: string) => void) | null = null;
  const capture = { remove: jest.fn(async () => undefined) };
  const detector = {
    processFrame: jest.fn(async (_frame: string) => ({
      keyword: null as string | null,
    })),
    reset: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
  };
  const services: ExternalTestServices = {
    requestPermission: jest.fn(async () => true),
    prepareModels: jest.fn(async () => undefined),
    createDetector: jest.fn(async () => detector),
    startCapture: jest.fn(async (listener) => {
      onFrame = listener;
      return capture;
    }),
    ...overrides,
  };
  const snapshots: ExternalTestSnapshot[] = [];
  const session = new ExternalAudioTestSession(services, (snapshot) => {
    snapshots.push(snapshot);
  });
  return {
    session,
    services,
    detector,
    capture,
    snapshots,
    emit(frame = PCM_FRAME) {
      if (!onFrame) throw new Error('Capture has not started.');
      onFrame(frame);
    },
  };
}

it('prepares, listens, reports detection, and releases both resources', async () => {
  const h = setup();
  h.detector.processFrame.mockResolvedValueOnce({ keyword: 'HELLO WORLD' });
  await h.session.start('hello world');
  expect(h.session.snapshot.phase).toBe('listening');
  emitBatch(h.emit);
  await tick();
  expect(h.session.snapshot).toMatchObject({
    frames: 16,
    detections: 1,
    lastKeyword: 'HELLO WORLD',
  });
  await h.session.stop();
  expect(h.capture.remove).toHaveBeenCalledTimes(1);
  expect(h.detector.dispose).toHaveBeenCalledTimes(1);
  expect(h.session.snapshot.phase).toBe('idle');
  h.emit();
  expect(h.detector.processFrame).toHaveBeenCalledTimes(1);
});

it('cancels during model preparation without opening capture', async () => {
  const preparation = deferred<void>();
  const h = setup({ prepareModels: jest.fn(() => preparation.promise) });
  const start = h.session.start('hello world');
  await tick();
  const stop = h.session.stop();
  preparation.resolve();
  await Promise.all([start, stop]);
  expect(h.services.createDetector).not.toHaveBeenCalled();
  expect(h.services.startCapture).not.toHaveBeenCalled();
  expect(h.session.snapshot.phase).toBe('idle');
});

it('does not prepare models or open capture when microphone access is denied', async () => {
  const h = setup({ requestPermission: jest.fn(async () => false) });
  await h.session.start('hello world');
  expect(h.session.snapshot.phase).toBe('error');
  expect(h.services.prepareModels).not.toHaveBeenCalled();
  expect(h.services.startCapture).not.toHaveBeenCalled();
});

it('closes capture if stop arrives while it is opening', async () => {
  const opening = deferred<{ remove(): Promise<void> }>();
  const listener: { current: ((frame: string) => void) | null } = {
    current: null,
  };
  const h = setup({
    startCapture: jest.fn((onFrame) => {
      listener.current = onFrame;
      return opening.promise;
    }),
  });
  const start = h.session.start('hello world');
  await tick();
  const stop = h.session.stop();
  opening.resolve(h.capture);
  await Promise.all([start, stop]);
  expect(h.capture.remove).toHaveBeenCalledTimes(1);
  expect(h.detector.dispose).toHaveBeenCalledTimes(1);
  listener.current?.(PCM_FRAME);
  expect(h.detector.processFrame).not.toHaveBeenCalled();
});

it('keeps consecutive batches while native processing is still running', async () => {
  const firstFrame = deferred<{ keyword: string | null }>();
  const h = setup();
  h.detector.processFrame.mockImplementationOnce(() => firstFrame.promise);
  await h.session.start('hello world');
  emitBatch(h.emit);
  emitBatch(h.emit);
  expect(h.session.snapshot.dropped).toBe(0);
  firstFrame.resolve({ keyword: null });
  await tick();
  expect(h.detector.processFrame).toHaveBeenCalledTimes(2);
  expect(h.session.snapshot.frames).toBe(32);
  expect(h.detector.reset).not.toHaveBeenCalled();
  await h.session.stop();
});

it('preserves captured sample order inside a batch', async () => {
  const h = setup();
  await h.session.start('hello world');
  for (let i = 0; i < 16; i++) h.emit(markedFrame(i));
  await tick();
  const sent = atob(h.detector.processFrame.mock.calls[0]?.[0] ?? '');
  expect(sent).toHaveLength(16 * 512 * 4);
  for (let i = 0; i < 16; i++) {
    expect(sent.charCodeAt(i * 512 * 4)).toBe(i);
  }
  await h.session.stop();
});

it('accepts a short capture frame without breaking the stream', async () => {
  const h = setup();
  await h.session.start('hello world');
  h.emit(btoa('\0'.repeat(256 * 4)));
  emitBatch(h.emit);
  await tick();
  expect(h.session.snapshot).toMatchObject({ phase: 'listening', frames: 17 });
  expect(h.detector.processFrame).toHaveBeenCalledTimes(1);
  await h.session.stop();
});

it('batches live frames and resets only after a bounded buffer overflows', async () => {
  const firstFrame = deferred<{ keyword: string | null }>();
  const h = setup();
  h.detector.processFrame.mockImplementationOnce(() => firstFrame.promise);
  await h.session.start('hello world');
  emitBatch(h.emit);
  emitBatch(h.emit);
  expect(h.session.snapshot.dropped).toBe(0);
  for (let i = 0; i < 49; i++) h.emit();
  expect(h.session.snapshot.dropped).toBeGreaterThan(0);
  firstFrame.resolve({ keyword: null });
  await tick();
  emitBatch(h.emit);
  await tick();
  expect(h.detector.reset).toHaveBeenCalledTimes(1);
  expect(h.detector.processFrame).toHaveBeenCalledTimes(2);
  await h.session.stop();
});

it('stops and reports a detector failure without leaving capture open', async () => {
  const h = setup();
  h.detector.processFrame.mockRejectedValueOnce(new Error('decode failed'));
  await h.session.start('hello world');
  emitBatch(h.emit);
  await tick();
  await tick();
  expect(h.session.snapshot).toMatchObject({
    phase: 'error',
    error: 'Error: decode failed',
  });
  expect(h.capture.remove).toHaveBeenCalledTimes(1);
  expect(h.detector.dispose).toHaveBeenCalledTimes(1);
});

it('stops after a manual reset failure', async () => {
  const h = setup();
  await h.session.start('hello world');
  h.detector.reset.mockRejectedValueOnce(new Error('reset failed'));
  await h.session.reset();
  expect(h.session.snapshot.phase).toBe('error');
  expect(h.capture.remove).toHaveBeenCalledTimes(1);
  expect(h.detector.dispose).toHaveBeenCalledTimes(1);
});
