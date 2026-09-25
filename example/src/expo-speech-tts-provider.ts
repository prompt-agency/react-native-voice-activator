import * as Speech from 'expo-speech';
import type {
  TextToSpeechProvider,
  TTSOptions,
} from 'react-native-voice-activator';

/**
 * Concrete `expo-speech` TTS adapter, mirroring
 * docs/examples/expo-speech-tts-provider.md.
 *
 * Session mode requires BOTH an sttProvider and a ttsProvider: the dispatch in
 * voice-activator.ts only delegates to VoiceSessionOrchestrator when both are
 * present, and `autoSpeak` does not synthesize a default provider. Without this
 * the wake word fires, no session starts, and the app looks inert.
 *
 * Stays application-owned by design — the library never depends on expo-speech.
 */
export class ExpoSpeechTtsProvider implements TextToSpeechProvider {
  readonly name = 'expo-speech';

  async speak(text: string, options?: TTSOptions): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      Speech.speak(text, {
        language: options?.language,
        pitch: options?.pitch,
        rate: options?.rate,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => reject(new Error('expo-speech failed to speak text')),
      });
    });
  }

  async stop(): Promise<void> {
    Speech.stop();
  }
}
