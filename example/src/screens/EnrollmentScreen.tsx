import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import LiveAudioStream from '@fugood/react-native-audio-pcm-stream';
import { ensureSpeakerRuntime } from '../providers';
import {
  addWakeWordListener,
  getStatus,
  voiceActivator,
  type EnrollmentData,
} from 'react-native-voice-activator';
import { Btn, C, SectionCard } from '../shared';

// ─── Constants ────────────────────────────────────────────────────────────────

const BAR_MULTIPLIERS = [0.5, 0.9, 0.7, 1.0, 0.8, 1.0, 0.6, 0.85];

/**
 * enrollSpeaker() hands the buffer straight to the Sherpa native bridge as raw
 * PCM (the adapter names it `pcmBase64`) and voice-activator.ts hardcodes a
 * 16 kHz sample rate, so the capture side must produce exactly that.
 * AudioRecorderPlayer cannot: MediaRecorder only emits encoded containers
 * (MPEG_4/AAC), whose compressed bytes are not valid PCM samples.
 *
 * Note: this is a contract fix, not a crash fix. The SIGABRT seen during
 * enrollment came from the missing speaker model asset, not from the audio
 * format. This path is still unverified end to end for that reason.
 */
const SAMPLE_RATE = 16_000;
const RECORD_MS = 2000;

/**
 * Must run before every start(), not just once: stop() releases the underlying
 * native recorder, and a subsequent start() without re-initializing produces a
 * stream that emits no data at all (the second enrollment sample came back
 * with zero bytes).
 */
function initPcmStream(): void {
  LiveAudioStream.init({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    bitsPerSample: 16,
    audioSource: 6, // VOICE_RECOGNITION — matches WhisperRNSTTAdapter
    bufferSize: 4096,
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Peak amplitude of a 16-bit LE PCM chunk, as dBFS, for the level meter. */
function chunkPeakDb(bytes: Uint8Array): number {
  const samples = new Int16Array(
    bytes.buffer,
    bytes.byteOffset,
    Math.floor(bytes.byteLength / 2)
  );
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]!);
    if (v > peak) peak = v;
  }
  if (peak === 0) return -60;
  return Math.max(-60, 20 * Math.log10(peak / 32768));
}

/** Capture raw 16 kHz mono 16-bit PCM for `ms`, reporting level as it goes. */
function recordPcm(
  ms: number,
  onLevel: (db: number) => void,
  registerStop?: (stop: () => void) => void
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    let subscription: { remove(): void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const chunks: Uint8Array[] = [];
    let settled = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try {
        LiveAudioStream.stop();
      } catch {
        // stop() on an already-stopped stream is not fatal
      }
      subscription?.remove();
    };

    try {
      initPcmStream();
      subscription = LiveAudioStream.on('data', (b64) => {
        const bytes = base64ToBytes(b64);
        chunks.push(bytes);
        onLevel(chunkPeakDb(bytes));
      });
      LiveAudioStream.start();
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();

      const total = chunks.reduce((n, c) => n + c.length, 0);
      if (total === 0) {
        reject(new Error('No audio captured — is the microphone in use?'));
        return;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      resolve(out.buffer);
    };

    registerStop?.(finish);
    timer = setTimeout(finish, ms);
  });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function EnrollmentScreen() {
  const [sampleCount, setSampleCount] = useState(0);
  const [exportedData, setExportedData] = useState<string | null>(null);
  const [status, setStatus] = useState('No action taken yet.');
  const [isRecording, setIsRecording] = useState(false);
  const [isReady, setIsReady] = useState(() => getStatus().isAvailable);

  const [userId, setUserId] = useState('demo-user');
  const [meterDb, setMeterDb] = useState(-60);

  const isMounted = useRef(true);
  const stopRecordingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const sub = addWakeWordListener('stateChanged', () => {
      const available = getStatus().isAvailable;
      setIsReady(available);
      if (!available) {
        setSampleCount(0);
        setExportedData(null);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Leaving mid-recording must release the mic, or the next capture
      // silently returns zero bytes.
      stopRecordingRef.current = null;
      try {
        LiveAudioStream.stop();
      } catch {
        // not recording — nothing to release
      }
    };
  }, []);

  // ── Enroll ───────────────────────────────────────────────────────────────────

  async function ensureMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone',
        message: 'Required to capture voice samples.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function handleRecordSample() {
    if (!(await ensureMicPermission())) {
      setStatus('Microphone permission denied.');
      return;
    }
    setIsRecording(true);
    try {
      // The runtime is a shared singleton and this is the app's first tab, so
      // on a cold launch nothing has initialized it yet and enrollSpeaker()
      // would throw for a missing speakerVerificationProvider.
      setStatus('Preparing speaker runtime…');
      await ensureSpeakerRuntime(({ percent, receivedBytes, totalBytes }) => {
        if (!isMounted.current) return;
        const mb = (n: number) => (n / 1_000_000).toFixed(1);
        setStatus(
          percent === null
            ? `Downloading speaker model — ${mb(receivedBytes)} MB…`
            : `Downloading speaker model — ${percent}% (${mb(receivedBytes)} / ${mb(totalBytes)} MB). This happens once; please wait.`
        );
      });
    } catch (err) {
      setStatus(`Error preparing runtime: ${String(err)}`);
      setIsRecording(false);
      return;
    }
    setStatus('Recording — say a short phrase…');
    try {
      const buffer = await recordPcm(
        RECORD_MS,
        (db) => {
          if (isMounted.current) setMeterDb(db);
        },
        (stop) => {
          stopRecordingRef.current = stop;
        }
      );
      stopRecordingRef.current = null;
      if (!isMounted.current) return;
      setMeterDb(-60);
      await voiceActivator.enrollSpeaker(userId.trim(), buffer);
      if (!isMounted.current) return;
      setSampleCount((prev) => {
        setStatus(`Sample ${prev + 1} recorded`);
        return prev + 1;
      });
    } catch (err) {
      if (isMounted.current) {
        setMeterDb(-60);
        setStatus(`Error recording sample: ${String(err)}`);
      }
    } finally {
      if (isMounted.current) setIsRecording(false);
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  async function handleExport() {
    try {
      const data: EnrollmentData = await voiceActivator.exportEnrollment();
      const json = JSON.stringify(data, null, 2);
      setExportedData(json);
      const speakerCount = Array.isArray((data as Record<string, unknown>).speakers)
        ? ((data as Record<string, unknown>).speakers as unknown[]).length
        : 1;
      setStatus(`Exported ${speakerCount} speaker(s)`);
    } catch (err) {
      setStatus(`Error exporting: ${String(err)}`);
    }
  }

  // ── Simulate restart (clear + re-import) ─────────────────────────────────────

  async function handleSimulateRestart() {
    if (!exportedData) return;
    try {
      await voiceActivator.clearEnrollment();
      const parsed = JSON.parse(exportedData) as EnrollmentData;
      await voiceActivator.importEnrollment(parsed);
      setStatus('Cleared and re-imported enrollment');
    } catch (err) {
      setStatus(`Error during simulate restart: ${String(err)}`);
    }
  }

  // ── Clear all ────────────────────────────────────────────────────────────────

  async function handleClearAll() {
    try {
      await voiceActivator.clearEnrollment();
      setSampleCount(0);
      setExportedData(null);
      setStatus('Enrollment cleared');
    } catch (err) {
      setStatus(`Error clearing enrollment: ${String(err)}`);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>

      {/* Hero */}
      <View style={s.hero}>
        <Text style={s.heroLabel}>① SPEAKER ID</Text>
        <Text style={s.heroTitle}>Voice enrollment & verification</Text>
        <Text style={s.heroSub}>
          Enroll a user's voice with 3 short recordings. The library creates a
          compact voice embedding — your app can verify this person's identity
          on any future interaction. Use for: personalized assistants, access
          control, multi-user devices.
        </Text>
        <View style={s.startHint}>
          <Text style={s.startHintText}>✦ New here? This is the recommended first tab.</Text>
        </View>
      </View>

      {/* Not-initialized warning */}
      {!isReady && (
        <View style={s.warning}>
          <Text style={s.warningText}>
            Runtime not initialized. Go to the Wake Word tab, press Initialize, then return here.
          </Text>
        </View>
      )}

      {/* Section 1 — Enroll Speaker */}
      <SectionCard title="Enroll Speaker">
        <View style={s.userIdRow}>
          <Text style={s.hint}>User ID</Text>
          <TextInput
            style={s.userIdInput}
            value={userId}
            onChangeText={setUserId}
            placeholder="e.g. alice"
            placeholderTextColor={C.meta}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={s.dotsRow}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[s.dot, sampleCount >= n && s.dotFilled]}>
              <Text style={[s.dotNum, sampleCount >= n && s.dotNumFilled]}>{n}</Text>
            </View>
          ))}
          <Text style={s.hint}>{sampleCount} of 3 samples recorded</Text>
        </View>
        {isRecording ? (
          <View style={s.waveform}>
            {BAR_MULTIPLIERS.map((mult, i) => {
              const normalized = Math.max(0, Math.min(1, (meterDb + 60) / 60));
              const height = 4 + normalized * mult * 28;
              return <View key={i} style={[s.waveBar, { height }]} />;
            })}
          </View>
        ) : null}
        <Btn
          label={isRecording ? 'Recording…' : sampleCount < 3 ? `Record Sample ${sampleCount + 1}` : 'All Samples Recorded'}
          onPress={handleRecordSample}
          tone="primary"
          disabled={!isReady || isRecording || sampleCount >= 3 || userId.trim() === ''}
        />
        {isRecording ? (
          <Btn
            label="Stop recording"
            onPress={() => stopRecordingRef.current?.()}
            tone="quiet"
          />
        ) : null}
        <Text style={s.note}>
          Say a short phrase — any sentence works. About 2 seconds each.
        </Text>
      </SectionCard>

      {/* Section 2 — Persist Enrollment */}
      <SectionCard title="Persist Enrollment">
        <Text style={s.hint}>
          Export your enrollment data to JSON so it survives app restarts.
          Import it back to restore without re-recording.
        </Text>
        <Btn
          label="Export Enrollment"
          onPress={handleExport}
          tone="secondary"
          disabled={sampleCount === 0}
        />
        <Btn
          label="Simulate Restart (Clear + Re-import)"
          onPress={handleSimulateRestart}
          tone="quiet"
          disabled={exportedData === null}
        />
        <Btn
          label="Clear All"
          onPress={handleClearAll}
          tone="danger"
        />
      </SectionCard>

      {/* Section 3 — Status */}
      <SectionCard title="Status">
        <Text style={s.statusText}>{status}</Text>
        {exportedData ? (
          <View style={s.previewBox}>
            <Text style={s.previewLabel}>EXPORTED DATA (preview)</Text>
            <Text style={s.previewText}>
              {exportedData.length > 100
                ? exportedData.slice(0, 100) + '...'
                : exportedData}
            </Text>
          </View>
        ) : null}
      </SectionCard>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  hero: {
    backgroundColor: C.hero,
    borderRadius: 20,
    padding: 18,
    gap: 10,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.heroSub,
    letterSpacing: 1,
  },
  heroTitle: { fontSize: 22, fontWeight: '700', color: C.heroText },
  heroSub: { fontSize: 13, lineHeight: 20, color: C.heroSub },
  startHint: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 8,
  },
  startHintText: { fontSize: 12, color: C.heroText },
  userIdRow: { gap: 4 },
  userIdInput: {
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: C.heading,
  },
  warning: {
    backgroundColor: '#3d2a00',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7a5500',
    padding: 14,
  },
  warningText: { fontSize: 13, color: '#ffc455', lineHeight: 19 },
  hint: { fontSize: 13, color: C.helper, lineHeight: 18 },
  note: {
    fontSize: 12,
    color: C.meta,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  statusText: { fontSize: 14, color: C.helper, lineHeight: 20 },
  previewBox: {
    backgroundColor: C.tileBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 4,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.label,
    letterSpacing: 0.5,
  },
  previewText: {
    fontSize: 12,
    fontFamily: 'Menlo',
    color: C.heading,
    lineHeight: 18,
  },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.bg,
    borderWidth: 2,
    borderColor: C.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotFilled: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  dotNum: { fontSize: 13, fontWeight: '700', color: C.meta },
  dotNumFilled: { color: C.primaryText },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 36,
    backgroundColor: C.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: C.primary,
  },
});
