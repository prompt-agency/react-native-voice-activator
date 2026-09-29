/**
 * event-bus-listener-isolation.test.ts
 *
 * A throwing consumer listener must not abort the dispatch loop, and must not
 * propagate back into the internal code that triggered the emit.
 *
 * VoiceSessionOrchestrator._emitAll already wrapped its per-instance listeners
 * in try/catch, with a comment describing exactly this hazard. The two global
 * buses that addWakeWordListener/addSessionListener actually use did not, so an
 * 'error' listener that threw could abort the rollback path that emitted it.
 */

import {
  addRuntimeListener,
  emitRuntimeEvent,
} from '../internal/runtime-events';
import {
  addSessionListener,
  emitSessionEvent,
} from '../internal/session-events';

describe('runtime event bus listener isolation', () => {
  it('delivers to every listener even when an earlier one throws', () => {
    const calls: string[] = [];

    const first = addRuntimeListener('wakeWordDetected', () => {
      calls.push('first');
      throw new Error('consumer bug');
    });
    const second = addRuntimeListener('wakeWordDetected', () => {
      calls.push('second');
    });

    emitRuntimeEvent('wakeWordDetected', {
      detectedPhrase: 'hey',
      detectedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(calls).toEqual(['first', 'second']);

    first.remove();
    second.remove();
  });

  it('does not propagate a listener throw back to the emitter', () => {
    const subscription = addRuntimeListener('error', () => {
      throw new Error('consumer bug');
    });

    expect(() =>
      emitRuntimeEvent('error', {
        code: 'boom',
        category: 'internal',
        message: 'boom',
        recoverable: true,
      })
    ).not.toThrow();

    subscription.remove();
  });
});

describe('session event bus listener isolation', () => {
  it('delivers to every listener even when an earlier one throws', () => {
    const calls: string[] = [];

    const first = addSessionListener('sessionStarted', () => {
      calls.push('first');
      throw new Error('consumer bug');
    });
    const second = addSessionListener('sessionStarted', () => {
      calls.push('second');
    });

    emitSessionEvent('sessionStarted', {});

    expect(calls).toEqual(['first', 'second']);

    first.remove();
    second.remove();
  });

  it('does not propagate a listener throw back to the emitter', () => {
    const subscription = addSessionListener('sessionEnded', () => {
      throw new Error('consumer bug');
    });

    expect(() =>
      emitSessionEvent('sessionEnded', { reason: 'explicit' })
    ).not.toThrow();

    subscription.remove();
  });
});
