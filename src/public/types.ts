export const wakeWordStates = [
  'idle',
  'initializing',
  'ready',
  'starting',
  'running',
  'interrupted',
  'stopping',
  'stopped',
  'error',
  'unsupported',
] as const;

export type WakeWordState = (typeof wakeWordStates)[number];

export type WakeWordErrorCategory =
  | 'permission'
  | 'lifecycle'
  | 'configuration'
  | 'engine'
  | 'platform'
  | 'internal';

export type WakeWordEngineId = 'default' | (string & {});
export type WakeWordEngineAssetRequirement = 'none' | 'bundled' | 'optional';

export interface WakeWordEngineSelection {
  id: WakeWordEngineId;
  variant?: string;
}

export interface WakeWordEngineAssetKeys {
  modelAssetKey?: string;
  keywordAssetKey?: string;
}

export interface WakeWordEngineConfiguration {
  assetKeys?: WakeWordEngineAssetKeys;
  sensitivity?: number;
}

export interface WakeWordEngineCapabilities {
  onDeviceDetection: boolean;
  backgroundDetection: boolean;
  customKeywordAssets: boolean;
  runtimeConfigurationUpdates: boolean;
}

export interface WakeWordEngineMetadata {
  id: WakeWordEngineId;
  displayName: string;
  assetRequirement: WakeWordEngineAssetRequirement;
  capabilities: WakeWordEngineCapabilities;
}

export interface WakeWordError {
  code: string;
  category: WakeWordErrorCategory;
  message: string;
  recoverable: boolean;
  platform?: 'ios' | 'android';
}

export interface ProviderError extends WakeWordError {
  provider: string;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  provider: string;
  durationMs?: number;
}

export interface TTSOptions {
  language?: string;
  rate?: number;
  pitch?: number;
}

export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(): Promise<TranscriptionResult>;
  cancel(): Promise<void>;
}

export interface TextToSpeechProvider {
  readonly name: string;
  speak(text: string, options?: TTSOptions): Promise<void>;
  stop(): Promise<void>;
}

export interface WakeWordInitializationOptions {
  profile?: 'balanced' | 'accuracy' | 'power-save';
  enableDebugLogging?: boolean;
  engine?: WakeWordEngineSelection;
  engineConfig?: WakeWordEngineConfiguration;
  sttProvider?: SpeechToTextProvider;
  ttsProvider?: TextToSpeechProvider;
  autoSpeak?: boolean;
}

export interface WakeWordStatus {
  state: WakeWordState;
  isAvailable: boolean;
  isListening: boolean;
  canStart: boolean;
  reason?: string;
  lastError?: WakeWordError | null;
}

export interface WakeWordStateChangedEvent {
  state: WakeWordState;
  previousState?: WakeWordState;
}

export interface WakeWordDetectedEvent {
  detectedPhrase: string;
  detectedAt: string;
}

export interface WakeWordInterruptionEvent {
  reason: string;
  recoverable: boolean;
}

export interface WakeWordAudioRouteChangedEvent {
  route: string;
  previousRoute?: string;
}

export interface TranscriptionStartedEvent {
  provider: string;
}

export interface TranscriptionResultEvent extends TranscriptionResult {}

export interface TranscriptionErrorEvent extends ProviderError {}

export interface SpeechStartedEvent {
  text: string;
  provider: string;
}

export interface SpeechCompletedEvent {
  provider: string;
}

export interface SpeechErrorEvent extends ProviderError {}

export type WakeWordTranscriptionState =
  | 'idle'
  | 'transcribing'
  | 'completed'
  | 'error';

export type WakeWordSpeechState = 'idle' | 'speaking' | 'completed' | 'error';

export interface UseWakeWordTranscriptionSnapshot {
  state: WakeWordTranscriptionState;
  started: TranscriptionStartedEvent | null;
  result: TranscriptionResultEvent | null;
  error: TranscriptionErrorEvent | null;
}

export interface UseWakeWordSpeechSnapshot {
  state: WakeWordSpeechState;
  started: SpeechStartedEvent | null;
  completed: SpeechCompletedEvent | null;
  error: SpeechErrorEvent | null;
}

export interface UseWakeWordSnapshot {
  status: WakeWordStatus;
  latestWakeWordEvent: WakeWordDetectedEvent | null;
  latestRuntimeError: WakeWordError | null;
  latestInterruption: WakeWordInterruptionEvent | null;
  latestAudioRouteChange: WakeWordAudioRouteChangedEvent | null;
  transcription: UseWakeWordTranscriptionSnapshot;
  speech: UseWakeWordSpeechSnapshot;
}

export interface UseWakeWordResult extends UseWakeWordSnapshot {
  initialize: VoiceActivatorApi['initialize'];
  startDetection: VoiceActivatorApi['startDetection'];
  stopDetection: VoiceActivatorApi['stopDetection'];
  getStatus: VoiceActivatorApi['getStatus'];
  dispose: VoiceActivatorApi['dispose'];
  addWakeWordListener: VoiceActivatorApi['addListener'];
}

export interface WakeWordEventMap {
  stateChanged: WakeWordStateChangedEvent;
  wakeWordDetected: WakeWordDetectedEvent;
  error: WakeWordError;
  interruption: WakeWordInterruptionEvent;
  audioRouteChanged: WakeWordAudioRouteChangedEvent;
  transcriptionStarted: TranscriptionStartedEvent;
  transcriptionResult: TranscriptionResultEvent;
  transcriptionError: TranscriptionErrorEvent;
  speechStarted: SpeechStartedEvent;
  speechCompleted: SpeechCompletedEvent;
  speechError: SpeechErrorEvent;
}

export type VoiceActivatorEventMap = WakeWordEventMap;

export type WakeWordEventName = keyof WakeWordEventMap;

export type WakeWordEventListener<TEventName extends WakeWordEventName> = (
  payload: WakeWordEventMap[TEventName]
) => void;

export interface WakeWordSubscription {
  remove(): void;
}

export interface VoiceActivatorApi {
  initialize(options?: WakeWordInitializationOptions): Promise<void>;
  startDetection(): Promise<void>;
  stopDetection(): Promise<void>;
  getStatus(): WakeWordStatus;
  dispose(): Promise<void>;
  addListener<TEventName extends WakeWordEventName>(
    eventName: TEventName,
    listener: WakeWordEventListener<TEventName>
  ): WakeWordSubscription;
}
