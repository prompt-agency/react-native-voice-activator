import type { ModelCategory } from './runanywhere-core';

export enum ModelArtifactType {
  TarGzArchive = 'tarGzArchive',
}

export interface ONNXModelOptions {
  id: string;
  name: string;
  url: string;
  modality: ModelCategory;
  artifactType: ModelArtifactType;
  memoryRequirement?: number;
}

export const ONNX = null as unknown as {
  register(): void;
  addModel(options: ONNXModelOptions): Promise<unknown>;
};

export const ONNXProvider = null as unknown as {
  register(): Promise<boolean>;
};

export interface NativeRunAnywhereONNXModule {
  loadTTSModel(
    path: string,
    modelType: string,
    configJson?: string
  ): Promise<boolean>;
  unloadTTSModel(): Promise<boolean>;
  synthesize(
    text: string,
    voiceId: string,
    speedRate: number,
    pitchShift: number
  ): Promise<string>;
}

export function requireNativeONNXModule(): NativeRunAnywhereONNXModule {
  return null as unknown as NativeRunAnywhereONNXModule;
}
