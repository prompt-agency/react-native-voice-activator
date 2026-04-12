// Hand-written type declarations for onnxruntime-react-native (Microsoft, MIT)
// Derived from the public API documentation and onnxruntime-react-native v1.20+ source.
//
// CRITICAL: This is a compile-time shim only. The actual package is an optional
// peer dep; all runtime imports must use dynamic `await import(...)` inside
// async methods — never top-level static imports.

declare module 'onnxruntime-react-native' {
  type TensorType = 'float32' | 'int64' | 'int32' | 'bool' | 'string';

  export class Tensor {
    readonly type: TensorType;
    readonly data:
      | Float32Array
      | BigInt64Array
      | Int32Array
      | readonly string[];
    readonly dims: readonly number[];
    constructor(
      type: TensorType,
      data: ArrayLike<number | bigint | boolean | string>,
      dims: readonly number[]
    );
  }

  export interface InferenceSessionRunOptions {
    logSeverityLevel?: 0 | 1 | 2 | 3 | 4;
  }

  export interface InferenceSession {
    run(
      feeds: Record<string, Tensor>,
      options?: InferenceSessionRunOptions
    ): Promise<Record<string, Tensor>>;
    release(): Promise<void>;
    readonly inputNames: readonly string[];
    readonly outputNames: readonly string[];
  }

  export namespace InferenceSession {
    interface SessionOptions {
      executionProviders?: Array<'cpu' | 'coreml' | 'nnapi'>;
      graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
      interOpNumThreads?: number;
      intraOpNumThreads?: number;
    }
    function create(
      modelPath: string,
      options?: SessionOptions
    ): Promise<InferenceSession>;
  }
}
