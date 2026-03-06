import type {
  WakeWordInitializationOptions,
  WakeWordStatus,
} from '../public/types';

export interface VoiceActivatorRuntimeBridge {
  initialize(options: WakeWordInitializationOptions): Promise<void>;
  startDetection(): Promise<void>;
  stopDetection(): Promise<void>;
  getStatus(): WakeWordStatus;
  dispose(): Promise<void>;
}
