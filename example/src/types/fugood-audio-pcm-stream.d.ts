// Type declarations for @fugood/react-native-audio-pcm-stream.
//
// The library ships no TypeScript types. This lives in the example rather than
// the package because react-native-voice-activator no longer depends on it —
// only EnrollmentScreen does, for its own microphone capture.
declare module '@fugood/react-native-audio-pcm-stream' {
  interface LiveAudioStreamSubscription {
    remove(): void;
  }

  interface LiveAudioStreamInitOptions {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number; // Android only: AudioSource enum value (6 = VOICE_RECOGNITION)
    bufferSize?: number;
  }

  const LiveAudioStream: {
    init(options: LiveAudioStreamInitOptions): void;
    start(): void;
    stop(): void;
    on(
      event: 'data',
      callback: (data: string) => void
    ): LiveAudioStreamSubscription;
  };

  export default LiveAudioStream;
}
