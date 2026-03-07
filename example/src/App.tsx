import { useEffect, useState } from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  type WakeWordStatus,
} from 'react-native-voice-activator';

export default function App() {
  const [status, setStatus] = useState<WakeWordStatus>(() => getStatus());
  const [lastDetection, setLastDetection] =
    useState<WakeWordDetectedEvent | null>(null);
  const [lastError, setLastError] = useState<WakeWordError | null>(null);

  useEffect(() => {
    const stateSubscription = addWakeWordListener('stateChanged', () => {
      setStatus(getStatus());
    });
    const detectionSubscription = addWakeWordListener(
      'wakeWordDetected',
      (event) => {
        setLastDetection(event);
      }
    );
    const errorSubscription = addWakeWordListener('error', (event) => {
      setLastError(event);
      setStatus(getStatus());
    });

    setStatus(getStatus());

    return () => {
      stateSubscription.remove();
      detectionSubscription.remove();
      errorSubscription.remove();
    };
  }, []);

  async function runAction(action: () => Promise<void>) {
    setLastError(null);

    try {
      await action();
      setStatus(getStatus());
    } catch (error) {
      const currentStatus = getStatus();
      setStatus(currentStatus);
      setLastError(
        currentStatus.lastError ??
          (error instanceof Error
            ? {
                category: 'internal',
                code: 'example_action_failed',
                message: error.message,
                recoverable: true,
              }
            : {
                category: 'internal',
                code: 'example_action_failed',
                message: 'Unknown example action error.',
                recoverable: true,
              })
      );
    }
  }

  function handleInitialize() {
    runAction(() => initialize()).catch(() => undefined);
  }

  function handleStartDetection() {
    runAction(() => startDetection()).catch(() => undefined);
  }

  function handleStopDetection() {
    runAction(() => stopDetection()).catch(() => undefined);
  }

  function handleDispose() {
    runAction(() => dispose()).catch(() => undefined);
  }

  const availabilityText =
    status.reason ??
    (status.state === 'unsupported'
      ? 'Runtime is not available in this environment.'
      : 'Foreground runtime path is available for integration validation.');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>react-native-voice-activator</Text>
        <Text style={styles.subtitle}>
          Foreground runtime and typed event flow example
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Current state</Text>
          <Text style={styles.value}>{status.state}</Text>
          <Text style={styles.meta}>{availabilityText}</Text>
          <Text style={styles.meta}>
            Known states: {wakeWordStates.join(', ')}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Actions</Text>
          <View style={styles.buttonRow}>
            <Button title="Initialize" onPress={handleInitialize} />
          </View>
          <View style={styles.buttonRow}>
            <Button title="Start detection" onPress={handleStartDetection} />
          </View>
          <View style={styles.buttonRow}>
            <Button title="Stop detection" onPress={handleStopDetection} />
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
          <Text style={styles.label}>Last error</Text>
          <Text style={styles.value}>
            {lastError
              ? `${lastError.code}: ${lastError.message}`
              : 'No error recorded.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Important note</Text>
          <Text style={styles.meta}>
            This example validates the current API, lifecycle, and typed event
            path. iOS background continuation still requires the audio
            background mode and does not survive force-quit. Android background
            continuation requires a visible app context for start and an active
            foreground-service notification while detection is running.
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
});
