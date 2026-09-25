/**
 * Bounds on calls the package awaits but does not control.
 *
 * Provider implementations, and the app's own `aiHandler`, are supplied by the
 * consumer. Neither provider interface can promise that its `cancel()`/`stop()`
 * actually unblocks a pending call — `WhisperRNSTTAdapter.cancel()` documents
 * whisper.rn issue #183, and `CustomTTSAdapter.stop()` only sets a flag checked
 * at await boundaries while the blocking ONNX `session.run()` keeps going.
 *
 * Without a bound, one hanging call wedges whatever awaits it: the shared
 * provider orchestration queue in the single-shot path, or the turn loop in a
 * managed session.
 */

export type TimedOperation = 'transcribe' | 'speak' | 'aiHandler';

export class OperationTimeoutError extends Error {
  constructor(
    readonly subject: string,
    readonly operation: TimedOperation,
    readonly timeoutMs: number
  ) {
    super(
      `'${subject}' did not settle within ${timeoutMs}ms during ${operation}().`
    );
    this.name = 'OperationTimeoutError';
  }
}

export function isOperationTimeoutError(
  cause: unknown
): cause is OperationTimeoutError {
  return cause instanceof OperationTimeoutError;
}

/**
 * Race `run()` against a timer.
 *
 * A `timeoutMs` of `0`, a negative value, or a non-finite value disables the
 * bound and simply awaits `run()`.
 *
 * The losing promise is not cancelled — a promise cannot be. It is left to
 * settle (or not) on its own; the caller is responsible for discarding any late
 * result, which the generation guards already do.
 */
export async function withTimeout<T>(
  operation: TimedOperation,
  subject: string,
  timeoutMs: number,
  run: () => Promise<T>
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return run();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new OperationTimeoutError(subject, operation, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Default bound on a single `transcribe()` or `speak()` call.
 *
 * Generous on purpose: on-device Whisper transcription of a long utterance on
 * an older phone is measured in seconds, and cutting off a slow-but-working
 * provider is worse than waiting. This bounds a wedged call, it does not
 * enforce latency.
 */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;

/**
 * Default bound on the app's `aiHandler`.
 *
 * Usually a network round-trip to an LLM, so the most likely of the three to
 * hang in practice. A hung handler strands the session in the `waiting` stage
 * with no recovery path other than an external `close()`.
 */
export const DEFAULT_AI_HANDLER_TIMEOUT_MS = 60_000;
