import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

import type {
  WakeWordInitializationOptions,
  WakeWordStatus,
} from './public/types';

export interface Spec extends TurboModule {
  initialize(options: WakeWordInitializationOptions): Promise<void>;
  startDetection(): Promise<void>;
  stopDetection(): Promise<void>;
  getStatus(): WakeWordStatus;
  dispose(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('VoiceActivator');
