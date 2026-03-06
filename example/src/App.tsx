import { Text, View, StyleSheet } from 'react-native';
import { multiply } from 'react-native-voice-activator';

const result = multiply(3, 7);

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>react-native-voice-activator</Text>
      <Text>Bootstrap scaffold check</Text>
      <Text>Temporary native placeholder result: {result}</Text>
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
