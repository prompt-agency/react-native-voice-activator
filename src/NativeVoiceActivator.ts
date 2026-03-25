import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  initialize(options: CodegenTypes.UnsafeObject): Promise<void>;
  startDetection(): Promise<void>;
  stopDetection(): Promise<void>;
  getStatus(): CodegenTypes.UnsafeObject;
  dispose(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  playPCMChunk(pcmBase64: string, sampleRate: number): Promise<void>;
  playWav(filePath: string): Promise<void>;
  stopPlayback(): Promise<void>;
  setVolumeDucking(active: boolean): Promise<void>;
  setAudioRoute(route: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('VoiceActivator');
