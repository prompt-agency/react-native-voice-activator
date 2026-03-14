import { useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  RunAnywhereSTTAdapter,
  RunAnywhereTTSAdapter,
  type BuiltInProviderProgress,
} from 'react-native-voice-activator';
import { Btn, C, SectionCard, StatusPill } from '../shared';

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ManualScreen() {
  // STT
  const [sttStatus, setSttStatus] = useState<'idle' | 'recording' | 'done' | 'error'>('idle');
  const [transcript, setTranscript] = useState('');
  const sttRef = useRef<RunAnywhereSTTAdapter | null>(null);

  // TTS
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'speaking' | 'done' | 'error'>('idle');
  const [ttsInput, setTtsInput] = useState('Hello from Piper TTS!');
  const ttsRef = useRef<RunAnywhereTTSAdapter | null>(null);

  // Shared progress
  const [progressText, setProgressText] = useState('');

  function onProgress(u: BuiltInProviderProgress) {
    setProgressText(u.progress != null ? `${u.message} (${u.progress}%)` : u.message);
  }

  async function ensurePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      { title: 'Microphone', message: 'Required for STT.', buttonPositive: 'Allow', buttonNegative: 'Cancel' }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function handleRecord() {
    if (!(await ensurePermission())) return;
    setProgressText('');
    setTranscript('');
    setSttStatus('recording');
    try {
      const adapter = new RunAnywhereSTTAdapter({ modelId: 'whisper-tiny-en' }, onProgress);
      sttRef.current = adapter;
      const result = await adapter.transcribe();
      setTranscript(result.text);
      setSttStatus('done');
    } catch (e: any) {
      setTranscript('');
      setSttStatus('error');
    } finally {
      setProgressText('');
      sttRef.current = null;
    }
  }

  async function handleCancelSTT() {
    try { await sttRef.current?.cancel(); } catch { /* noop */ }
    setSttStatus('idle');
    setProgressText('');
  }

  async function handleSpeak() {
    if (!ttsInput.trim()) return;
    setProgressText('');
    setTtsStatus('speaking');
    try {
      const adapter = new RunAnywhereTTSAdapter({ modelId: 'piper-en-lessac' }, onProgress);
      ttsRef.current = adapter;
      await adapter.speak(ttsInput.trim());
      setTtsStatus('done');
    } catch {
      setTtsStatus('error');
    } finally {
      setProgressText('');
      ttsRef.current = null;
    }
  }

  async function handleStopTTS() {
    try { await ttsRef.current?.stop(); } catch { /* noop */ }
    setTtsStatus('idle');
    setProgressText('');
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>

      {/* Header */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>STT · TTS Testing</Text>
        <Text style={s.heroSub}>
          Directly exercise{' '}
          <Text style={s.heroCode}>RunAnywhereSTTAdapter</Text> and{' '}
          <Text style={s.heroCode}>RunAnywhereTTSAdapter</Text> without the wake-word engine.
          Models are downloaded on first use and cached on device.
        </Text>
      </View>

      {progressText ? <Text style={s.progress}>{progressText}</Text> : null}

      {/* STT */}
      <SectionCard title="Speech-to-Text (Whisper tiny-en)">
        <View style={s.pillRow}>
          <StatusPill label={sttStatus} active={sttStatus === 'recording'} />
        </View>
        {sttStatus === 'recording' ? (
          <Btn label="Cancel recording" onPress={handleCancelSTT} tone="quiet" />
        ) : (
          <Btn
            label="Record & Transcribe"
            onPress={handleRecord}
            tone="primary"
            disabled={sttStatus === 'recording'}
          />
        )}
        {transcript ? (
          <View style={s.resultBox}>
            <Text style={s.resultLabel}>TRANSCRIPT</Text>
            <Text style={s.resultText}>{transcript}</Text>
          </View>
        ) : null}
        <Text style={s.hint}>
          Tap the button, speak, then remain silent — the adapter will detect
          end-of-speech automatically via VAD and return the transcript.
        </Text>
      </SectionCard>

      {/* TTS */}
      <SectionCard title="Text-to-Speech (Piper lessac)">
        <View style={s.pillRow}>
          <StatusPill label={ttsStatus} active={ttsStatus === 'speaking'} />
        </View>
        <TextInput
          style={s.input}
          value={ttsInput}
          onChangeText={setTtsInput}
          placeholder="Enter text to speak…"
          placeholderTextColor={C.label}
          multiline
        />
        {ttsStatus === 'speaking' ? (
          <Btn label="Stop" onPress={handleStopTTS} tone="quiet" />
        ) : (
          <Btn
            label="Speak"
            onPress={handleSpeak}
            tone="primary"
            disabled={!ttsInput.trim() || ttsStatus === 'speaking'}
          />
        )}
        <Text style={s.hint}>
          Edit the text above, tap Speak. The Piper neural TTS model synthesises
          speech entirely on-device with no network call.
        </Text>
      </SectionCard>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  hero: { backgroundColor: C.hero, borderRadius: 20, padding: 18, gap: 10 },
  heroTitle: { fontSize: 24, fontWeight: '700', color: C.heroText },
  heroSub: { fontSize: 14, lineHeight: 20, color: C.heroSub },
  heroCode: { fontFamily: 'Menlo', fontSize: 12, color: '#a8d4be' },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  progress: { fontSize: 13, color: C.meta, textAlign: 'center' },
  hint: { fontSize: 13, color: C.helper, lineHeight: 18 },
  resultBox: {
    backgroundColor: C.tileBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 4,
  },
  resultLabel: { fontSize: 10, fontWeight: '700', color: C.label, letterSpacing: 0.5 },
  resultText: { fontSize: 14, color: C.heading, lineHeight: 20 },
  input: {
    backgroundColor: C.tileBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    fontSize: 14,
    color: C.heading,
    lineHeight: 20,
    minHeight: 72,
    textAlignVertical: 'top',
  },
});
