import type {
  ModelBundleStatus,
  ModelPreparationOptions,
  ModelPreparationResult,
} from '../internal/model-store';

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

export interface BuiltInProviderProgress {
  message: string;
  progress?: number;
}

export type WhisperRNSTTModelId = 'whisper-tiny-en';

export interface WhisperRNSTTConfig {
  modelId: WhisperRNSTTModelId;
  maxRecordingMs?: number;
}

export interface CustomTTSConfig {
  /** Absolute local file path to the Piper TTS `.onnx` model */
  modelPath: string;
  /** PCM sample rate produced by this model. Default: 22050 Hz (Piper standard). */
  sampleRate?: 16000 | 22050;
  /** Speaker ID for multi-speaker models. Omit for single-speaker models. */
  speakerId?: number;
  /**
   * Converts input text to Piper TTS espeak-ng phoneme IDs.
   * Required — phoneme tables are model-specific.
   */
  phonemize: (text: string) => BigInt64Array | Promise<BigInt64Array>;
}

export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(): Promise<TranscriptionResult>;
  cancel(): Promise<void>;
  /**
   * Transcribe a 16 kHz mono PCM WAV already on disk. Used by the voice session when
   * `VoiceSessionConfig.vad` is set (VAD-buffered utterance). Optional — required only for that path.
   */
  transcribeFromWavPath?(filePath: string): Promise<TranscriptionResult>;
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
  /**
   * When `true`, the single-shot flow automatically calls `ttsProvider.speak()`
   * with nothing but the transcript after `transcriptionResult` is emitted.
   *
   * Defaults to `false`, which means transcription runs but no speech is
   * produced until you call the TTS provider yourself. This option has no
   * effect on the managed `session` flow, which always speaks the AI handler's
   * response.
   */
  autoSpeak?: boolean;
  /**
   * Bound, in milliseconds, on a single `sttProvider.transcribe()` or
   * `ttsProvider.speak()` call. Defaults to `30000`.
   *
   * Provider orchestration runs on one shared serial queue, so a provider call
   * that never settles would otherwise block every subsequent wake word for the
   * lifetime of the process. Neither provider interface can guarantee its own
   * `cancel()`/`stop()` unblocks a pending call, so this bound is the backstop.
   *
   * On expiry the package emits `transcriptionError` with code `stt_timeout` or
   * `speechError` with code `tts_timeout`, calls the provider's
   * `cancel()`/`stop()`, and frees the queue.
   *
   * Set to `0` to disable the bound. Only do that if your providers guarantee
   * they always settle.
   */
  providerTimeoutMs?: number;
  session?: VoiceSessionConfig;
  speakerVerificationProvider?: SpeakerVerificationProvider;
  /** Android asset path to the Sherpa-ONNX speaker embedding ONNX model (e.g. 'SherpaOnnxSpeaker/model.onnx'). Required when using SherpaOnnxSpeakerVerificationAdapter on Android. */
  speakerModelPath?: string;
  audioPreprocessingProvider?: AudioPreprocessingProvider;
  antiSpoofingProvider?: AntiSpoofingProvider;
  spoofingThreshold?: number;
  verificationThreshold?: number;
  verificationFailureBehavior?: 'open' | 'closed' | 'emit';
  vadGateEnabled?: boolean;
  vadGateThreshold?: number;
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

export interface UseVoiceSessionSnapshot {
  /** Current state of the active session, or null when no session is active. */
  sessionState: VoiceSessionState | null;
  /** Most recent transcript text from the current or last session. null before first transcription. */
  lastTranscript: string | null;
  /** Most recent speech text (AI response) from the current or last session. null before first turn. */
  lastSpeechText: string | null;
  /** Most recent session error. null if no error has occurred. */
  lastError: VoiceSessionErrorEvent | null;
  /** Number of fully completed turns (1-based). 0 before any turn completes. */
  turnCount: number;
}

export interface UseVoiceSessionResult extends UseVoiceSessionSnapshot {
  /** In manual mode: starts the next turn if the session is idle. No-op in all other states. */
  listen(): Promise<void>;
  /** Closes the active session immediately. No-op if no session is active. */
  close(): Promise<void>;
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

export type AudioRoute = 'default' | 'speaker' | 'earpiece' | 'bluetooth';

export interface VoiceActivatorApi {
  /**
   * Download the wake word models if they are not already present.
   *
   * The models are not shipped in the npm package. Call this once — typically
   * behind your own "set up voice" affordance — before `initialize()`. It is
   * idempotent, so calling it on every launch costs only a checksum check once
   * the bundle is complete.
   *
   * `initialize()` rejects with a non-recoverable `models_not_prepared` error if
   * the models are absent, rather than downloading them implicitly: a
   * multi-megabyte network transfer should be something the app chooses and can
   * show progress for.
   */
  prepareModels(
    options?: ModelPreparationOptions
  ): Promise<ModelPreparationResult>;
  /** Whether the model bundle is present and passes verification. */
  getModelStatus(): Promise<ModelBundleStatus>;
  initialize(options?: WakeWordInitializationOptions): Promise<void>;
  startDetection(): Promise<void>;
  stopDetection(): Promise<void>;
  getStatus(): WakeWordStatus;
  dispose(): Promise<void>;
  setAudioRoute(route: AudioRoute): Promise<void>;
  addListener<TEventName extends WakeWordEventName>(
    eventName: TEventName,
    listener: WakeWordEventListener<TEventName>
  ): WakeWordSubscription;
  enrollSpeaker(userId: string, audioBuffer: ArrayBuffer): Promise<void>;
  exportEnrollment(): Promise<EnrollmentData>;
  importEnrollment(data: EnrollmentData): Promise<void>;
  clearEnrollment(): Promise<void>;
}

export type {
  ModelBundleManifest,
  ModelBundleStatus,
  ModelFileSpec,
  ModelPreparationOptions,
  ModelPreparationProgress,
  ModelPreparationResult,
} from '../internal/model-store';

// ─── Voice Session Types ─────────────────────────────────────────────────────

export const voiceSessionStates = [
  'idle',
  'listening',
  'transcribing',
  'waiting',
  'speaking',
  'closed',
] as const;

export type VoiceSessionState = (typeof voiceSessionStates)[number];

export type AIHandler = (transcript: string) => Promise<string>;

/** Voice-activity detection tuning for bundled Silero VAD. */
export interface VADConfig {
  /**
   * Absolute filesystem path to silero_vad.onnx.
   *
   * Required on Android: onnxruntime-react-native no longer resolves the
   * `asset://` scheme (its Java module only exposes install(); the old
   * bridge loadModel() that parsed asset URIs is gone), so the bundled APK
   * asset must be extracted to disk by the app first — e.g. with
   * RNFS.copyFileAssets('silero_vad.onnx', dest).
   *
   * Omit on iOS, where ORT resolves the bare filename from the main bundle.
   */
  modelPath?: string;
  /** Silence duration (ms) after speech before speechEnd fires. Default: 1500 */
  silenceTimeoutMs?: number;
  /** Speech-edge padding (ms) on speechEnd for STT. Default: 300 */
  speechPadMs?: number;
  /** Speech onset probability threshold (0–1). Default: 0.5 */
  threshold?: number;
  /** Silence probability threshold (0–1). Default: 0.35 */
  silenceThreshold?: number;
}

export interface VoiceSessionConfig {
  aiHandler: AIHandler;
  reListenMode: 'auto' | 'manual';
  /** Session-level: closes session if user never speaks — not VAD debounce. */
  silenceTimeoutMs?: number;
  maxTurns?: number;
  vad?: VADConfig;
  /**
   * Bound, in milliseconds, on a single `transcribe()` or `speak()` call inside
   * a session turn. Defaults to `30000`.
   *
   * `silenceTimeoutMs` only arms during the listening stage and is cleared as
   * soon as STT resolves, so it does not cover a provider that hangs. Without
   * this bound a wedged provider strands the turn with no recovery path other
   * than an external `close()`.
   *
   * Set to `0` to disable.
   */
  providerTimeoutMs?: number;
  /**
   * Bound, in milliseconds, on the `aiHandler` call. Defaults to `60000`.
   *
   * Usually a network round-trip to an LLM, so the likeliest of the three to
   * hang. On expiry the turn emits `sessionError` with code
   * `ai_handler_timeout` and the session closes rather than sitting in the
   * `waiting` stage forever.
   *
   * Set to `0` to disable.
   */
  aiHandlerTimeoutMs?: number;
}

export interface VoiceSessionStartedEvent {}

export interface VoiceSessionListeningEvent {}

export interface VoiceSessionTranscribedEvent {
  text: string;
}

export interface VoiceSessionSpeakingEvent {
  text: string;
}

export interface VoiceSessionTurnCompleteEvent {
  /** 1-based turn number (first turn = 1). */
  turn: number;
}

export interface VoiceSessionEndedEvent {
  reason: 'timeout' | 'explicit';
}

export interface VoiceSessionErrorEvent extends WakeWordError {}

/**
 * Identifies which `SileroVADEngine` instance emitted a speech event.
 *
 * More than one engine can be live at once — the pre-wake gate
 * (`vadGateEnabled`) and the session utterance detector (`session.vad`) each
 * own one, and both publish to the same session event bus. Subscribers that
 * care about a specific engine MUST filter on this field; without it a gate
 * event can be mistaken for an utterance boundary and truncate a turn.
 */
export interface VoiceSessionSpeechEventSource {
  /** Stable per-engine id. Absent only on events from a pre-0.2 native path. */
  sourceId?: string;
}

/** Fired when bundled Silero VAD detects speech onset during an active session. */
export interface VoiceSessionSpeechStartEvent extends VoiceSessionSpeechEventSource {}

/** Fired when bundled Silero VAD detects speech offset during an active session. */
export interface VoiceSessionSpeechEndEvent extends VoiceSessionSpeechEventSource {
  /** Duration of detected speech in milliseconds */
  durationMs: number;
  /** Speech-edge padding (ms) for STT after speechEnd. */
  speechPadMs: number;
}

/** @deprecated Use {@link VoiceSessionSpeechStartEvent} */
export type VoiceSessionVADSpeechStartEvent = VoiceSessionSpeechStartEvent;

/** @deprecated Use {@link VoiceSessionSpeechEndEvent} */
export type VoiceSessionVADSpeechEndEvent = VoiceSessionSpeechEndEvent;

/** Fired when the enrolled speaker is successfully verified post-wake-word. */
export interface SpeakerVerificationPassedEvent {
  score: number;
  speakerId: string;
}

/** Fired when speaker verification fails post-wake-word. */
export interface SpeakerVerificationFailedEvent {
  score: number;
}

export interface VoiceSessionEventMap {
  sessionStarted: VoiceSessionStartedEvent;
  sessionListening: VoiceSessionListeningEvent;
  sessionTranscribed: VoiceSessionTranscribedEvent;
  sessionSpeaking: VoiceSessionSpeakingEvent;
  sessionTurnComplete: VoiceSessionTurnCompleteEvent;
  sessionEnded: VoiceSessionEndedEvent;
  sessionError: VoiceSessionErrorEvent;
  speechStart: VoiceSessionSpeechStartEvent;
  speechEnd: VoiceSessionSpeechEndEvent;
  speakerVerificationPassed: SpeakerVerificationPassedEvent;
  speakerVerificationFailed: SpeakerVerificationFailedEvent;
}

export type VoiceSessionEventName = keyof VoiceSessionEventMap;

export type VoiceSessionEventListener<
  TEventName extends VoiceSessionEventName,
> = (payload: VoiceSessionEventMap[TEventName]) => void;

export interface VoiceSessionSubscription {
  remove(): void;
}

export interface VoiceSession {
  readonly state: VoiceSessionState;
  listen(): Promise<void>;
  close(): Promise<void>;
  addListener<TEventName extends VoiceSessionEventName>(
    eventName: TEventName,
    listener: VoiceSessionEventListener<TEventName>
  ): VoiceSessionSubscription;
}

// ─── Speaker Verification Types ─────────────────────────────────────────────

export type EnrollmentData = {
  version: 1;
  speakers: Record<string, { embeddings: string[]; sampleCount: number }>;
};

export interface SpeakerVerificationProvider {
  enrollSpeaker(
    userId: string,
    audioBuffer: ArrayBuffer,
    sampleRate: number
  ): Promise<void>;
  verifySpeaker(
    userId: string,
    audioBuffer: ArrayBuffer,
    sampleRate: number,
    threshold: number
  ): Promise<{ matched: boolean; score: number }>;
  identifySpeaker(
    audioBuffer: ArrayBuffer,
    sampleRate: number,
    threshold: number
  ): Promise<{ name: string | null; score: number }>;
  exportEnrollment(): Promise<EnrollmentData>;
  importEnrollment(data: EnrollmentData): Promise<void>;
  clearEnrollment(): Promise<void>;
  detectSpoofing?(pcmBuffer: ArrayBuffer, sampleRate: number): Promise<number>;
}

export interface AudioPreprocessingProvider {
  process(audioBuffer: ArrayBuffer, sampleRate: number): Promise<ArrayBuffer>;
}

export interface AntiSpoofingProvider {
  detectSpoofing(pcmBuffer: ArrayBuffer, sampleRate: number): Promise<number>;
}
