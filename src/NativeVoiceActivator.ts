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
  startVADCapture(sampleRate: number): Promise<void>;
  stopVADCapture(): Promise<void>;
  synthesizeTTS(options: CodegenTypes.UnsafeObject): Promise<void>;

  // Phase 1 — Speaker Embedding (BRIDGE-01)
  extractSpeakerEmbedding(
    pcmBase64: string,
    sampleRate: number
  ): Promise<string>;

  // Phase 1 — Speaker Registration (BRIDGE-02)
  registerSpeaker(name: string, embeddingBase64: string): Promise<void>;

  // Phase 1 — Speaker Verification (BRIDGE-03)
  // Returns UnsafeObject with shape: { matched: boolean, score: number }
  verifySpeaker(
    name: string,
    embeddingBase64: string,
    threshold: number
  ): Promise<CodegenTypes.UnsafeObject>;

  // Phase 1 — Speaker Identification (BRIDGE-04)
  // Returns UnsafeObject with shape: { name: string | null, score: number }
  identifySpeaker(
    embeddingBase64: string,
    threshold: number
  ): Promise<CodegenTypes.UnsafeObject>;

  // Phase 1 — Clear Speakers (BRIDGE-05)
  clearSpeakers(): Promise<void>;

  // Phase 1 — Audio Denoising (BRIDGE-06)
  denoiseAudio(pcmBase64: string, sampleRate: number): Promise<string>;

  // Phase 1 — Anti-Spoofing (SPOOF-01)
  // Returns spoof probability 0-1 (stub: returns 0.0 until anti-spoofing model available)
  detectSpoofing(pcmBase64: string, sampleRate: number): Promise<number>;
}

export default TurboModuleRegistry.get<Spec>('VoiceActivator');
