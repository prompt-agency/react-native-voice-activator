import { useEffect, useRef, useState } from 'react';
import {
  Button,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addWakeWordListener,
  dispose,
  getStatus,
  initialize,
  startDetection,
  stopDetection,
  wakeWordStates,
  type WakeWordDetectedEvent,
  type WakeWordError,
  type WakeWordErrorCategory,
  type WakeWordStatus,
} from 'react-native-voice-activator';
import {
  createRunAnywhereBuiltInOptions,
  createDemoReferenceSttBridge,
  createDemoReferenceTtsBridge,
  createReferenceProviders,
  isRunAnywhereConfigured,
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
    'Wake -> transcribe -> optional speak preview is idle until initialize configures the application-owned provider interface.'
  );
  const [providerMode, setProviderMode] = useState<ProviderMode>('demo');
  const [selectedKeywordPresetId, setSelectedKeywordPresetId] = useState<string>(
    defaultKeywordPreset.id
  );
  const [activeKeywordPresetId, setActiveKeywordPresetId] = useState<
    string | null
  >(null);
  const sttBridgeRef = useRef(createDemoReferenceSttBridge());
  const ttsBridgeRef = useRef(createDemoReferenceTtsBridge());
  const eventSequenceRef = useRef(0);
  const selectedKeywordPreset =
    bundledKeywordPresets.find((preset) => preset.id === selectedKeywordPresetId) ??
    defaultKeywordPreset;
  const activeKeywordPreset =
    bundledKeywordPresets.find((preset) => preset.id === activeKeywordPresetId) ??
    null;
  const keywordSelectionRequiresInitialize =
    activeKeywordPresetId !== selectedKeywordPreset.id;
  const runAnywhereAvailable = isRunAnywhereConfigured();

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
      const resolvedError = currentStatus.lastError ?? createFallbackError(error);

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
      const runAnywhereOptions = createRunAnywhereBuiltInOptions();

      if (providerMode === 'runanywhere' && !runAnywhereOptions) {
        setExtensionStatus(
          'RunAnywhere built-in mode is selected, but real STT/TTS model paths are not configured in example/src/reference-provider-adapters.ts.'
        );
        throw new Error('RunAnywhere built-in mode is not configured.');
      }

      setExtensionStatus(
        providerMode === 'demo'
          ? `Initialize applies the "${selectedKeywordPreset.label}" keyword preset through initialize({ engineConfig: { assetKeys: { keywordAssetKey } } }) and keeps provider wiring outside the package.`
          : `Initialize applies the "${selectedKeywordPreset.label}" keyword preset and opts into the built-in RunAnywhere STT/TTS path for this runtime session.`
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
          : runAnywhereOptions),
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>react-native-voice-activator</Text>
        <Text style={styles.subtitle}>
          Wake-word runtime plus optional provider-pattern evaluation flow
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Keyword detection status</Text>
          <Text style={styles.value}>
            Active preset:{' '}
            {activeKeywordPreset?.label ?? 'Not initialized yet'}
          </Text>
          <Text style={styles.meta}>
            Selected preset: {selectedKeywordPreset.label}
          </Text>
          <Text style={styles.meta}>
            Preset phrases: {selectedKeywordPreset.phraseSummary}
          </Text>
          <Text style={styles.meta}>
            Asset key: {selectedKeywordPreset.keywordAssetKey}
          </Text>
          <Text style={styles.meta}>
            {lastDetection
              ? `Detected phrase: ${lastDetection.detectedPhrase} at ${lastDetection.detectedAt}`
              : 'Detected phrase: Waiting for a wake-word hit.'}
          </Text>
          <Text style={styles.meta}>
            {keywordSelectionRequiresInitialize
              ? 'Keyword selection changed. Run Initialize again before Start detection to apply the new preset.'
              : 'The selected keyword preset is already active for the current runtime session.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Assistant flow guide</Text>
          <Text style={styles.meta}>
            1. The package-owned native runtime detects a wake phrase.
          </Text>
          <Text style={styles.meta}>
            2. The optional application-owned STT provider can turn that wake
            event into a transcript.
          </Text>
          <Text style={styles.meta}>
            3. The optional application-owned TTS provider can speak a response
            after a successful STT result when `autoSpeak: true` is enabled.
          </Text>
          <Text style={styles.meta}>
            4. This example also exposes an opt-in built-in RunAnywhere path,
            but keeps it disabled until real local model paths are configured.
          </Text>
          <Text style={styles.meta}>
            This screen shows the package wake runtime plus separate simulated
            provider previews built on the same public adapter contract.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Bundled keyword presets</Text>
          <Text style={styles.meta}>
            The example app ships preset keyword files and applies them through
            `engineConfig.assetKeys.keywordAssetKey`.
          </Text>
          <Text style={styles.meta}>
            Changing the selection does not hot-swap the runtime. Re-run
            Initialize to make the new preset active.
          </Text>
          {bundledKeywordPresets.map((preset) => (
            <View key={preset.id} style={styles.eventRow}>
              <Text style={styles.eventLabel}>{preset.label}</Text>
              <Text style={styles.meta}>{preset.phraseSummary}</Text>
              <Text style={styles.meta}>{preset.keywordAssetKey}</Text>
              <View style={styles.buttonRow}>
                <Button
                  title={
                    selectedKeywordPresetId === preset.id
                      ? `Selected: ${preset.label}`
                      : `Use ${preset.label}`
                  }
                  onPress={() => {
                    setSelectedKeywordPresetId(preset.id);
                  }}
                />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Current runtime diagnostics</Text>
          <Text style={styles.value}>{status.state}</Text>
          <Text style={styles.meta}>{availabilityText}</Text>
          <Text style={styles.meta}>
            Known states: {wakeWordStates.join(', ')}
          </Text>
          {statusSnapshot.map((line) => (
            <Text key={line} style={styles.meta}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Actions</Text>
          <Text style={styles.meta}>
            Default engine path: package-owned native-managed runtime
          </Text>
          <Text style={styles.meta}>
            Expo example config: app.json registers the local plugin path and
            Expo prebuild generates Sherpa asset manifests for the native
            projects.
          </Text>
          <Text style={styles.meta}>
            Provider mode: {providerMode === 'demo' ? 'Demo bridges' : 'RunAnywhere built-in'}
          </Text>
          <Text style={styles.meta}>
            RunAnywhere availability:{' '}
            {runAnywhereAvailable
              ? 'configured with real local model paths'
              : 'disabled until model paths are set in example/src/reference-provider-adapters.ts'}
          </Text>
          <View style={styles.buttonRow}>
            <Button
              title="Use demo providers"
              onPress={() => {
                setProviderMode('demo');
              }}
            />
          </View>
          <View style={styles.buttonRow}>
            <Button
              title="Use RunAnywhere built-in"
              onPress={() => {
                setProviderMode('runanywhere');
              }}
              disabled={!runAnywhereAvailable}
            />
          </View>
          <View style={styles.buttonRow}>
            <Button title="Initialize" onPress={handleInitialize} />
          </View>
          <View style={styles.buttonRow}>
            <Button
              title="Start detection"
              onPress={handleStartDetection}
              disabled={!status.canStart}
            />
          </View>
          <View style={styles.buttonRow}>
            <Button
              title="Stop detection"
              onPress={handleStopDetection}
              disabled={!status.isListening}
            />
          </View>
          <View style={styles.buttonRow}>
            <Button title="Dispose" onPress={handleDispose} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Last detection event</Text>
          <Text style={styles.value}>
            {lastDetection
              ? `${lastDetection.detectedPhrase} at ${lastDetection.detectedAt}`
              : 'No detection event received yet.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Latest structured error</Text>
          <Text style={styles.value}>
            {lastError
              ? `${lastError.category}:${lastError.code}`
              : 'No error recorded.'}
          </Text>
          <Text style={styles.meta}>
            {lastError
              ? lastError.message
              : 'The diagnostics surface mirrors getStatus().lastError.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Recent runtime events</Text>
          {recentEvents.length > 0 ? (
            recentEvents.map((event) => (
              <View key={event.id} style={styles.eventRow}>
                <Text style={styles.eventLabel}>{event.label}</Text>
                <Text style={styles.meta}>{event.detail}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.meta}>No runtime events recorded yet.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Normalized error categories</Text>
          {errorCategories.map((entry) => (
            <View key={entry.category} style={styles.eventRow}>
              <Text style={styles.eventLabel}>{entry.category}</Text>
              <Text style={styles.meta}>{entry.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Optional STT/TTS extension examples</Text>
          <Text style={styles.meta}>
            These reference adapters stay outside the package runtime. The
            example app owns them, passes them through the public provider
            interface, and keeps STT/TTS as optional downstream integrations by
            default. The built-in RunAnywhere option is a separate opt-in path.
          </Text>
          <Text style={styles.meta}>
            The wake step is real package behavior. The transcribe/speak preview
            buttons below use simulated host implementations of the same
            application-owned provider pattern documented in `docs/examples/`.
          </Text>
          <Text style={styles.meta}>
            The RunAnywhere entry below is intentionally unavailable until this
            example is given real local STT/TTS model paths.
          </Text>
          {referenceProviderCatalog.map((entry) => (
            <View key={entry.id} style={styles.eventRow}>
              <Text style={styles.eventLabel}>{entry.label}</Text>
              <Text style={styles.meta}>
                {entry.packageName} · {entry.summary}
              </Text>
              <Text style={styles.meta}>Reference docs: {entry.docsPath}</Text>
            </View>
          ))}
          <View style={styles.buttonRow}>
            <Button
              title="Preview STT adapter"
              onPress={() => {
                void handleSttExample();
              }}
            />
          </View>
          <View style={styles.buttonRow}>
            <Button
              title="Preview TTS adapter"
              onPress={() => {
                void handleTtsExample();
              }}
            />
          </View>
          <Text style={styles.meta}>Extension status: {extensionStatus}</Text>
          <Text style={styles.meta}>
            STT transcript: {sttTranscript ?? 'No runtime-driven transcript yet.'}
          </Text>
          <Text style={styles.meta}>
            TTS response: {ttsResponse ?? 'No runtime-driven TTS completion yet.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Important note</Text>
          <Text style={styles.meta}>
            This example validates the current API, lifecycle, typed event path,
            and evaluator-facing runtime diagnostics surface. iOS background
            continuation still requires the audio background mode and does not
            survive force-quit. Android background continuation requires a
            visible app context for start and an active foreground-service
            notification while detection is running.
          </Text>
          <Text style={styles.meta}>
            The demo STT/TTS adapters above are application-level reference
            provider examples. The package now also supports an opt-in built-in
            RunAnywhere STT/TTS path, but this example keeps that path disabled
            until real model assets are configured.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 16,
    color: '#444',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  value: {
    fontSize: 16,
    color: '#111',
  },
  meta: {
    fontSize: 14,
    color: '#555',
  },
  buttonRow: {
    marginTop: 8,
  },
  eventRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    paddingTop: 8,
  },
  eventLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
});
