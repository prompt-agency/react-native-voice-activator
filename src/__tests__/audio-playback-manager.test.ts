import { AudioPlaybackManager } from '../providers/tts/AudioPlaybackManager';

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// react-native is mocked using jest.fn() directly inside the factory to avoid
// TDZ hoisting errors. Access mock functions via jest.requireMock() in tests.

jest.mock('react-native', () => ({
  NativeModules: {
    VoiceActivator: {
      playPCMChunk: jest.fn().mockResolvedValue(undefined),
      playWav: jest.fn().mockResolvedValue(undefined),
      stopPlayback: jest.fn().mockResolvedValue(undefined),
      setVolumeDucking: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

function getNativeMock() {
  return jest.requireMock('react-native').NativeModules
    .VoiceActivator as Record<string, jest.Mock>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AudioPlaybackManager', () => {
  let manager: AudioPlaybackManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new AudioPlaybackManager();
  });

  describe('playChunk()', () => {
    it('calls native playPCMChunk with base64-encoded PCM and sampleRate', async () => {
      const pcm = new Float32Array([0.1, -0.2, 0.3]);
      await manager.playChunk(pcm, 22050);

      const native = getNativeMock();
      expect(native.playPCMChunk).toHaveBeenCalledTimes(1);
      const [base64Arg, srArg] = native.playPCMChunk!.mock.calls[0] as [
        string,
        number,
      ];
      expect(typeof base64Arg).toBe('string');
      expect(base64Arg.length).toBeGreaterThan(0);
      expect(srArg).toBe(22050);
    });

    it('base64-encoded PCM round-trips correctly', async () => {
      const original = new Float32Array([0.5, -0.5, 1.0, -1.0]);
      await manager.playChunk(original, 22050);

      const native = getNativeMock();
      const base64: string = (
        native.playPCMChunk!.mock.calls[0] as [string, number]
      )[0];

      // Decode base64 → binary string → Uint8Array → Float32Array
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const decoded = new Float32Array(bytes.buffer);

      expect(decoded.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(decoded[i]!).toBeCloseTo(original[i]!, 5);
      }
    });

    it('activates ducking (setVolumeDucking true) on the first call', async () => {
      await manager.playChunk(new Float32Array([0]), 22050);

      const native = getNativeMock();
      expect(native.setVolumeDucking).toHaveBeenCalledTimes(1);
      expect(native.setVolumeDucking).toHaveBeenCalledWith(true);
    });

    it('does NOT re-activate ducking on subsequent calls', async () => {
      await manager.playChunk(new Float32Array([0]), 22050);
      await manager.playChunk(new Float32Array([0.1]), 22050);
      await manager.playChunk(new Float32Array([0.2]), 22050);

      const native = getNativeMock();
      expect(native.setVolumeDucking).toHaveBeenCalledTimes(1);
    });

    it('rolls back ducking if playPCMChunk rejects after first-chunk activation', async () => {
      getNativeMock().playPCMChunk!.mockRejectedValueOnce(
        new Error('bridge failed')
      );

      await expect(
        manager.playChunk(new Float32Array([0]), 22050)
      ).rejects.toThrow('bridge failed');

      const native = getNativeMock();
      expect(native.setVolumeDucking).toHaveBeenCalledWith(true);
      expect(native.setVolumeDucking).toHaveBeenCalledWith(false);
    });
  });

  describe('playWav()', () => {
    it('calls native playWav with the exact file path', async () => {
      await manager.playWav('/data/cache/speech.wav');

      const native = getNativeMock();
      expect(native.playWav).toHaveBeenCalledTimes(1);
      expect(native.playWav).toHaveBeenCalledWith('/data/cache/speech.wav');
    });

    it('rejects when native playWav rejects', async () => {
      getNativeMock().playWav!.mockRejectedValueOnce(
        new Error('file not found')
      );

      await expect(manager.playWav('/missing.wav')).rejects.toThrow(
        'file not found'
      );
    });
  });

  describe('stop()', () => {
    it('calls native stopPlayback', async () => {
      await manager.stop();

      const native = getNativeMock();
      expect(native.stopPlayback).toHaveBeenCalledTimes(1);
    });

    it('deactivates ducking (setVolumeDucking false) after playChunk was called', async () => {
      await manager.playChunk(new Float32Array([0]), 22050);
      jest.clearAllMocks();

      await manager.stop();

      const native = getNativeMock();
      expect(native.stopPlayback).toHaveBeenCalledTimes(1);
      expect(native.setVolumeDucking).toHaveBeenCalledWith(false);
    });

    it('does NOT call setVolumeDucking(false) if ducking was never activated', async () => {
      await manager.stop();

      const native = getNativeMock();
      expect(native.stopPlayback).toHaveBeenCalledTimes(1);
      expect(native.setVolumeDucking).not.toHaveBeenCalled();
    });

    it('resets ducking state so next playChunk re-activates ducking', async () => {
      await manager.playChunk(new Float32Array([0]), 22050);
      await manager.stop();
      jest.clearAllMocks();

      await manager.playChunk(new Float32Array([0.1]), 22050);

      const native = getNativeMock();
      expect(native.setVolumeDucking).toHaveBeenCalledWith(true);
    });
  });
});
