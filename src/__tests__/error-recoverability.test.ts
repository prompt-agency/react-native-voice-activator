/**
 * error-recoverability.test.ts
 *
 * docs/getting-started.md tells developers to branch on `category` and
 * `recoverable` to decide how to respond to a failure. Every JS-side error
 * construction site hardcoded `recoverable: true`, so the flag carried no
 * information at all — and createConfigurationFailure() actively overwrote
 * whatever value it was handed, in the one category where non-recoverability
 * matters most: a missing or invalid model asset that no retry will fix.
 */

describe('error recoverability', () => {
  it('has at least one non-recoverable construction site', () => {
    // A guard against the flag silently reverting to a constant. If this fails
    // because the last `recoverable: false` was removed, the flag is decorative
    // again and the docs telling consumers to branch on it are wrong.
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');

    const roots = [
      'src/public/voice-activator.ts',
      'src/runtime/session-orchestrator.ts',
    ];

    const sources = roots.map((rel) =>
      fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
    );

    const hasNonRecoverable = sources.some((src) =>
      src.includes('recoverable: false')
    );

    expect(hasNonRecoverable).toBe(true);
  });

  it('marks a configuration failure as non-recoverable', async () => {
    const { __testables } = await import('../public/voice-activator');

    const result = __testables.createConfigurationFailure({
      category: 'configuration',
      code: 'model_asset_missing',
      message: 'keywords.txt not found',
      recoverable: true,
    });

    expect(result.recoverable).toBe(false);
    expect(result.category).toBe('configuration');
    expect(result.code).toBe('model_asset_missing');
  });

  it('marks an absent native runtime as non-recoverable', async () => {
    const { __testables } = await import('../public/voice-activator');

    const result = __testables.createRuntimeUnavailableError('startDetection');

    expect(result.recoverable).toBe(false);
    expect(result.category).toBe('platform');
  });

  it('keeps a transient provider failure recoverable', async () => {
    const { __testables } = await import('../public/voice-activator');

    const result = __testables.createProviderError(
      'mock-stt',
      'stt_timeout',
      'Transcription timed out.'
    );

    expect(result.recoverable).toBe(true);
  });
});
