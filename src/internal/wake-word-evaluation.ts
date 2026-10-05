import NativeVoiceActivator from '../NativeVoiceActivator';

/**
 * Measuring wake word accuracy.
 *
 * The two numbers that decide whether a wake word is usable are the detection
 * rate and the false accepts per hour, and neither had ever been measured for
 * this package — nor does Sherpa-ONNX publish them for its open-vocabulary path.
 * Tuning `sensitivity` without them is guesswork.
 *
 * This runs the detector over a fixed corpus of WAV files, so the numbers are
 * reproducible and comparable between runs and between phrases. It feeds audio
 * directly to the spotter, which means it does **not** measure the microphone,
 * the audio session, the hardware front-end or acoustic conditions — an acoustic
 * run at a device is still the ground truth. What it does give you is a number
 * you can regress against, and a sensitivity curve, neither of which an acoustic
 * rig can produce repeatably.
 *
 * See docs/reliability-validation.md for the corpus requirements and the acoustic
 * protocol this complements.
 */

export interface WakeWordEvaluationCorpus {
  /**
   * WAV files each containing one utterance of the phrase.
   *
   * A file counts as detected if the detector fires at least once in it.
   */
  positives: readonly string[];
  /**
   * WAV files that must never trigger: ordinary speech, media, background noise,
   * and — most importantly — phrases that sound similar to the wake phrase.
   *
   * False accepts per hour is only meaningful against a large amount of negative
   * material. Minutes give you noise; hours give you a number.
   */
  negatives: readonly string[];
  /** Passed through to the detector. Defaults to the runtime default of 0.5. */
  sensitivity?: number;
  /** Model root. Defaults to the on-demand bundle resolved by the caller. */
  modelPath?: string;
  /** Keywords file. Required unless the model root carries a default. */
  keywordsPath?: string;
}

export interface WakeWordFileResult {
  path: string;
  detectionCount: number;
  durationMs: number;
  /** Offsets of each detection, as an upper bound within its decode chunk. */
  detectedAtMs: number[];
}

export interface WakeWordEvaluationResult {
  sensitivity: number;

  /** Fraction of positive files that produced at least one detection, 0-1. */
  detectionRate: number;
  positivesDetected: number;
  positivesTotal: number;

  /**
   * False accepts per hour across the negative corpus.
   *
   * Every detection in a negative file counts, not just the first: a phrase that
   * fires five times during one podcast is five interruptions to a user.
   */
  falseAcceptsPerHour: number;
  falseAcceptTotal: number;
  negativeHours: number;

  positives: WakeWordFileResult[];
  negatives: WakeWordFileResult[];
}

interface NativeEvaluation {
  detections: Array<{ keyword: string; atMs: number }>;
  durationMs: number;
  sampleRate: number;
}

async function evaluateFile(
  path: string,
  corpus: WakeWordEvaluationCorpus,
  sensitivity: number
): Promise<WakeWordFileResult> {
  const raw = (await NativeVoiceActivator!.evaluateWavFile({
    filePath: path,
    sensitivity,
    ...(corpus.modelPath ? { modelPath: corpus.modelPath } : {}),
    ...(corpus.keywordsPath ? { keywordsPath: corpus.keywordsPath } : {}),
  })) as NativeEvaluation;

  return {
    path,
    detectionCount: raw.detections.length,
    durationMs: raw.durationMs,
    detectedAtMs: raw.detections.map((d) => d.atMs),
  };
}

/** Run one corpus at one sensitivity. */
export async function evaluateWakeWordCorpus(
  corpus: WakeWordEvaluationCorpus
): Promise<WakeWordEvaluationResult> {
  const sensitivity = corpus.sensitivity ?? 0.5;

  // Sequential on purpose. Each pass builds its own spotter and decodes on the
  // CPU; running them concurrently on a phone competes for the same cores and
  // distorts nothing about accuracy but makes the run slower and hotter, which
  // matters when the next measurement is battery drain.
  const positives: WakeWordFileResult[] = [];
  for (const path of corpus.positives) {
    positives.push(await evaluateFile(path, corpus, sensitivity));
  }

  const negatives: WakeWordFileResult[] = [];
  for (const path of corpus.negatives) {
    negatives.push(await evaluateFile(path, corpus, sensitivity));
  }

  return summarizeEvaluation(sensitivity, positives, negatives);
}

/**
 * Aggregate per-file results into the two headline numbers.
 *
 * Separated from the native calls so the arithmetic is testable without a device.
 */
export function summarizeEvaluation(
  sensitivity: number,
  positives: readonly WakeWordFileResult[],
  negatives: readonly WakeWordFileResult[]
): WakeWordEvaluationResult {
  const positivesDetected = positives.filter(
    (file) => file.detectionCount > 0
  ).length;

  const falseAcceptTotal = negatives.reduce(
    (sum, file) => sum + file.detectionCount,
    0
  );
  const negativeMs = negatives.reduce((sum, file) => sum + file.durationMs, 0);
  const negativeHours = negativeMs / 3_600_000;

  return {
    sensitivity,
    // An empty positive corpus is reported as 0, not NaN: a missing corpus must
    // read as "nothing proven", never as a passing number.
    detectionRate:
      positives.length === 0 ? 0 : positivesDetected / positives.length,
    positivesDetected,
    positivesTotal: positives.length,
    falseAcceptsPerHour:
      negativeHours === 0 ? 0 : falseAcceptTotal / negativeHours,
    falseAcceptTotal,
    negativeHours,
    positives: [...positives],
    negatives: [...negatives],
  };
}

/**
 * Sweep sensitivity to produce the detection-rate / false-accept tradeoff curve.
 *
 * This is the output that actually lets a consumer choose an operating point.
 * A single number at the default sensitivity says nothing about whether the
 * default is the right one.
 */
export async function sweepWakeWordSensitivity(
  corpus: Omit<WakeWordEvaluationCorpus, 'sensitivity'>,
  sensitivities: readonly number[] = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
): Promise<WakeWordEvaluationResult[]> {
  const results: WakeWordEvaluationResult[] = [];
  for (const sensitivity of sensitivities) {
    results.push(await evaluateWakeWordCorpus({ ...corpus, sensitivity }));
  }
  return results;
}

/**
 * Pick the operating point with the highest detection rate that stays within a
 * false-accept budget.
 *
 * Returns null when no sensitivity meets the budget, which is a real answer:
 * it means the phrase is not usable at that budget and needs changing, rather
 * than that the sweep failed.
 */
export function chooseOperatingPoint(
  sweep: readonly WakeWordEvaluationResult[],
  maxFalseAcceptsPerHour: number
): WakeWordEvaluationResult | null {
  const affordable = sweep.filter(
    (result) => result.falseAcceptsPerHour <= maxFalseAcceptsPerHour
  );
  if (affordable.length === 0) {
    return null;
  }

  return affordable.reduce((best, candidate) => {
    if (candidate.detectionRate !== best.detectionRate) {
      return candidate.detectionRate > best.detectionRate ? candidate : best;
    }
    // Tie on detection rate: prefer the lower false-accept rate, then the lower
    // sensitivity, so the result is deterministic rather than input-order
    // dependent.
    if (candidate.falseAcceptsPerHour !== best.falseAcceptsPerHour) {
      return candidate.falseAcceptsPerHour < best.falseAcceptsPerHour
        ? candidate
        : best;
    }
    return candidate.sensitivity < best.sensitivity ? candidate : best;
  });
}
