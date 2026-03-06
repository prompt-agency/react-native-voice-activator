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

export interface WakeWordError {
  code: string;
  category: WakeWordErrorCategory;
  message: string;
  recoverable: boolean;
  platform?: 'ios' | 'android';
}

export interface WakeWordInitializationOptions {
  profile?: 'balanced' | 'accuracy' | 'power-save';
  enableDebugLogging?: boolean;
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

export interface WakeWordEventMap {
  stateChanged: WakeWordStateChangedEvent;
  wakeWordDetected: WakeWordDetectedEvent;
  error: WakeWordError;
  interruption: WakeWordInterruptionEvent;
  audioRouteChanged: WakeWordAudioRouteChangedEvent;
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
