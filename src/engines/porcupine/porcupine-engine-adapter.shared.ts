import {
  BuiltInKeywords,
  PorcupineErrors,
  PorcupineManager,
} from '@picovoice/porcupine-react-native';

import type { WakeWordRuntimeConfiguration } from '../../domain/detection-config';
import type { VoiceActivatorEngineRuntime } from '../../internal/engine-runtime';
import type {
  WakeWordDetectedEvent,
  WakeWordError,
  WakeWordEngineConfiguration,
  WakeWordEngineMetadata,
  WakeWordEngineMetadataValue,
} from '../../public/types';

type PorcupineKeywordSource =
  | {
      type: 'builtin';
      builtInKeyword: BuiltInKeywords;
      detectedPhrase: string;
    }
  | {
      type: 'path';
      keywordPath: string;
      detectedPhrase: string;
    };

type PorcupineRuntimeOptions = {
  accessKey: string;
  keywordSource: PorcupineKeywordSource;
  modelPath?: string;
  sensitivity: number;
};

type PorcupineManagerLike = {
  start(): Promise<void>;
  stop(): Promise<void>;
  delete(): void;
};

type CreatePorcupineManager = (
  options: PorcupineRuntimeOptions,
  onDetected: (event: WakeWordDetectedEvent) => void,
  onError: (error: WakeWordError) => void
) => Promise<PorcupineManagerLike>;

const DEFAULT_DETECTED_PHRASE = 'porcupine';

const BUILT_IN_KEYWORD_MAP: Record<
  string,
  {
    keyword: BuiltInKeywords;
    detectedPhrase: string;
  }
> = {
  'alexa': { keyword: BuiltInKeywords.ALEXA, detectedPhrase: 'alexa' },
  'americano': {
    keyword: BuiltInKeywords.AMERICANO,
    detectedPhrase: 'americano',
  },
  'blueberry': {
    keyword: BuiltInKeywords.BLUEBERRY,
    detectedPhrase: 'blueberry',
  },
  'bumblebee': {
    keyword: BuiltInKeywords.BUMBLEBEE,
    detectedPhrase: 'bumblebee',
  },
  'computer': {
    keyword: BuiltInKeywords.COMPUTER,
    detectedPhrase: 'computer',
  },
  'grapefruit': {
    keyword: BuiltInKeywords.GRAPEFRUIT,
    detectedPhrase: 'grapefruit',
  },
  'grasshopper': {
    keyword: BuiltInKeywords.GRASSHOPPER,
    detectedPhrase: 'grasshopper',
  },
  'hey google': {
    keyword: BuiltInKeywords.HEY_GOOGLE,
    detectedPhrase: 'hey google',
  },
  'hey siri': {
    keyword: BuiltInKeywords.HEY_SIRI,
    detectedPhrase: 'hey siri',
  },
  'jarvis': { keyword: BuiltInKeywords.JARVIS, detectedPhrase: 'jarvis' },
  'ok google': {
    keyword: BuiltInKeywords.OK_GOOGLE,
    detectedPhrase: 'ok google',
  },
  'picovoice': {
    keyword: BuiltInKeywords.PICOVOICE,
    detectedPhrase: 'picovoice',
  },
  'porcupine': {
    keyword: BuiltInKeywords.PORCUPINE,
    detectedPhrase: 'porcupine',
  },
  'terminator': {
    keyword: BuiltInKeywords.TERMINATOR,
    detectedPhrase: 'terminator',
  },
};

function isStringMetadataValue(
  value: WakeWordEngineMetadataValue | undefined
): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeSensitivity(
  configuration: WakeWordEngineConfiguration
): number {
  const sensitivity = configuration.sensitivity ?? 0.5;

  if (sensitivity < 0 || sensitivity > 1) {
    throw createConfigurationError(
      'invalid_sensitivity',
      'Engine sensitivity must be a number between 0 and 1.'
    );
  }

  return sensitivity;
}

function resolveAccessKey(configuration: WakeWordEngineConfiguration): string {
  const accessKey = configuration.metadata?.accessKey;

  if (!isStringMetadataValue(accessKey)) {
    throw createConfigurationError(
      'missing_access_key',
      'The built-in wake word engine requires an access key in engineConfig.metadata.accessKey.'
    );
  }

  return accessKey;
}

function resolveKeywordSource(
  configuration: WakeWordEngineConfiguration
): PorcupineKeywordSource {
  const keywordAssetKey = configuration.assetKeys?.keywordAssetKey?.trim();

  if (!keywordAssetKey) {
    return {
      type: 'builtin',
      builtInKeyword: BuiltInKeywords.PORCUPINE,
      detectedPhrase: DEFAULT_DETECTED_PHRASE,
    };
  }

  const normalizedKeywordKey = keywordAssetKey.toLowerCase();
  const builtInKeyword = BUILT_IN_KEYWORD_MAP[normalizedKeywordKey];
  if (builtInKeyword) {
    return {
      type: 'builtin',
      builtInKeyword: builtInKeyword.keyword,
      detectedPhrase: builtInKeyword.detectedPhrase,
    };
  }

  return {
    type: 'path',
    keywordPath: resolveCustomAssetPath('keyword', keywordAssetKey),
    detectedPhrase: keywordAssetKey.split(/[\\/]/).pop() ?? keywordAssetKey,
  };
}

function resolveCustomAssetPath(
  assetKind: 'keyword' | 'model',
  assetKey: string
): string {
  if (assetKey.startsWith('file://') || assetKey.startsWith('/')) {
    return assetKey;
  }

  throw createConfigurationError(
    `invalid_${assetKind}_asset_key`,
    `The built-in wake word engine requires ${assetKind} assets to be provided as built-in keywords, absolute paths, or file:// URLs.`
  );
}

function resolveModelPath(
  configuration: WakeWordEngineConfiguration
): string | undefined {
  const modelAssetKey = configuration.assetKeys?.modelAssetKey?.trim();
  return modelAssetKey
    ? resolveCustomAssetPath('model', modelAssetKey)
    : undefined;
}

function resolveRuntimeOptions(
  configuration: WakeWordRuntimeConfiguration
): PorcupineRuntimeOptions {
  return {
    accessKey: resolveAccessKey(configuration.engineConfig),
    keywordSource: resolveKeywordSource(configuration.engineConfig),
    modelPath: resolveModelPath(configuration.engineConfig),
    sensitivity: normalizeSensitivity(configuration.engineConfig),
  };
}

function normalizeEngineError(error: unknown): WakeWordError {
  if (error instanceof Error) {
    return {
      category: 'engine',
      code: normalizeEngineErrorCode(error),
      message: error.message,
      recoverable: true,
    };
  }

  return {
    category: 'engine',
    code: 'engine_runtime_failed',
    message: 'The built-in wake word engine failed unexpectedly.',
    recoverable: true,
  };
}

function isPorcupineErrorInstance(error: Error, candidate: unknown): boolean {
  return (
    typeof candidate === 'function' &&
    error instanceof (candidate as typeof Error)
  );
}

function normalizeEngineErrorCode(error: Error): string {
  if (
    isPorcupineErrorInstance(error, PorcupineErrors.PorcupineActivationError)
  ) {
    return 'engine_activation_failed';
  }
  if (
    isPorcupineErrorInstance(
      error,
      PorcupineErrors.PorcupineActivationLimitError
    )
  ) {
    return 'engine_activation_limit_reached';
  }
  if (
    isPorcupineErrorInstance(
      error,
      PorcupineErrors.PorcupineActivationRefusedError
    )
  ) {
    return 'engine_activation_refused';
  }
  if (
    isPorcupineErrorInstance(
      error,
      PorcupineErrors.PorcupineActivationThrottledError
    )
  ) {
    return 'engine_activation_throttled';
  }
  if (
    isPorcupineErrorInstance(
      error,
      PorcupineErrors.PorcupineInvalidArgumentError
    )
  ) {
    return 'engine_invalid_argument';
  }
  if (
    isPorcupineErrorInstance(error, PorcupineErrors.PorcupineInvalidStateError)
  ) {
    return 'engine_invalid_state';
  }
  if (isPorcupineErrorInstance(error, PorcupineErrors.PorcupineIOError)) {
    return 'engine_asset_io_failed';
  }
  if (isPorcupineErrorInstance(error, PorcupineErrors.PorcupineKeyError)) {
    return 'engine_access_key_invalid';
  }
  if (isPorcupineErrorInstance(error, PorcupineErrors.PorcupineMemoryError)) {
    return 'engine_memory_failed';
  }
  if (isPorcupineErrorInstance(error, PorcupineErrors.PorcupineRuntimeError)) {
    return 'engine_runtime_failed';
  }

  return 'engine_runtime_failed';
}

function createConfigurationError(
  code: string,
  message: string
): WakeWordError {
  return {
    category: 'configuration',
    code,
    message,
    recoverable: true,
  };
}

async function createPorcupineManager(
  options: PorcupineRuntimeOptions,
  onDetected: (event: WakeWordDetectedEvent) => void,
  onError: (error: WakeWordError) => void
): Promise<PorcupineManagerLike> {
  const detectionCallback = (_keywordIndex: number) => {
    onDetected({
      detectedPhrase: options.keywordSource.detectedPhrase,
      detectedAt: new Date().toISOString(),
    });
  };
  const processErrorCallback = (error: Error) => {
    onError(normalizeEngineError(error));
  };
  const sensitivities = [options.sensitivity];

  if (options.keywordSource.type === 'builtin') {
    return PorcupineManager.fromBuiltInKeywords(
      options.accessKey,
      [options.keywordSource.builtInKeyword],
      detectionCallback,
      processErrorCallback,
      options.modelPath,
      undefined,
      sensitivities
    );
  }

  return PorcupineManager.fromKeywordPaths(
    options.accessKey,
    [options.keywordSource.keywordPath],
    detectionCallback,
    processErrorCallback,
    options.modelPath,
    undefined,
    sensitivities
  );
}

class PorcupineEngineRuntime implements VoiceActivatorEngineRuntime {
  private readonly createManager: CreatePorcupineManager;
  private manager: PorcupineManagerLike | null = null;
  private configuration: WakeWordRuntimeConfiguration | null = null;
  private onDetected: ((event: WakeWordDetectedEvent) => void) | null = null;
  private onError: ((error: WakeWordError) => void) | null = null;

  constructor(createManager: CreatePorcupineManager = createPorcupineManager) {
    this.createManager = createManager;
  }

  async initialize(
    configuration: WakeWordRuntimeConfiguration,
    handlers: {
      onDetected(event: WakeWordDetectedEvent): void;
      onError(error: WakeWordError): void;
    }
  ): Promise<void> {
    await this.dispose();
    this.configuration = configuration;
    this.onDetected = handlers.onDetected;
    this.onError = handlers.onError;
  }

  async start(): Promise<void> {
    if (!this.configuration || !this.onDetected || !this.onError) {
      throw new PorcupineErrors.PorcupineInvalidStateError(
        'The built-in wake word engine must be initialized before start().'
      );
    }

    if (!this.manager) {
      try {
        const runtimeOptions = resolveRuntimeOptions(this.configuration);
        this.manager = await this.createManager(
          runtimeOptions,
          this.onDetected,
          this.onError
        );
      } catch (error) {
        throw normalizeKnownEngineFailure(error);
      }
    }

    try {
      await this.manager.start();
    } catch (error) {
      throw normalizeKnownEngineFailure(error);
    }
  }

  async stop(): Promise<void> {
    if (!this.manager) {
      return;
    }

    try {
      await this.manager.stop();
    } catch (error) {
      throw normalizeKnownEngineFailure(error);
    }
  }

  async dispose(): Promise<void> {
    if (!this.manager) {
      return;
    }

    try {
      await this.manager.stop();
    } catch {
      // Best-effort stop before release.
    }

    this.manager.delete();
    this.manager = null;
    this.configuration = null;
    this.onDetected = null;
    this.onError = null;
  }
}

export function createPorcupineEngineRuntime(): VoiceActivatorEngineRuntime {
  return new PorcupineEngineRuntime();
}

function isWakeWordError(value: unknown): value is WakeWordError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'category' in value &&
    'code' in value &&
    'message' in value &&
    'recoverable' in value
  );
}

function normalizeKnownEngineFailure(error: unknown): WakeWordError {
  return isWakeWordError(error) ? error : normalizeEngineError(error);
}

export function createPorcupineEngineMetadata(
  metadata: WakeWordEngineMetadata
): WakeWordEngineMetadata {
  return {
    ...metadata,
    capabilities: {
      ...metadata.capabilities,
      onDeviceDetection: true,
    },
  };
}

export {
  createConfigurationError,
  normalizeEngineError,
  normalizeEngineErrorCode,
  resolveRuntimeOptions,
};
