import type { WakeWordStatus } from '../public/types';
import type { WakeWordRuntimeConfiguration } from '../domain/detection-config';

export interface VoiceActivatorRuntimeBridge {
  initialize(options: WakeWordRuntimeConfiguration): Promise<void>;
  startDetection(): Promise<void>;
  stopDetection(): Promise<void>;
  getStatus(): WakeWordStatus;
  dispose(): Promise<void>;
}
