import path from 'node:path';
import { existsSync } from 'node:fs';

describe('SpeakerVerificationProvider interface contract', () => {
  it.todo('SherpaOnnxSpeakerVerificationAdapter satisfies SpeakerVerificationProvider');
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
