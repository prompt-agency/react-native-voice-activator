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
