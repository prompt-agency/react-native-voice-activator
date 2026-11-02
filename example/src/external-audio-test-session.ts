export type ExternalTestPhase =
  | 'idle'
  | 'preparing'
  | 'loading'
  | 'listening'
  | 'stopping'
  | 'error';

export type ExternalTestSnapshot = {
  phase: ExternalTestPhase;
  progress: string;
  frames: number;
  dropped: number;
  detections: number;
  lastKeyword: string | null;
  error: string | null;
};

type Detector = {
  processFrame(frame: string): Promise<{ keyword: string | null }>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
};

type Capture = { remove(): Promise<void> };

export type ExternalTestServices = {
  requestPermission(): Promise<boolean>;
  prepareModels(onProgress: (message: string) => void): Promise<void>;
  createDetector(phrase: string): Promise<Detector>;
  startCapture(onFrame: (pcmBase64: string) => void): Promise<Capture>;
};

const INITIAL: ExternalTestSnapshot = {
  phase: 'idle',
  progress: '',
  frames: 0,
  dropped: 0,
  detections: 0,
  lastKeyword: null,
  error: null,
};

/** Owns the detector and microphone used by the example's test card. */
export class ExternalAudioTestSession {
  private generation = 0;
  private detector: Detector | null = null;
  private capture: Capture | null = null;
  private startTask: Promise<void> | null = null;
  private stopTask: Promise<void> | null = null;
  private frameTask: Promise<void> | null = null;
  private processing = false;
  private gap = false;
  private lastStatsEmitAt = 0;
  private current: ExternalTestSnapshot = { ...INITIAL };

  constructor(
    private readonly services: ExternalTestServices,
    private readonly onChange: (snapshot: ExternalTestSnapshot) => void
  ) {}

  get snapshot(): ExternalTestSnapshot {
    return { ...this.current };
  }

  private update(patch: Partial<ExternalTestSnapshot>, force = true): void {
    this.current = { ...this.current, ...patch };
    const now = Date.now();
    if (force || now - this.lastStatsEmitAt >= 500) {
      this.lastStatsEmitAt = now;
      this.onChange(this.snapshot);
    }
  }

  start(phrase: string): Promise<void> {
    if (this.current.phase !== 'idle' && this.current.phase !== 'error') {
      return this.startTask ?? Promise.resolve();
    }
    const generation = ++this.generation;
    this.processing = false;
    this.gap = false;
    this.update({ ...INITIAL, phase: 'preparing' });
    const task = this.startRun(phrase, generation);
    this.startTask = task;
    const clearStart = () => {
      if (this.startTask === task) this.startTask = null;
    };
    task.then(clearStart, clearStart);
    return task;
  }

  private async startRun(phrase: string, generation: number): Promise<void> {
    let detector: Detector | null = null;
    let capture: Capture | null = null;
    try {
      if (!(await this.services.requestPermission())) {
        throw new Error('Microphone permission was not granted.');
      }
      if (generation !== this.generation) return;
      await this.services.prepareModels((message) => {
        if (generation === this.generation) this.update({ progress: message });
      });
      if (generation !== this.generation) return;
      this.update({ phase: 'loading', progress: 'Loading wake phrase...' });
      detector = await this.services.createDetector(phrase);
      if (generation !== this.generation) return;
      const activeDetector = detector;
      capture = await this.services.startCapture((pcmBase64) => {
        this.onFrame(pcmBase64, activeDetector, generation);
      });
      if (generation !== this.generation) return;
      this.detector = detector;
      this.capture = capture;
      detector = null;
      capture = null;
      this.update({ phase: 'listening', progress: '' });
    } catch (error) {
      if (generation === this.generation) {
        this.update({
          phase: 'error',
          progress: '',
          error: String(error),
        });
      }
    } finally {
      await capture?.remove().catch(() => undefined);
      await detector?.dispose().catch(() => undefined);
    }
  }

  private onFrame(
    pcmBase64: string,
    detector: Detector,
    generation: number
  ): void {
    if (generation !== this.generation) return;
    if (this.processing) {
      this.gap = true;
      this.update({ dropped: this.current.dropped + 1 }, false);
      return;
    }
    this.processing = true;
    const resetBefore = this.gap;
    this.gap = false;
    const task = (async () => {
      if (resetBefore) await detector.reset();
      const { keyword } = await detector.processFrame(pcmBase64);
      if (generation !== this.generation) return;
      this.update(
        {
          frames: this.current.frames + 1,
          ...(keyword
            ? {
                detections: this.current.detections + 1,
                lastKeyword: keyword,
              }
            : {}),
        },
        Boolean(keyword)
      );
    })();
    this.frameTask = task;
    const clearFrame = () => {
      this.processing = false;
      if (this.frameTask === task) this.frameTask = null;
    };
    task.then(clearFrame, (error) => {
      this.gap = true;
      if (generation === this.generation) {
        this.stopWithError(String(error)).catch(() => undefined);
      }
      clearFrame();
    });
  }

  stop(): Promise<void> {
    return this.stopRun(null);
  }

  private stopWithError(error: string): Promise<void> {
    return this.stopRun(error);
  }

  private stopRun(error: string | null): Promise<void> {
    if (this.stopTask) return this.stopTask;
    ++this.generation;
    this.update({ phase: 'stopping', progress: '' });
    const task = (async () => {
      await this.startTask?.catch(() => undefined);
      const capture = this.capture;
      const detector = this.detector;
      this.capture = null;
      this.detector = null;
      let cleanupError: unknown = null;
      try {
        await capture?.remove();
      } catch (cause) {
        cleanupError = cause;
      }
      await this.frameTask?.catch(() => undefined);
      try {
        await detector?.dispose();
      } catch (cause) {
        cleanupError ??= cause;
      }
      this.update({
        phase: error || cleanupError ? 'error' : 'idle',
        error: cleanupError ? String(cleanupError) : error,
      });
    })();
    this.stopTask = task;
    const clearStop = () => {
      if (this.stopTask === task) this.stopTask = null;
    };
    task.then(clearStop, clearStop);
    return task;
  }

  async reset(): Promise<void> {
    if (this.current.phase !== 'listening' || !this.detector) return;
    this.gap = false;
    try {
      await this.detector.reset();
      this.update({ lastKeyword: null });
    } catch (error) {
      await this.stopWithError(String(error));
    }
  }
}
