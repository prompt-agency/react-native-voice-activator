/**
 * wake-word-evaluation.test.ts
 *
 * The arithmetic is the part that can be wrong silently. A detection rate that
 * reads 1.0 because the corpus was empty, or a false-accept rate that counts one
 * file instead of one detection, would produce a confident number that means
 * nothing — which is worse than having no number, because it would be published.
 */

import {
  chooseOperatingPoint,
  summarizeEvaluation,
  type WakeWordEvaluationResult,
  type WakeWordFileResult,
} from '../internal/wake-word-evaluation';

function file(
  path: string,
  detectionCount: number,
  durationMs: number
): WakeWordFileResult {
  return {
    path,
    detectionCount,
    durationMs,
    detectedAtMs: Array.from({ length: detectionCount }, (_, i) => i * 1000),
  };
}

describe('detection rate', () => {
  it('counts a file once however many times it fires', () => {
    const result = summarizeEvaluation(
      0.5,
      [file('a.wav', 1, 2000), file('b.wav', 3, 2000), file('c.wav', 0, 2000)],
      []
    );

    // Two of three files detected. Firing three times in one utterance is still
    // one successful detection, not three.
    expect(result.positivesDetected).toBe(2);
    expect(result.positivesTotal).toBe(3);
    expect(result.detectionRate).toBeCloseTo(2 / 3);
  });

  it('reports 0, not NaN, for an empty positive corpus', () => {
    const result = summarizeEvaluation(0.5, [], []);

    // A missing corpus must read as "nothing proven", never as a passing number.
    expect(result.detectionRate).toBe(0);
    expect(Number.isNaN(result.detectionRate)).toBe(false);
  });

  it('reports a perfect rate only when every file detected', () => {
    const result = summarizeEvaluation(
      0.5,
      [file('a.wav', 1, 1000), file('b.wav', 1, 1000)],
      []
    );
    expect(result.detectionRate).toBe(1);
  });
});

describe('false accepts per hour', () => {
  it('counts every detection, not every file', () => {
    const result = summarizeEvaluation(
      0.5,
      [],
      // One hour of negatives, five spurious detections inside one file.
      [file('podcast.wav', 5, 3_600_000)]
    );

    // Five firings during one podcast is five interruptions to a user.
    expect(result.falseAcceptTotal).toBe(5);
    expect(result.negativeHours).toBeCloseTo(1);
    expect(result.falseAcceptsPerHour).toBeCloseTo(5);
  });

  it('normalises by total negative duration across files', () => {
    const result = summarizeEvaluation(
      0.5,
      [],
      [
        file('a.wav', 1, 1_800_000), // 30 min
        file('b.wav', 2, 1_800_000), // 30 min
      ]
    );

    expect(result.negativeHours).toBeCloseTo(1);
    expect(result.falseAcceptsPerHour).toBeCloseTo(3);
  });

  it('scales correctly for a short corpus', () => {
    // 6 minutes with 1 false accept extrapolates to 10/hour — and the small
    // corpus is exactly why that number should not be trusted.
    const result = summarizeEvaluation(0.5, [], [file('a.wav', 1, 360_000)]);
    expect(result.falseAcceptsPerHour).toBeCloseTo(10);
  });

  it('reports 0, not Infinity, for an empty negative corpus', () => {
    const result = summarizeEvaluation(0.5, [file('a.wav', 1, 1000)], []);

    expect(result.falseAcceptsPerHour).toBe(0);
    expect(Number.isFinite(result.falseAcceptsPerHour)).toBe(true);
  });
});

describe('choosing an operating point', () => {
  function point(
    sensitivity: number,
    detectionRate: number,
    falseAcceptsPerHour: number
  ): WakeWordEvaluationResult {
    return {
      sensitivity,
      detectionRate,
      positivesDetected: 0,
      positivesTotal: 0,
      falseAcceptsPerHour,
      falseAcceptTotal: 0,
      negativeHours: 1,
      positives: [],
      negatives: [],
    };
  }

  const sweep = [
    point(0.3, 0.99, 12.0),
    point(0.5, 0.95, 0.9),
    point(0.6, 0.91, 0.4),
    point(0.8, 0.6, 0.05),
  ];

  it('takes the best detection rate within the budget', () => {
    expect(chooseOperatingPoint(sweep, 1.0)?.sensitivity).toBe(0.5);
    expect(chooseOperatingPoint(sweep, 0.5)?.sensitivity).toBe(0.6);
    expect(chooseOperatingPoint(sweep, 0.1)?.sensitivity).toBe(0.8);
  });

  it('returns null when nothing meets the budget', () => {
    // A real answer: the phrase is not usable at this budget and needs changing.
    expect(chooseOperatingPoint(sweep, 0.001)).toBeNull();
  });

  it('is deterministic when detection rates tie', () => {
    const tied = [
      point(0.7, 0.9, 0.5),
      point(0.4, 0.9, 0.2),
      point(0.6, 0.9, 0.2),
    ];

    // Lower false-accept rate wins the tie; then the lower sensitivity.
    const chosen = chooseOperatingPoint(tied, 1.0);
    expect(chosen?.falseAcceptsPerHour).toBe(0.2);
    expect(chosen?.sensitivity).toBe(0.4);
  });

  it('handles an empty sweep', () => {
    expect(chooseOperatingPoint([], 1.0)).toBeNull();
  });

  it('treats the budget as inclusive', () => {
    const exact = [point(0.5, 0.9, 1.0)];
    expect(chooseOperatingPoint(exact, 1.0)?.sensitivity).toBe(0.5);
  });
});

describe('the reference figures this is measured against', () => {
  it("documents Google's and Apple's published operating points", () => {
    // Not a behavioural test — a guard so the targets stay in the repo next to
    // the code that measures them, rather than only in a research document.
    //
    // Google, cascade KWS (arXiv:1712.03603): 0.006–0.03 FA/hr at 3.1–5.6% FRR.
    // Apple, "Hey Siri" (machinelearning.apple.com/research/hey-siri): a target
    // of roughly one false alarm per week.
    // Picovoice self-reports <1 per 10 hours; openWakeWord targets <0.5/hr.
    //
    // Anything above a few per hour is not shippable as an always-on trigger.
    const shippableBudgetPerHour = 0.5;
    expect(shippableBudgetPerHour).toBeLessThan(1);
  });
});
