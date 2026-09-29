export {
  addWakeWordListener,
  clearEnrollment,
  dispose,
  enrollSpeaker,
  exportEnrollment,
  getModelStatus,
  getSession,
  getStatus,
  importEnrollment,
  initialize,
  prepareModels,
  setAudioRoute,
  startDetection,
  stopDetection,
  voiceActivator,
} from './public/voice-activator';
export { addSessionListener } from './internal/session-events';
/**
 * Raw microphone access, sharing the package's own capture rather than opening a
 * second stream. Frames are base64 little-endian float32 at 16 kHz, which is the
 * format `enrollSpeaker()` expects.
 */
export {
  startAudioCapture,
  AUDIO_CAPTURE_SAMPLE_RATE,
} from './public/audio-capture';
export type {
  AudioCaptureFrame,
  AudioCaptureSubscription,
} from './public/audio-capture';
/**
 * Asset root of the model bundle the Expo config plugin ships into your app,
 * for apps that bundle the models instead of downloading them. Platform
 * specific: `modelAssetKey` is used verbatim and the two native loaders use
 * different roots, so this cannot be hardcoded as one string.
 */
export { BUNDLED_MODEL_ASSET_KEY } from './internal/bundled-model-asset-key';
/**
 * Non-throwing wake-phrase validation, for apps that let a user choose their own
 * trigger phrase and need feedback as they type.
 */
export { validateWakePhrase } from './internal/wake-phrase';
export type { WakePhraseValidation } from './internal/wake-phrase';
/**
 * Accuracy measurement. Exported because the numbers that decide whether a wake
 * phrase is usable — detection rate and false accepts per hour — can only be
 * produced against your own corpus, in your own acoustic conditions.
 * See docs/reliability-validation.md.
 */
export {
  chooseOperatingPoint,
  evaluateWakeWordCorpus,
  sweepWakeWordSensitivity,
} from './internal/wake-word-evaluation';
export type {
  WakeWordEvaluationCorpus,
  WakeWordEvaluationResult,
  WakeWordFileResult,
} from './internal/wake-word-evaluation';
export {
  WhisperRNSTTAdapter,
  WhisperRNSTTCancelledError,
  WhisperRNSTTUnreadableAudioError,
} from './providers/whisper-rn';
export { CustomTTSAdapter, SherpaOnnxTTSAdapter } from './providers/tts';
export type { SherpaOnnxTTSConfig } from './providers/tts';
export { SileroVADEngine } from './providers/vad';
export { SherpaOnnxSpeakerVerificationAdapter } from './providers/speaker-verification';
export { SherpaOnnxNoiseSuppressionAdapter } from './providers/noise-suppression';
export { SherpaOnnxAntiSpoofingAdapter } from './providers/anti-spoofing';
export { useWakeWord } from './public/useWakeWord';
export { useVoiceSession } from './public/useVoiceSession';
export { wakeWordStates, voiceSessionStates } from './public/types';
export type {
  AntiSpoofingProvider,
  AudioPreprocessingProvider,
  AudioRoute,
  CustomTTSConfig,
  EnrollmentData,
  WhisperRNSTTConfig,
  WhisperRNSTTModelId,
  ProviderError,
  SpeakerVerificationProvider,
  SpeechToTextProvider,
  SpeechCompletedEvent,
  SpeechErrorEvent,
  SpeechStartedEvent,
  TextToSpeechProvider,
  TranscriptionErrorEvent,
  TranscriptionResult,
  TranscriptionResultEvent,
  TranscriptionStartedEvent,
  TTSOptions,
  UseWakeWordResult,
  UseWakeWordSnapshot,
  UseWakeWordSpeechSnapshot,
  WakeWordSpeechState,
  UseWakeWordTranscriptionSnapshot,
  WakeWordTranscriptionState,
  VoiceActivatorApi,
  WakeWordEngineAssetKeys,
  WakeWordEngineAssetRequirement,
  WakeWordEngineCapabilities,
  WakeWordEngineConfiguration,
  WakeWordEngineId,
  WakeWordEngineMetadata,
  WakeWordEngineSelection,
  VoiceActivatorEventMap,
  WakeWordAudioRouteChangedEvent,
  WakeWordDetectedEvent,
  WakeWordError,
  WakeWordErrorCategory,
  WakeWordEventListener,
  WakeWordEventMap,
  WakeWordEventName,
  WakeWordInitializationOptions,
  WakeWordInterruptionEvent,
  WakeWordState,
  WakeWordStateChangedEvent,
  WakeWordStatus,
  WakeWordSubscription,
  AIHandler,
  VADConfig,
  VoiceSession,
  VoiceSessionConfig,
  VoiceSessionEndedEvent,
  VoiceSessionErrorEvent,
  VoiceSessionEventListener,
  VoiceSessionEventMap,
  VoiceSessionEventName,
  VoiceSessionListeningEvent,
  VoiceSessionSpeakingEvent,
  VoiceSessionStartedEvent,
  VoiceSessionState,
  VoiceSessionSubscription,
  VoiceSessionTranscribedEvent,
  VoiceSessionTurnCompleteEvent,
  UseVoiceSessionSnapshot,
  UseVoiceSessionResult,
  VoiceSessionSpeechStartEvent,
  VoiceSessionSpeechEndEvent,
  VoiceSessionVADSpeechStartEvent,
  VoiceSessionVADSpeechEndEvent,
  SpeakerVerificationPassedEvent,
  SpeakerVerificationFailedEvent,
} from './public/types';
