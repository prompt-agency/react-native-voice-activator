import { TurboModuleRegistry, type TurboModule } from 'react-native';

import type {
  WakeWordInitializationOptions,
  WakeWordStatus,
} from '../public/types';

export interface NativeVoiceActivatorSpec extends TurboModule {
  initialize?(options: WakeWordInitializationOptions): Promise<void>;
  startDetection?(): Promise<void>;
  stopDetection?(): Promise<void>;
  getStatus?(): WakeWordStatus;
  dispose?(): Promise<void>;
}

export const nativeVoiceActivatorModule =
  TurboModuleRegistry.get<NativeVoiceActivatorSpec>('VoiceActivator');
