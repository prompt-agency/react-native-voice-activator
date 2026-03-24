// Type declarations for @fugood/react-native-audio-pcm-stream
// This package has no bundled TypeScript types.
// API derived from whisper.rn's AudioPcmStreamAdapter usage.
declare module '@fugood/react-native-audio-pcm-stream' {
  interface LiveAudioStreamSubscription {
    remove(): void;
  }

  interface LiveAudioStreamInitOptions {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    bufferSize?: number;
  }

  const LiveAudioStream: {
    init(options: LiveAudioStreamInitOptions): void;
    start(): void;
    stop(): void;
    addListener(
      event: 'data',
      callback: (data: string) => void
    ): LiveAudioStreamSubscription;
  };

  export default LiveAudioStream;
}
