jest.mock('../NativeVoiceActivator', () => ({
  __esModule: true,
  default: {
    extractSpeakerEmbedding: jest.fn(async () => 'AAAA'),
    registerSpeaker: jest.fn(async () => undefined),
    verifySpeaker: jest.fn(async () => ({ matched: false, score: 0 })),
    identifySpeaker: jest.fn(async () => ({ name: null, score: 0 })),
    clearSpeakers: jest.fn(async () => undefined),
    detectSpoofing: jest.fn(async () => 0.0),
  },
}));

import { SherpaOnnxSpeakerVerificationAdapter } from '../providers/speaker-verification';
import type { SpeakerVerificationProvider } from '../public/types';
import path from 'node:path';
import { existsSync } from 'node:fs';

describe('SpeakerVerificationProvider interface contract', () => {
  it('SherpaOnnxSpeakerVerificationAdapter satisfies SpeakerVerificationProvider', () => {
    const adapter: SpeakerVerificationProvider =
      new SherpaOnnxSpeakerVerificationAdapter();
    expect(adapter).toBeDefined();
  });

  it('has enrollSpeaker method with correct signature', () => {
    const adapter = new SherpaOnnxSpeakerVerificationAdapter();
    expect(typeof adapter.enrollSpeaker).toBe('function');
  });

  it('has verifySpeaker method with correct signature', () => {
    const adapter = new SherpaOnnxSpeakerVerificationAdapter();
    expect(typeof adapter.verifySpeaker).toBe('function');
  });

  it('has identifySpeaker method with correct signature', () => {
    const adapter = new SherpaOnnxSpeakerVerificationAdapter();
    expect(typeof adapter.identifySpeaker).toBe('function');
  });

  it('has exportEnrollment method with correct signature', () => {
    const adapter = new SherpaOnnxSpeakerVerificationAdapter();
    expect(typeof adapter.exportEnrollment).toBe('function');
  });

  it('has importEnrollment method with correct signature', () => {
    const adapter = new SherpaOnnxSpeakerVerificationAdapter();
    expect(typeof adapter.importEnrollment).toBe('function');
  });

  it('has clearEnrollment method with correct signature', () => {
    const adapter = new SherpaOnnxSpeakerVerificationAdapter();
    expect(typeof adapter.clearEnrollment).toBe('function');
  });

  it('detectSpoofing is optional on the interface', () => {
    const minimal: SpeakerVerificationProvider = {
      enrollSpeaker: async () => undefined,
      verifySpeaker: async () => ({ matched: false, score: 0 }),
      identifySpeaker: async () => ({ name: null, score: 0 }),
      exportEnrollment: async () => ({ version: 1, speakers: {} }),
      importEnrollment: async () => undefined,
      clearEnrollment: async () => undefined,
    };
    expect(minimal.detectSpoofing).toBeUndefined();
  });
});

describe('WAV fixtures exist', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const fixtures = [
    'speaker-a-enrolled.wav',
    'speaker-a-noisy.wav',
    'speaker-b-different.wav',
  ];

  it.each(fixtures)('%s is present in src/__tests__/fixtures/', (filename) => {
    expect(existsSync(path.join(fixturesDir, filename))).toBe(true);
  });
});
