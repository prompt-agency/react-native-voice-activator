import type { WakeWordStatus } from '../public/types';
import type { NativeWakeWordRuntimeConfiguration } from '../domain/detection-config';

export interface VoiceActivatorRuntimeBridge {
  initialize(options: NativeWakeWordRuntimeConfiguration): Promise<void>;
  startDetection(): Promise<void>;
  stopDetection(): Promise<void>;
  getStatus(): WakeWordStatus;
  dispose(): Promise<void>;
  /** iOS TTS route; optional so unsupported / partial bridges can omit it. */
  setAudioRoute?(route: string): Promise<void>;
}
