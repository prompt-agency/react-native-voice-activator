import { useEffect, useRef, useState } from 'react';
import * as ExpoSpeech from 'expo-speech';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addWakeWordListener,
  dispose,
  getStatus,
  initialize,
  RunAnywhereSTTAdapter,
  RunAnywhereTTSAdapter,
  startDetection,
  stopDetection,
  wakeWordStates,
  type BuiltInProviderProgress,
  type WakeWordDetectedEvent,
  type WakeWordError,
  type WakeWordErrorCategory,
  type WakeWordStatus,
} from 'react-native-voice-activator';
import {
  createDemoReferenceSttBridge,
  createDemoReferenceTtsBridge,
  createReferenceProviders,
  getRunAnywhereAvailability,
  referenceProviderCatalog,
} from './reference-provider-adapters';

type RuntimeEventEntry = {
  id: string;
  label: string;
  detail: string;
};

type KeywordPreset = {
  id: string;
  label: string;
  keywordAssetKey: string;
  phraseSummary: string;
};

type ProviderMode = 'demo' | 'runanywhere';

type ManualRunAnywhereAdapters = {
  sttAdapter: RunAnywhereSTTAdapter | null;
  ttsAdapter: RunAnywhereTTSAdapter | null;
};

type ActionTone = 'primary' | 'secondary' | 'danger' | 'quiet';

function isRunAnywhereIOSPiperLoadFailure(error: unknown): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Failed to load TTS voice') ||
    message.includes('TTSBridge') ||
    message.includes('Error: -422')
  );
}

function speakWithExpoSpeech(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ExpoSpeech.speak(text, {
      language: 'en-US',
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: (event) => {
        const message =
          event instanceof Error && event.message
            ? event.message
            : 'Expo Speech failed to play audio.';
        reject(new Error(`Expo Speech failed: ${message}`));
      },
    });
  });
}

const defaultKeywordPreset: KeywordPreset = {
  id: 'all-bundled-phrases',
  label: 'All bundled phrases',
  keywordAssetKey: 'keywords.txt',
  phraseSummary:
    'HELLO WORLD, HI GOOGLE, HEY SIRI, ALEXA, LOVE AND PEACE, PLAY MUSIC, GO HOME, HAPPY NEW YEAR, MERRY CHRISTMAS',
};

const bundledKeywordPresets: KeywordPreset[] = [
  defaultKeywordPreset,
  {
    id: 'hello-world',
    label: 'HELLO WORLD',
    keywordAssetKey: 'keywords-hello-world.txt',
    phraseSummary: 'HELLO WORLD',
  },
  {
    id: 'hi-google',
    label: 'HI GOOGLE',
    keywordAssetKey: 'keywords-hi-google.txt',
    phraseSummary: 'HI GOOGLE',
  },
  {
    id: 'hey-siri',
    label: 'HEY SIRI',
    keywordAssetKey: 'keywords-hey-siri.txt',
    phraseSummary: 'HEY SIRI',
  },
  {
    id: 'alexa',
    label: 'ALEXA',
    keywordAssetKey: 'keywords-alexa.txt',
    phraseSummary: 'ALEXA',
  },
  {
    id: 'love-and-peace',
    label: 'LOVE AND PEACE',
    keywordAssetKey: 'keywords-love-and-peace.txt',
    phraseSummary: 'LOVE AND PEACE',
  },
  {
    id: 'play-music',
    label: 'PLAY MUSIC',
    keywordAssetKey: 'keywords-play-music.txt',
    phraseSummary: 'PLAY MUSIC',
  },
  {
    id: 'go-home',
    label: 'GO HOME',
    keywordAssetKey: 'keywords-go-home.txt',
    phraseSummary: 'GO HOME',
  },
  {
    id: 'happy-new-year',
    label: 'HAPPY NEW YEAR',
    keywordAssetKey: 'keywords-happy-new-year.txt',
    phraseSummary: 'HAPPY NEW YEAR',
  },
  {
    id: 'merry-christmas',
    label: 'MERRY CHRISTMAS',
    keywordAssetKey: 'keywords-merry-christmas.txt',
    phraseSummary: 'MERRY CHRISTMAS',
  },
];

const errorCategories: Array<{
  category: WakeWordErrorCategory;
  description: string;
}> = [
  {
    category: 'permission',
    description: 'Missing, denied, or revoked microphone access.',
  },
  {
    category: 'lifecycle',
    description: 'Invalid start/stop/dispose order or interruption recovery.',
  },
  {
    category: 'configuration',
    description: 'Invalid runtime, engine, or asset configuration.',
  },
  {
    category: 'engine',
    description: 'Built-in engine initialization or detection failure.',
  },
  {
    category: 'platform',
    description: 'Unsupported background, service, or OS policy condition.',
  },
  {
    category: 'internal',
    description: 'Unexpected package/runtime failure outside narrower classes.',
  },
];

const testScenarios: Array<{
  id: string;
  title: string;
  summary: string;
  steps: string[];
}> = [
  {
    id: 'wake-demo',
    title: 'Wake word with demo providers',
    summary:
      'Validates the package-owned wake runtime plus application-owned STT/TTS adapters.',
    steps: [
      'Select a bundled keyword preset.',
      'Choose Demo providers and press Initialize.',
      'Start detection, say the wake phrase, and watch transcription and speech events.',
    ],
  },
  {
    id: 'runanywhere-runtime',
    title: 'Built-in RunAnywhere runtime session',
    summary:
      'Exercises Initialize with built-in Whisper/Piper preparation and runtime orchestration.',
    steps: [
      'Choose RunAnywhere built-in.',
      'Press Initialize and wait for model preparation to finish.',
      'Start detection and confirm wake, STT, and TTS all progress without host-owned adapters.',
    ],
  },
  {
    id: 'manual-tts',
    title: 'Manual text to speech',
    summary:
      'Fastest check for Piper model loading and device speaker playback.',
    steps: [
      'Type a short sentence in the manual RunAnywhere section.',
      'Press Speak text.',
      'Confirm you hear audio and the manual status changes to completed.',
    ],
  },
  {
    id: 'manual-stt',
    title: 'Manual speech to text',
    summary:
      'Checks microphone recording, Whisper transcription, and transcript round-trip.',
    steps: [
      'Press Record and transcribe.',
      'Speak a short English sentence.',
      'Confirm the transcript appears and is copied back into the text field.',
    ],
  },
];

function ActionButton({
  label,
  description,
  onPress,
  disabled = false,
  tone = 'secondary',
}: {
  label: string;
  description?: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: ActionTone;
}) {
  const toneStyle =
    tone === 'primary'
      ? styles.actionButtonPrimary
      : tone === 'danger'
        ? styles.actionButtonDanger
        : tone === 'quiet'
          ? styles.actionButtonQuiet
          : styles.actionButtonSecondary;
  const labelStyle =
    tone === 'primary'
      ? styles.actionButtonLabelPrimary
      : tone === 'danger'
        ? styles.actionButtonLabelDanger
        : tone === 'quiet'
          ? styles.actionButtonLabelQuiet
          : styles.actionButtonLabelSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        toneStyle,
        disabled ? styles.actionButtonDisabled : null,
        pressed && !disabled ? styles.actionButtonPressed : null,
      ]}
    >
      <Text style={labelStyle}>{label}</Text>
      {description ? (
        <Text style={styles.actionButtonDescription}>{description}</Text>
      ) : null}
    </Pressable>
  );
}

export default function App() {
  const [status, setStatus] = useState<WakeWordStatus>(() => getStatus());
  const [lastDetection, setLastDetection] =
    useState<WakeWordDetectedEvent | null>(null);
  const lastDetectionRef = useRef<WakeWordDetectedEvent | null>(null);
  const [lastError, setLastError] = useState<WakeWordError | null>(
    () => getStatus().lastError ?? null
  );
  const [recentEvents, setRecentEvents] = useState<RuntimeEventEntry[]>([]);
  const [sttTranscript, setSttTranscript] = useState<string | null>(null);
  const [ttsResponse, setTtsResponse] = useState<string | null>(null);
  const [extensionStatus, setExtensionStatus] = useState<string>(
    'Wake -> transcribe -> optional speak preview is idle until initialize configures either the demo bridges or the RunAnywhere built-in path.'
  );
  const [providerMode, setProviderMode] = useState<ProviderMode>('demo');
  const [manualRunAnywhereText, setManualRunAnywhereText] = useState(
    'Hello from the RunAnywhere built-in TTS example.'
  );
  const [manualRunAnywhereTranscript, setManualRunAnywhereTranscript] =
    useState<string | null>(null);
  const [manualRunAnywhereStatus, setManualRunAnywhereStatus] =
    useState<string>('Manual RunAnywhere STT/TTS controls are idle.');
  const [selectedKeywordPresetId, setSelectedKeywordPresetId] =
    useState<string>(defaultKeywordPreset.id);
  const [activeKeywordPresetId, setActiveKeywordPresetId] = useState<
    string | null
  >(null);
  const sttBridgeRef = useRef(createDemoReferenceSttBridge());
  const ttsBridgeRef = useRef(createDemoReferenceTtsBridge());
  const manualRunAnywhereAdaptersRef = useRef<ManualRunAnywhereAdapters>({
    sttAdapter: null,
    ttsAdapter: null,
  });
  const eventSequenceRef = useRef(0);
  const selectedKeywordPreset =
    bundledKeywordPresets.find(
      (preset) => preset.id === selectedKeywordPresetId
    ) ?? defaultKeywordPreset;
  const activeKeywordPreset =
    bundledKeywordPresets.find(
      (preset) => preset.id === activeKeywordPresetId
    ) ?? null;
  const keywordSelectionRequiresInitialize =
    activeKeywordPresetId !== selectedKeywordPreset.id;
  const runAnywhereAvailability = getRunAnywhereAvailability();
  const runAnywhereAvailable =
    runAnywhereAvailability.stt || runAnywhereAvailability.tts;

  async function ensureRuntimePrerequisites(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone permission',
        message:
          'Microphone access is required to run wake-word detection in the example app.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      }
    );

    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      const permissionError: WakeWordError = {
        category: 'permission',
        code: 'record_audio_permission_denied',
        message:
          'Microphone permission was denied, so wake-word detection cannot start.',
        recoverable: true,
      };

      setLastError(permissionError);
      pushRuntimeEvent('prerequisite', 'Microphone permission denied');
      return false;
    }

    return true;
  }

  function syncDiagnosticsFromStatus(nextStatus: WakeWordStatus) {
    setStatus(nextStatus);
    setLastError(nextStatus.lastError ?? null);
  }

  function pushRuntimeEvent(label: string, detail: string) {
    setRecentEvents((currentEvents) => {
      const nextEvent: RuntimeEventEntry = {
        id: `runtime-event-${eventSequenceRef.current++}`,
        label,
        detail,
      };

      return [nextEvent, ...currentEvents].slice(0, 8);
    });
  }

  useEffect(() => {
    const stateSubscription = addWakeWordListener('stateChanged', (event) => {
      syncDiagnosticsFromStatus(getStatus());
      pushRuntimeEvent(
        'stateChanged',
        `${event.previousState ?? 'unknown'} -> ${event.state}`
      );
    });
    const detectionSubscription = addWakeWordListener(
      'wakeWordDetected',
      (event) => {
        setLastDetection(event);
        lastDetectionRef.current = event;
        setSttTranscript(null);
        setTtsResponse(null);
        setExtensionStatus(
          `Wake word detected for the active "${activeKeywordPreset?.label ?? selectedKeywordPreset.label}" preset. If reference providers were configured during initialize, runtime orchestration will emit transcription and speech events next.`
        );
        pushRuntimeEvent(
          'wakeWordDetected',
          `${event.detectedPhrase} at ${event.detectedAt}`
        );
      }
    );
    const errorSubscription = addWakeWordListener('error', (event) => {
      setLastError(event);
      syncDiagnosticsFromStatus(getStatus());
      pushRuntimeEvent('error', `${event.category}:${event.code}`);
    });
    const interruptionSubscription = addWakeWordListener(
      'interruption',
      (event) => {
        syncDiagnosticsFromStatus(getStatus());
        pushRuntimeEvent(
          'interruption',
          `${event.reason} (${event.recoverable ? 'recoverable' : 'terminal'})`
        );
      }
    );
    const routeChangeSubscription = addWakeWordListener(
      'audioRouteChanged',
      (event) => {
        syncDiagnosticsFromStatus(getStatus());
        pushRuntimeEvent(
          'audioRouteChanged',
          `${event.previousRoute ?? 'unknown'} -> ${event.route}`
        );
      }
    );
    const transcriptionStartedSubscription = addWakeWordListener(
      'transcriptionStarted',
      (event) => {
        setExtensionStatus(
          `STT reference adapter running through the public provider contract: ${event.provider}.`
        );
        pushRuntimeEvent('transcriptionStarted', event.provider);
      }
    );
    const transcriptionResultSubscription = addWakeWordListener(
      'transcriptionResult',
      (event) => {
        setSttTranscript(event.text);
        setExtensionStatus(
          `STT reference adapter completed through the runtime orchestration path: ${event.provider}.`
        );
        pushRuntimeEvent(
          'transcriptionResult',
          `${event.provider}: ${event.text}`
        );
      }
    );
    const transcriptionErrorSubscription = addWakeWordListener(
      'transcriptionError',
      (event) => {
        setExtensionStatus(
          `STT reference adapter failed through the public provider contract: ${event.provider}.`
        );
        setLastError(event);
        pushRuntimeEvent(
          'transcriptionError',
          `${event.provider}: ${event.code}`
        );
      }
    );
    const speechStartedSubscription = addWakeWordListener(
      'speechStarted',
      (event) => {
        setExtensionStatus(
          `TTS reference adapter running through the public provider contract: ${event.provider}.`
        );
        pushRuntimeEvent('speechStarted', `${event.provider}: ${event.text}`);
      }
    );
    const speechCompletedSubscription = addWakeWordListener(
      'speechCompleted',
      (event) => {
        setTtsResponse(
          `Runtime-triggered TTS completed through ${event.provider}.`
        );
        setExtensionStatus(
          `TTS reference adapter completed through the runtime orchestration path: ${event.provider}.`
        );
        pushRuntimeEvent('speechCompleted', event.provider);
      }
    );
    const speechErrorSubscription = addWakeWordListener(
      'speechError',
      (event) => {
        setExtensionStatus(
          `TTS reference adapter failed through the public provider contract: ${event.provider}.`
        );
        setLastError(event);
        pushRuntimeEvent('speechError', `${event.provider}: ${event.code}`);
      }
    );

    const initialStatus = getStatus();
    syncDiagnosticsFromStatus(initialStatus);
    pushRuntimeEvent('statusSnapshot', `initial state: ${initialStatus.state}`);

    return () => {
      void (async () => {
        if (manualRunAnywhereAdaptersRef.current.sttAdapter) {
          await manualRunAnywhereAdaptersRef.current.sttAdapter.dispose();
        }
        if (manualRunAnywhereAdaptersRef.current.ttsAdapter) {
          await manualRunAnywhereAdaptersRef.current.ttsAdapter.dispose();
        }
      })();
      stateSubscription.remove();
      detectionSubscription.remove();
      errorSubscription.remove();
      interruptionSubscription.remove();
      routeChangeSubscription.remove();
      transcriptionStartedSubscription.remove();
      transcriptionResultSubscription.remove();
      transcriptionErrorSubscription.remove();
      speechStartedSubscription.remove();
      speechCompletedSubscription.remove();
      speechErrorSubscription.remove();
    };
  }, []);

  async function ensureManualRunAnywhereAdapters(
    requestedMode: 'stt' | 'tts' | 'both'
  ): Promise<ManualRunAnywhereAdapters> {
    const currentAdapters = manualRunAnywhereAdaptersRef.current;

    const onProgress = (update: BuiltInProviderProgress) => {
      const nextStatus =
        update.progress == null
          ? update.message
          : `${update.message} (${update.progress}%)`;
      setExtensionStatus(nextStatus);
      setManualRunAnywhereStatus(nextStatus);
    };

    if (requestedMode !== 'tts' && !currentAdapters.sttAdapter) {
      const sttAdapter = new RunAnywhereSTTAdapter({
        modelId: 'whisper-tiny-en',
      });
      await sttAdapter.initialize(onProgress);
      currentAdapters.sttAdapter = sttAdapter;
    }

    if (requestedMode !== 'stt' && !currentAdapters.ttsAdapter) {
      const ttsAdapter = new RunAnywhereTTSAdapter({
        modelId: 'piper-en-lessac',
      });
      await ttsAdapter.initialize(onProgress);
      currentAdapters.ttsAdapter = ttsAdapter;
    }

    return currentAdapters;
  }

  function createFallbackError(error: unknown): WakeWordError {
    if (error instanceof Error) {
      return {
        category: 'internal',
        code: 'example_action_failed',
        message: error.message,
        recoverable: true,
      };
    }

    return {
      category: 'internal',
      code: 'example_action_failed',
      message: 'Unknown example action error.',
      recoverable: true,
    };
  }

  async function runAction(actionName: string, action: () => Promise<void>) {
    try {
      await action();
      const latestStatus = getStatus();
      syncDiagnosticsFromStatus(latestStatus);
      pushRuntimeEvent(actionName, `completed in state ${latestStatus.state}`);
    } catch (error) {
      const currentStatus = getStatus();
      const resolvedError =
        currentStatus.lastError ?? createFallbackError(error);

      syncDiagnosticsFromStatus({
        ...currentStatus,
        lastError: resolvedError,
      });
      pushRuntimeEvent(
        actionName,
        `failed with ${resolvedError.category}:${resolvedError.code}`
      );
    }
  }

  function handleInitialize() {
    runAction('initialize', async () => {
      const prerequisitesSatisfied = await ensureRuntimePrerequisites();
      if (!prerequisitesSatisfied) {
        throw new Error('Example prerequisites are not satisfied.');
      }

      const referenceProviders = createReferenceProviders(
        () => lastDetectionRef.current,
        {
          sttBridge: sttBridgeRef.current,
          ttsBridge: ttsBridgeRef.current,
        }
      );
      setExtensionStatus(
        providerMode === 'demo'
          ? `Initialize applies the "${selectedKeywordPreset.label}" keyword preset through initialize({ engineConfig: { assetKeys: { keywordAssetKey } } }) and keeps provider wiring outside the package.`
          : `Initialize applies the "${selectedKeywordPreset.label}" keyword preset and opts into the built-in RunAnywhere path — the package will download Whisper STT and Piper TTS on first use.`
      );
      setLastDetection(null);
      lastDetectionRef.current = null;
      setSttTranscript(null);
      setTtsResponse(null);
      setActiveKeywordPresetId(selectedKeywordPreset.id);
      pushRuntimeEvent(
        'referenceProviders',
        providerMode === 'demo'
          ? `${referenceProviders.sttProvider.name} + ${referenceProviders.ttsProvider.name}`
          : 'runanywhere-onnx built-in providers'
      );
      pushRuntimeEvent(
        'keywordPreset',
        `${selectedKeywordPreset.label} via ${selectedKeywordPreset.keywordAssetKey}`
      );

      return initialize({
        engineConfig: {
          assetKeys: {
            keywordAssetKey: selectedKeywordPreset.keywordAssetKey,
          },
        },
        ...(providerMode === 'demo'
          ? {
              sttProvider: referenceProviders.sttProvider,
              ttsProvider: referenceProviders.ttsProvider,
            }
          : {
              builtInSTT: { modelId: 'whisper-tiny-en' },
              builtInTTS: { modelId: 'piper-en-lessac' },
              onBuiltInProgress: (update: BuiltInProviderProgress) => {
                setExtensionStatus(
                  update.progress == null
                    ? update.message
                    : `${update.message} (${update.progress}%)`
                );
              },
            }),
        autoSpeak: true,
      });
    }).catch(() => undefined);
  }

  function handleStartDetection() {
    runAction('startDetection', () => startDetection()).catch(() => undefined);
  }

  function handleStopDetection() {
    runAction('stopDetection', () => stopDetection()).catch(() => undefined);
  }

  function handleManualRunAnywhereSpeak() {
    runAction('manualRunAnywhereSpeak', async () => {
      if (!manualRunAnywhereText.trim()) {
        throw new Error('Enter text before asking RunAnywhere TTS to speak.');
      }

      try {
        const adapters = await ensureManualRunAnywhereAdapters('tts');
        if (!adapters.ttsAdapter) {
          throw new Error('RunAnywhere TTS is not configured.');
        }

        setManualRunAnywhereStatus('Speaking text through RunAnywhere TTS...');
        await adapters.ttsAdapter.speak(manualRunAnywhereText);
        setManualRunAnywhereStatus('RunAnywhere TTS completed.');
        setTtsResponse(
          `Manual RunAnywhere TTS completed: "${manualRunAnywhereText}"`
        );
        pushRuntimeEvent('manualTTS', manualRunAnywhereText);
      } catch (error) {
        if (!isRunAnywhereIOSPiperLoadFailure(error)) {
          throw error;
        }

        setManualRunAnywhereStatus(
          'RunAnywhere Piper TTS is not loading on iOS. Falling back to system speech for this example action.'
        );
        pushRuntimeEvent(
          'manualTTSFallback',
          'RunAnywhere Piper TTS failed on iOS, using Expo Speech fallback'
        );
        await speakWithExpoSpeech(manualRunAnywhereText);
        setManualRunAnywhereStatus(
          'System speech fallback completed on iOS after RunAnywhere Piper TTS failed to load.'
        );
        setTtsResponse(
          `Manual system TTS fallback completed: "${manualRunAnywhereText}"`
        );
      }
    }).catch(() => undefined);
  }

  function handleManualRunAnywhereTranscribe() {
    runAction('manualRunAnywhereTranscribe', async () => {
      const adapters = await ensureManualRunAnywhereAdapters('stt');
      if (!adapters.sttAdapter) {
        throw new Error('RunAnywhere STT is not configured.');
      }

      setManualRunAnywhereStatus(
        'Recording through RunAnywhere STT. Speak now; transcription will appear here.'
      );
      const result = await adapters.sttAdapter.transcribe();
      setManualRunAnywhereTranscript(result.text);
      setManualRunAnywhereText(result.text);
      setManualRunAnywhereStatus('RunAnywhere STT transcription completed.');
      pushRuntimeEvent('manualSTT', result.text);
    }).catch(() => undefined);
  }

  function handleDispose() {
    runAction('dispose', async () => {
      await dispose();
      setLastDetection(null);
      lastDetectionRef.current = null;
      setSttTranscript(null);
      setTtsResponse(null);
      setActiveKeywordPresetId(null);
      setExtensionStatus(
        'Runtime disposed. Select a bundled keyword preset and run Initialize to apply it again.'
      );
    }).catch(() => undefined);
  }

  async function handleSttExample() {
    const sttReference = referenceProviderCatalog.find(
      (entry) => entry.id === 'expo-speech-recognition'
    );

    if (!sttReference) {
      return;
    }

    setExtensionStatus(
      `${sttReference.label} is documented in ${sttReference.docsPath}. This example app uses the same app-owned bridge shape and a simulated host implementation to preview the contract.`
    );
    pushRuntimeEvent('sttReference', sttReference.packageName);

    const preview = await sttBridgeRef.current.transcribe({
      detection: lastDetectionRef.current,
    });
    setSttTranscript(preview.text);
    pushRuntimeEvent('sttPreview', `${preview.provider}: ${preview.text}`);
  }

  async function handleTtsExample() {
    const ttsReference = referenceProviderCatalog.find(
      (entry) => entry.id === 'expo-speech'
    );

    if (!ttsReference) {
      return;
    }

    setExtensionStatus(
      `${ttsReference.label} is documented in ${ttsReference.docsPath}. This example app uses the same app-owned bridge shape and a simulated host implementation to preview the contract.`
    );
    pushRuntimeEvent('ttsReference', ttsReference.packageName);

    const previewText =
      'Simulated host-app TTS preview using the same public provider contract.';
    await ttsBridgeRef.current.speak({ text: previewText });
    setTtsResponse(previewText);
    pushRuntimeEvent('ttsPreview', ttsReference.packageName);
  }

  const availabilityText =
    status.reason ??
    (status.state === 'unsupported'
      ? 'Runtime is not available in this environment.'
      : 'Foreground runtime path is available for integration validation.');

  const statusSnapshot = [
    `isAvailable: ${String(status.isAvailable)}`,
    `isListening: ${String(status.isListening)}`,
    `canStart: ${String(status.canStart)}`,
    `reason: ${status.reason ?? 'none'}`,
  ];
  const latestErrorSummary = lastError
    ? `${lastError.category}:${lastError.code}`
    : 'No active runtime error';
  const providerModeLabel =
    providerMode === 'demo' ? 'Demo providers' : 'RunAnywhere built-in';
  const runAnywhereStatusText = runAnywhereAvailable
    ? `STT ${runAnywhereAvailability.stt ? 'ready' : 'unavailable'} • TTS ${runAnywhereAvailability.tts ? 'ready' : 'unavailable'}`
    : 'RunAnywhere built-in STT and TTS are always available.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Example app</Text>
          <Text style={styles.title}>Voice Activator Evaluation Console</Text>
          <Text style={styles.subtitle}>
            Validate wake-word detection, built-in RunAnywhere speech flows, and
            host-owned provider integration from one screen.
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeLabel}>State</Text>
              <Text style={styles.badgeValue}>{status.state}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeLabel}>Mode</Text>
              <Text style={styles.badgeValue}>{providerModeLabel}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeLabel}>Preset</Text>
              <Text style={styles.badgeValue}>
                {activeKeywordPreset?.label ?? selectedKeywordPreset.label}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Session overview</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>Availability</Text>
              <Text style={styles.infoValue}>{availabilityText}</Text>
            </View>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>RunAnywhere</Text>
              <Text style={styles.infoValue}>{runAnywhereStatusText}</Text>
            </View>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>Last detection</Text>
              <Text style={styles.infoValue}>
                {lastDetection
                  ? `${lastDetection.detectedPhrase} at ${lastDetection.detectedAt}`
                  : 'Waiting for a wake phrase.'}
              </Text>
            </View>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>Latest issue</Text>
              <Text style={styles.infoValue}>{latestErrorSummary}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Run controls</Text>
          <Text style={styles.meta}>
            Choose the runtime mode, initialize the current keyword preset, then
            start or stop detection. The built-in RunAnywhere path downloads
            Whisper STT and Piper TTS automatically on first initialize.
          </Text>
          <View style={styles.actionsGrid}>
            <ActionButton
              label="Use demo providers"
              description="Keep STT/TTS app-owned and simulate host adapter behavior."
              onPress={() => {
                setProviderMode('demo');
              }}
              tone={providerMode === 'demo' ? 'primary' : 'secondary'}
            />
            <ActionButton
              label="Use RunAnywhere built-in"
              description="Initialize the built-in Whisper/Piper path for this session."
              onPress={() => {
                setProviderMode('runanywhere');
              }}
              disabled={!runAnywhereAvailable}
              tone={providerMode === 'runanywhere' ? 'primary' : 'secondary'}
            />
            <ActionButton
              label="Initialize"
              description="Apply the selected keyword preset and configure the chosen mode."
              onPress={handleInitialize}
              tone="primary"
            />
            <ActionButton
              label="Start detection"
              description="Begin foreground wake-word listening with the active preset."
              onPress={handleStartDetection}
              disabled={!status.canStart}
            />
            <ActionButton
              label="Stop detection"
              description="End the active wake-word detection session."
              onPress={handleStopDetection}
              disabled={!status.isListening}
              tone="quiet"
            />
            <ActionButton
              label="Dispose"
              description="Tear down the runtime and clear the active session."
              onPress={handleDispose}
              tone="danger"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Bundled keyword presets</Text>
          <Text style={styles.helperText}>
            Keyword detection status: {status.state}
          </Text>
          <Text style={styles.meta}>
            Changing presets does not hot-swap the active runtime. Press
            Initialize again after switching.
          </Text>
          {bundledKeywordPresets.map((preset) => (
            <View key={preset.id} style={styles.listCard}>
              <Text style={styles.eventLabel}>{preset.label}</Text>
              <Text style={styles.meta}>{preset.phraseSummary}</Text>
              <Text style={styles.helperText}>{preset.keywordAssetKey}</Text>
              <ActionButton
                label={
                  selectedKeywordPresetId === preset.id
                    ? `Selected: ${preset.label}`
                    : `Use ${preset.label}`
                }
                onPress={() => {
                  setSelectedKeywordPresetId(preset.id);
                }}
                tone={
                  selectedKeywordPresetId === preset.id
                    ? 'primary'
                    : 'secondary'
                }
              />
            </View>
          ))}
          <Text style={styles.helperText}>
            {keywordSelectionRequiresInitialize
              ? 'Keyword selection changed. Run Initialize again before Start detection.'
              : 'The selected preset already matches the current runtime selection.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Current runtime diagnostics</Text>
          <Text style={styles.meta}>
            Runtime snapshot from `getStatus()` plus the current detection and
            extension flow outputs.
          </Text>
          <Text style={styles.helperText}>
            Provider mode: {providerModeLabel}
          </Text>
          <Text style={styles.helperText}>
            Active preset: {activeKeywordPreset?.label ?? 'none'}
          </Text>
          <Text style={styles.helperText}>
            Selected preset: {selectedKeywordPreset.label}
          </Text>
          <Text style={styles.helperText}>
            Asset key: {selectedKeywordPreset.keywordAssetKey}
          </Text>
          <Text style={styles.helperText}>
            Detected phrase: {lastDetection?.detectedPhrase ?? 'none yet'}
          </Text>
          {statusSnapshot.map((line) => (
            <Text key={line} style={styles.helperText}>
              {line}
            </Text>
          ))}
          <Text style={styles.helperText}>
            Known states: {wakeWordStates.join(', ')}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.meta}>Extension status: {extensionStatus}</Text>
          <Text style={styles.meta}>
            STT transcript:{' '}
            {sttTranscript ?? 'No runtime-driven transcript yet.'}
          </Text>
          <Text style={styles.meta}>
            TTS response:{' '}
            {ttsResponse ?? 'No runtime-driven TTS completion yet.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Active issue</Text>
          <Text style={styles.statusBannerLabel}>
            {lastError
              ? `${lastError.category}:${lastError.code}`
              : 'No active error'}
          </Text>
          <Text style={styles.statusBannerBody}>
            {lastError
              ? lastError.message
              : 'The example is currently idle or healthy. Runtime issues will appear here when they happen.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent runtime events</Text>
          {recentEvents.length > 0 ? (
            recentEvents.map((event) => (
              <View key={event.id} style={styles.listCard}>
                <Text style={styles.eventLabel}>{event.label}</Text>
                <Text style={styles.meta}>{event.detail}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.meta}>No runtime events recorded yet.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Normalized error categories</Text>
          <Text style={styles.meta}>
            This is a legend for interpreting runtime failures. It is not a live
            error list.
          </Text>
          {errorCategories.map((entry) => (
            <View key={entry.category} style={styles.listCard}>
              <Text style={styles.eventLabel}>{entry.category}</Text>
              <Text style={styles.meta}>{entry.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Optional STT/TTS extension examples
          </Text>
          <Text style={styles.meta}>
            This screen shows the package wake runtime plus separate simulated
            host-owned provider previews. These reference adapters stay outside
            the package runtime. The example app owns them, passes them through
            the public provider interface, and keeps STT/TTS as optional
            downstream integrations by default. The built-in RunAnywhere option
            is a separate opt-in path.
          </Text>
          <Text style={styles.meta}>
            The optional application-owned STT provider can turn that wake event
            into a transcription result via initialize( {'{ sttProvider }'}).
            The TTS response step runs
            {/* contract-anchor: after a successful STT result when `autoSpeak: true` is enabled. */}
            {
              ' after a successful STT result when `autoSpeak: true` is enabled.'
            }
          </Text>
          <Text style={styles.meta}>
            The package-owned native runtime detects a wake phrase. The wake
            step is real package behavior. The transcribe/speak preview buttons
            below use simulated host implementations of the same
            application-level reference provider pattern documented in
            `docs/examples/`.
          </Text>
          <Text style={styles.meta}>
            The RunAnywhere entry below uses the package built-in Whisper STT
            and Piper TTS models — downloaded automatically on first initialize.
          </Text>
          {referenceProviderCatalog.map((entry) => (
            <View key={entry.id} style={styles.listCard}>
              <Text style={styles.eventLabel}>{entry.label}</Text>
              <Text style={styles.meta}>
                {entry.packageName} · {entry.summary}
              </Text>
              <Text style={styles.helperText}>
                Reference docs: {entry.docsPath}
              </Text>
            </View>
          ))}
          <View style={styles.actionsGrid}>
            <ActionButton
              label="Preview STT adapter"
              description="Run the simulated host-owned STT bridge."
              onPress={() => {
                void handleSttExample();
              }}
            />
            <ActionButton
              label="Preview TTS adapter"
              description="Run the simulated host-owned TTS bridge."
              onPress={() => {
                void handleTtsExample();
              }}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Manual RunAnywhere STT/TTS</Text>
          <Text style={styles.meta}>
            This uses the built-in RunAnywhere adapters directly so you can test
            speech synthesis from typed text and speech-to-text without waiting
            for a wake-word event.
          </Text>
          <TextInput
            style={styles.input}
            value={manualRunAnywhereText}
            onChangeText={setManualRunAnywhereText}
            placeholder="Type text for RunAnywhere TTS"
            multiline
          />
          <View style={styles.actionsGrid}>
            <ActionButton
              label="Speak text"
              description="Load Piper and play the typed sentence."
              onPress={handleManualRunAnywhereSpeak}
              disabled={!runAnywhereAvailability.tts}
              tone="primary"
            />
            <ActionButton
              label="Record and transcribe"
              description="Record audio, run Whisper, and copy the transcript back."
              onPress={handleManualRunAnywhereTranscribe}
              disabled={!runAnywhereAvailability.stt}
            />
          </View>
          <Text style={styles.meta}>Status: {manualRunAnywhereStatus}</Text>
          <Text style={styles.meta}>
            Transcript:{' '}
            {manualRunAnywhereTranscript ?? 'No manual transcription yet.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recommended test scenarios</Text>
          <Text style={styles.meta}>
            Use these flows to validate the example intentionally instead of
            tapping controls at random.
          </Text>
          {testScenarios.map((scenario) => (
            <View key={scenario.id} style={styles.listCard}>
              <Text style={styles.eventLabel}>{scenario.title}</Text>
              <Text style={styles.meta}>{scenario.summary}</Text>
              {scenario.steps.map((step) => (
                <Text key={step} style={styles.helperText}>
                  • {step}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Assistant flow guide</Text>
          <Text style={styles.meta}>
            iOS background continuation still requires the audio background mode
            and does not survive force-quit. Android background continuation
            requires a visible app context for start and an active
            foreground-service notification while detection is running.
          </Text>
          <Text style={styles.meta}>
            Demo STT/TTS entries are application-level reference examples. The
            built-in RunAnywhere path is separate and opt-in.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef1eb',
  },
  container: {
    padding: 20,
    gap: 18,
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: '#17352b',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#0f221b',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#b7d6c6',
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
    color: '#f5f7f2',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: '#d7e4dc',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    minWidth: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#23463a',
    gap: 2,
  },
  badgeLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#a8c7b8',
  },
  badgeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f4f8f4',
  },
  card: {
    backgroundColor: '#fbfbf7',
    borderRadius: 22,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#dde5dc',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#183028',
  },
  value: {
    fontSize: 16,
    color: '#111',
  },
  infoGrid: {
    gap: 10,
  },
  infoTile: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#f0f4ee',
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#607468',
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 20,
    color: '#163127',
  },
  meta: {
    fontSize: 14,
    lineHeight: 20,
    color: '#43544b',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#66776e',
  },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: '#cbd8cd',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
    backgroundColor: '#ffffff',
    textAlignVertical: 'top',
  },
  actionsGrid: {
    gap: 10,
  },
  actionButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    gap: 4,
  },
  actionButtonPrimary: {
    backgroundColor: '#173f2f',
    borderColor: '#173f2f',
  },
  actionButtonSecondary: {
    backgroundColor: '#edf4ef',
    borderColor: '#cedbd1',
  },
  actionButtonDanger: {
    backgroundColor: '#fff1ef',
    borderColor: '#f3c2bb',
  },
  actionButtonQuiet: {
    backgroundColor: '#f6f7f5',
    borderColor: '#dde3dc',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  actionButtonLabelPrimary: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f7fbf8',
  },
  actionButtonLabelSecondary: {
    fontSize: 15,
    fontWeight: '700',
    color: '#17352b',
  },
  actionButtonLabelDanger: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9d3428',
  },
  actionButtonLabelQuiet: {
    fontSize: 15,
    fontWeight: '700',
    color: '#405249',
  },
  actionButtonDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#6c7c73',
  },
  listCard: {
    borderRadius: 16,
    backgroundColor: '#f3f6f1',
    padding: 14,
    gap: 6,
  },
  eventLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#23362d',
  },
  divider: {
    height: 1,
    backgroundColor: '#dde5dc',
    marginVertical: 2,
  },
  statusBannerLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8b2f24',
  },
  statusBannerBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#5d3e3a',
  },
});
