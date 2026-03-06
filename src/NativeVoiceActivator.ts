import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

import type { WakeWordStatus } from './public/types';
import type { WakeWordRuntimeConfiguration } from './domain/detection-config';

export interface Spec extends TurboModule {
  initialize(options: WakeWordRuntimeConfiguration): Promise<void>;
  startDetection(): Promise<void>;
  stopDetection(): Promise<void>;
  getStatus(): WakeWordStatus;
  dispose(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>('VoiceActivator');
