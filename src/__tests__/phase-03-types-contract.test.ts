/**
 * Phase 03 Types Contract Tests
 *
 * Verifies that:
 * - VoiceSessionEventMap has speakerVerificationPassed and speakerVerificationFailed entries
 * - WakeWordInitializationOptions accepts new optional fields (verificationThreshold, verificationFailureBehavior, vadGateEnabled, vadGateThreshold)
 * - VoiceActivatorApi includes enrollment methods
 * - session-events listeners registry has entries for both new verification events
 */

import type {
  EnrollmentData,
  SpeakerVerificationFailedEvent,
  SpeakerVerificationPassedEvent,
  VoiceActivatorApi,
  VoiceSessionEventMap,
  WakeWordInitializationOptions,
} from '../public/types';
import {
  addSessionListener,
  emitSessionEvent,
} from '../internal/session-events';

// ─── Test 1: VoiceSessionEventMap has speakerVerificationPassed ───────────────

describe('VoiceSessionEventMap — verification events', () => {
  it('has speakerVerificationPassed key with score and speakerId', () => {
    const event: VoiceSessionEventMap['speakerVerificationPassed'] = {
      score: 0.95,
      speakerId: 'user-001',
    };
    expect(event.score).toBe(0.95);
    expect(event.speakerId).toBe('user-001');
  });

  // ─── Test 2: VoiceSessionEventMap has speakerVerificationFailed ───────────────

  it('has speakerVerificationFailed key with score', () => {
    const event: VoiceSessionEventMap['speakerVerificationFailed'] = {
      score: 0.2,
    };
    expect(event.score).toBe(0.2);
  });
});

// ─── Test 3: WakeWordInitializationOptions new optional fields ────────────────

describe('WakeWordInitializationOptions — new optional fields', () => {
  it('accepts all four new optional fields without TypeScript errors', () => {
    const options: WakeWordInitializationOptions = {
      verificationThreshold: 0.75,
      verificationFailureBehavior: 'emit',
      vadGateEnabled: true,
      vadGateThreshold: 0.6,
    };
    expect(options.verificationThreshold).toBe(0.75);
    expect(options.verificationFailureBehavior).toBe('emit');
    expect(options.vadGateEnabled).toBe(true);
    expect(options.vadGateThreshold).toBe(0.6);
  });

  it('accepts all verificationFailureBehavior values', () => {
    const open: WakeWordInitializationOptions = {
      verificationFailureBehavior: 'open',
    };
    const closed: WakeWordInitializationOptions = {
      verificationFailureBehavior: 'closed',
    };
    const emit: WakeWordInitializationOptions = {
      verificationFailureBehavior: 'emit',
    };
    expect(open.verificationFailureBehavior).toBe('open');
    expect(closed.verificationFailureBehavior).toBe('closed');
    expect(emit.verificationFailureBehavior).toBe('emit');
  });

  it('still accepts empty options object (API-03 backward compatibility)', () => {
    const options: WakeWordInitializationOptions = {};
    expect(options).toBeDefined();
  });
});

// ─── Tests 4–7: VoiceActivatorApi enrollment methods ─────────────────────────

describe('VoiceActivatorApi — enrollment methods', () => {
  it('includes enrollSpeaker(userId: string, audioBuffer: ArrayBuffer): Promise<void>', () => {
    type EnrollSpeaker = VoiceActivatorApi['enrollSpeaker'];
    // Type-level check: the method signature must be assignable
    const mockEnroll: EnrollSpeaker = async (
      _userId: string,
      _buf: ArrayBuffer
    ) => undefined;
    expect(typeof mockEnroll).toBe('function');
  });

  it('includes exportEnrollment(): Promise<EnrollmentData>', () => {
    type ExportEnrollment = VoiceActivatorApi['exportEnrollment'];
    const mockData: EnrollmentData = { version: 1, speakers: {} };
    const mockExport: ExportEnrollment = async () => mockData;
    expect(typeof mockExport).toBe('function');
  });

  it('includes importEnrollment(data: EnrollmentData): Promise<void>', () => {
    type ImportEnrollment = VoiceActivatorApi['importEnrollment'];
    const mockImport: ImportEnrollment = async (_data: EnrollmentData) =>
      undefined;
    expect(typeof mockImport).toBe('function');
  });

  it('includes clearEnrollment(): Promise<void>', () => {
    type ClearEnrollment = VoiceActivatorApi['clearEnrollment'];
    const mockClear: ClearEnrollment = async () => undefined;
    expect(typeof mockClear).toBe('function');
  });
});

// ─── Test 8: session-events listeners registry includes new events ────────────

describe('session-events — listeners registry', () => {
  it('supports adding and emitting speakerVerificationPassed via session event API', () => {
    const received: SpeakerVerificationPassedEvent[] = [];

    const sub = addSessionListener('speakerVerificationPassed', (payload) => {
      received.push(payload);
    });

    emitSessionEvent('speakerVerificationPassed', {
      score: 0.9,
      speakerId: 'user-42',
    });

    sub.remove();

    expect(received).toEqual([{ score: 0.9, speakerId: 'user-42' }]);
  });

  it('supports adding and emitting speakerVerificationFailed via session event API', () => {
    const received: SpeakerVerificationFailedEvent[] = [];

    const sub = addSessionListener('speakerVerificationFailed', (payload) => {
      received.push(payload);
    });

    emitSessionEvent('speakerVerificationFailed', { score: 0.1 });

    sub.remove();

    expect(received).toEqual([{ score: 0.1 }]);
  });

  it('remove() unregisters the listener so subsequent emits are not received', () => {
    const received: SpeakerVerificationPassedEvent[] = [];

    const sub = addSessionListener('speakerVerificationPassed', (payload) => {
      received.push(payload);
    });
    sub.remove();

    emitSessionEvent('speakerVerificationPassed', {
      score: 0.8,
      speakerId: 'user-99',
    });

    expect(received).toHaveLength(0);
  });
});
