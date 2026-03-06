import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('documentation and example contract', () => {
  const root = process.cwd();

  it('keeps the README quickstart aligned with the current public API and limitation note', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');

    expect(readme).toContain('addWakeWordListener');
    expect(readme).toContain('async function runQuickstart()');
    expect(readme).toContain('initialize');
    expect(readme).toContain('startDetection');
    expect(readme).toContain('stopDetection');
    expect(readme).toContain('dispose');
    expect(readme).toContain(
      'Real engine-backed local wake word detection lands in Epic 2 integration work.'
    );
    expect(readme).not.toContain('\nawait initialize();\n');
  });

  it('keeps the example app aligned with the public runtime flow and limitation note', () => {
    const exampleApp = readFileSync(join(root, 'example/src/App.tsx'), 'utf8');

    expect(exampleApp).toContain('addWakeWordListener');
    expect(exampleApp).toContain('getStatus');
    expect(exampleApp).toContain('initialize');
    expect(exampleApp).toContain('startDetection');
    expect(exampleApp).toContain('stopDetection');
    expect(exampleApp).toContain('dispose');
    expect(exampleApp).toContain(
      'Real built-in wake word detection is scheduled for Epic 2.'
    );
  });
});
