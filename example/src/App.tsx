import { useEffect, useState } from 'react';
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

const configuredAccessKey =
  process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY?.trim() ?? '';

type RuntimeEventEntry = {
  id: string;
  label: string;
  detail: string;
};

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
  const [lastError, setLastError] = useState<WakeWordError | null>(
    () => getStatus().lastError ?? null
  );
  const [recentEvents, setRecentEvents] = useState<RuntimeEventEntry[]>([]);
  const [sttTranscript, setSttTranscript] = useState<string | null>(null);
  const [ttsResponse, setTtsResponse] = useState<string | null>(null);
  const [extensionStatus, setExtensionStatus] = useState<string>(
    'No STT/TTS extension flow executed yet.'
  );

  async function ensureRuntimePrerequisites(): Promise<boolean> {
    if (!configuredAccessKey) {
      const configurationError: WakeWordError = {
        category: 'configuration',
        code: 'missing_access_key',
        message:
          'Set EXPO_PUBLIC_PICOVOICE_ACCESS_KEY before initializing the example app.',
        recoverable: true,
      };

      setLastError(configurationError);
      pushRuntimeEvent(
        'prerequisite',
        'Missing EXPO_PUBLIC_PICOVOICE_ACCESS_KEY for the built-in Porcupine engine.'
      );
      return false;
    }

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
        id: `${Date.now()}-${currentEvents.length}`,
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
        setSttTranscript(null);
        setTtsResponse(null);
        setExtensionStatus(
          'Wake word detected. Running optional STT extension example from the public event.'
        );
        pushRuntimeEvent(
          'wakeWordDetected',
          `${event.detectedPhrase} at ${event.detectedAt}`
        );

        void runSttExtensionFromDetection(event).catch(() => {
          setExtensionStatus(
            'Wake word detected, but the optional STT extension example failed.'
          );
        });
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

    const initialStatus = getStatus();
    syncDiagnosticsFromStatus(initialStatus);
    pushRuntimeEvent('statusSnapshot', `initial state: ${initialStatus.state}`);

    return () => {
      stateSubscription.remove();
      detectionSubscription.remove();
      errorSubscription.remove();
      interruptionSubscription.remove();
      routeChangeSubscription.remove();
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

  async function simulateSttHandoff(event: WakeWordDetectedEvent) {
    await Promise.resolve();

    return `Transcript placeholder captured after wake phrase "${event.detectedPhrase}" at ${event.detectedAt}.`;
  }

  async function simulateTtsHandoff(transcript: string) {
    await Promise.resolve();

    return `TTS placeholder response for transcript: ${transcript}`;
  }

  async function runSttExtensionFromDetection(event: WakeWordDetectedEvent) {
    const transcript = await simulateSttHandoff(event);
    setSttTranscript(transcript);
    setExtensionStatus(
      'Optional STT extension example ran automatically from the public wakeWordDetected event.'
    );
    pushRuntimeEvent('sttExtension', 'transcript placeholder captured');
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

      return initialize({
        engineConfig: {
          metadata: {
            accessKey: configuredAccessKey,
          },
        },
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
    runAction('dispose', () => dispose()).catch(() => undefined);
  }

  async function handleSttExample() {
    if (!lastDetection) {
      setExtensionStatus(
        'Wait for a wake-word detection event before triggering the STT example.'
      );
      return;
    }

    await runSttExtensionFromDetection(lastDetection);
  }

  async function handleTtsExample() {
    const sourceTranscript =
      sttTranscript ??
      (lastDetection
        ? `Wake phrase received: ${lastDetection.detectedPhrase}`
        : null);

    if (!sourceTranscript) {
      setExtensionStatus(
        'Run the STT example or wait for wake-word detection before triggering the TTS example.'
      );
      return;
    }

    const response = await simulateTtsHandoff(sourceTranscript);
    setTtsResponse(response);
    setExtensionStatus(
      'Optional TTS extension example ran after the STT/public wake-word flow.'
    );
    pushRuntimeEvent('ttsExtension', 'tts placeholder response prepared');
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
          Foreground runtime and typed event flow example
        </Text>

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
            Picovoice access key:{' '}
            {configuredAccessKey ? 'configured' : 'missing'}
          </Text>
          {!configuredAccessKey ? (
            <Text style={styles.meta}>
              Set `EXPO_PUBLIC_PICOVOICE_ACCESS_KEY` and rebuild/restart the
              example before initializing detection.
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Button
              title="Initialize"
              onPress={handleInitialize}
              disabled={!configuredAccessKey}
            />
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
            These examples stay outside the package runtime. They use the public
            wake-word event and lifecycle contract only, so STT/TTS remain
            optional downstream integrations rather than built-in package
            features.
          </Text>
          <View style={styles.buttonRow}>
            <Button title="Run STT handoff example" onPress={handleSttExample} />
          </View>
          <View style={styles.buttonRow}>
            <Button title="Run TTS response example" onPress={handleTtsExample} />
          </View>
          <Text style={styles.meta}>Extension status: {extensionStatus}</Text>
          <Text style={styles.meta}>
            STT transcript: {sttTranscript ?? 'No transcript placeholder yet.'}
          </Text>
          <Text style={styles.meta}>
            TTS response: {ttsResponse ?? 'No TTS response placeholder yet.'}
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
            The STT/TTS buttons above are application-level extension examples
            only. The package does not own transcription or speech synthesis.
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
