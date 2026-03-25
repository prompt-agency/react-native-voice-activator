import { useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  WhisperRNSTTAdapter,
} from 'react-native-voice-activator';
import { Btn, C, SectionCard, StatusPill } from '../shared';

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ManualScreen() {
  // STT — WhisperRN
  const [whisperStatus, setWhisperStatus] = useState<'idle' | 'recording' | 'done' | 'error'>('idle');
  const [whisperTranscript, setWhisperTranscript] = useState('');
  const whisperRef = useRef<WhisperRNSTTAdapter | null>(null);

  async function ensurePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      { title: 'Microphone', message: 'Required for STT.', buttonPositive: 'Allow', buttonNegative: 'Cancel' }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function handleWhisperRecord() {
    if (!(await ensurePermission())) return;
    setWhisperTranscript('');
    setWhisperStatus('recording');
    try {
      const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
      whisperRef.current = adapter;
      await adapter.initialize();
      const result = await adapter.transcribe();
      setWhisperTranscript(result.text);
      setWhisperStatus('done');
    } catch {
      setWhisperTranscript('');
      setWhisperStatus('error');
    } finally {
      whisperRef.current = null;
    }
  }

  async function handleCancelWhisper() {
    try { await whisperRef.current?.cancel(); } catch { /* noop */ }
    setWhisperStatus('idle');
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>

      {/* Header */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>STT · TTS Testing</Text>
        <Text style={s.heroSub}>
          Directly exercise{' '}
          <Text style={s.heroCode}>WhisperRNSTTAdapter</Text> without the wake-word engine.
          Model is downloaded on first use and cached on device.
        </Text>
      </View>

      {/* STT — WhisperRN */}
      <SectionCard title="Speech-to-Text (whisper.rn — iOS + Android)">
        <View style={s.pillRow}>
          <StatusPill label={whisperStatus} active={whisperStatus === 'recording'} />
        </View>
        {whisperStatus === 'recording' ? (
          <Btn label="Cancel recording" onPress={handleCancelWhisper} tone="quiet" />
        ) : (
          <Btn
            label="Record & Transcribe (whisper.rn)"
            onPress={handleWhisperRecord}
            tone="primary"
          />
        )}
        {whisperTranscript ? (
          <View style={s.resultBox}>
            <Text style={s.resultLabel}>TRANSCRIPT</Text>
            <Text style={s.resultText}>{whisperTranscript}</Text>
          </View>
        ) : null}
        <Text style={s.hint}>
          Uses whisper.rn (whisper.cpp binding) — works on iOS and Android.
          Model downloaded on first use.
        </Text>
      </SectionCard>

      {/* TTS placeholder */}
      <SectionCard title="Text-to-Speech (CustomTTSAdapter)">
        <Text style={s.hint}>
          TTS with CustomTTSAdapter requires a bundled .onnx model file.
          {'\n\n'}
          See docs/examples/custom-tts-provider.md for setup instructions.
          Supply a Piper TTS ONNX model and a phonemize callback, then pass
          {'\n'}
          {'  ttsProvider: new CustomTTSAdapter({ modelPath, phonemize })'}
          {'\n'}
          to initialize().
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
});
