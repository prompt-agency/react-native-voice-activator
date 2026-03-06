import { Text, View, StyleSheet } from 'react-native';
import { getStatus, wakeWordStates } from 'react-native-voice-activator';

export default function App() {
  const status = getStatus();
  const availabilityText = status.canStart
    ? 'Runtime methods can be called.'
    : (status.reason ?? 'Runtime is not available yet.');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>react-native-voice-activator</Text>
      <Text>Public API contract scaffold</Text>
      <Text>Current runtime state: {status.state}</Text>
      <Text>{availabilityText}</Text>
      <Text>Known states: {wakeWordStates.join(', ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
});
