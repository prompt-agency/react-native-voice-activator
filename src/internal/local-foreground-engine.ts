import type { WakeWordDetectedEvent } from '../public/types';
import type { WakeWordRuntimeConfiguration } from '../domain/detection-config';

export interface LocalForegroundEngine {
  configure(options: WakeWordRuntimeConfiguration): void;
  scheduleDetection(
    onDetected: (event: WakeWordDetectedEvent) => void
  ): ReturnType<typeof setTimeout>;
}

const DEFAULT_DETECTED_PHRASE = 'hey react native';

export function createLocalForegroundEngine(): LocalForegroundEngine {
  let detectedPhrase = DEFAULT_DETECTED_PHRASE;

  return {
    configure(_options) {
      detectedPhrase = DEFAULT_DETECTED_PHRASE;
    },
    scheduleDetection(onDetected) {
      return setTimeout(() => {
        onDetected({
          detectedPhrase,
          detectedAt: new Date().toISOString(),
        });
      }, 0);
    },
  };
}
