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
  SherpaOnnxTTSAdapter,
  WhisperRNSTTAdapter,
} from 'react-native-voice-activator';
import { ensureRyanSherpaAssets } from '../sherpa-tts-utils';
import { Btn, C, SectionCard, StatusPill } from '../shared';

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ManualScreen() {
  // STT — WhisperRN
  const [whisperStatus, setWhisperStatus] = useState<
    'idle' | 'initializing' | 'recording' | 'transcribing' | 'done' | 'error'
  >('idle');
  const [whisperProgress, setWhisperProgress] = useState('');
  const [whisperTranscript, setWhisperTranscript] = useState('');
  const [whisperError, setWhisperError] = useState('');
  const whisperRef = useRef<WhisperRNSTTAdapter | null>(null);

  // TTS — SherpaOnnxTTSAdapter (en_US-ryan-low via sherpa-onnx C API)
  const [ttsText, setTtsText] = useState(
    'Hello! This is a neural text to speech test using the Ryan voice model.'
  );
  const [ttsStatus, setTtsStatus] = useState<
    'idle' | 'loading' | 'speaking' | 'error'
  >('idle');
  const [ttsProgress, setTtsProgress] = useState('');
  const [ttsError, setTtsError] = useState('');
  const ttsRef = useRef<SherpaOnnxTTSAdapter | null>(null);

  async function ensurePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone',
        message: 'Required for STT.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  // ── STT ──────────────────────────────────────────────────────────────────────

  async function handleWhisperRecord() {
    if (!(await ensurePermission())) return;
    setWhisperTranscript('');
    setWhisperError('');
    setWhisperProgress('');
    setWhisperStatus('initializing');
    try {
      const adapter = new WhisperRNSTTAdapter({ modelId: 'whisper-tiny-en' });
      whisperRef.current = adapter;
      await adapter.initialize(
        (update: { message: string; progress?: number }) => {
          setWhisperProgress(
            update.progress != null
              ? `${update.message} (${update.progress}%)`
              : update.message
          );
        }
      );
      setWhisperProgress('');
      setWhisperStatus('recording');
      const result = await adapter.transcribe();
      setWhisperStatus('transcribing');
      setWhisperTranscript(result.text || '(empty — model returned no text)');
      setWhisperStatus('done');
    } catch (error) {
      setWhisperError(String(error));
      setWhisperStatus('error');
    } finally {
      whisperRef.current = null;
      setWhisperProgress('');
    }
  }

  async function handleCancelWhisper() {
    try {
      await whisperRef.current?.cancel();
    } catch {
      /* noop */
    }
    setWhisperStatus('idle');
    setWhisperProgress('');
  }

  // ── TTS ──────────────────────────────────────────────────────────────────────

  async function handleSpeak() {
    if (!ttsText.trim()) return;
    setTtsError('');
    setTtsProgress('');
    setTtsStatus('loading');
    try {
      // Step 1 — download / verify model assets
      setTtsProgress('Step 1/2: Verifying model assets…');
      const { modelPath, tokensPath, dataDir } = await ensureRyanSherpaAssets(
        (msg: string, pct?: number) => {
          setTtsProgress(pct != null ? `${msg} (${pct}%)` : msg);
        }
      );

      // Step 2 — synthesize + play (model loading is inside native layer)
      setTtsProgress('Step 2/2: Synthesising…');
      setTtsStatus('speaking');

      const adapter = new SherpaOnnxTTSAdapter({ modelPath, tokensPath, dataDir });
      ttsRef.current = adapter;
      await adapter.speak(ttsText);

      setTtsStatus('idle');
    } catch (error) {
      setTtsError(String(error));
      setTtsStatus('error');
    } finally {
      ttsRef.current = null;
      setTtsProgress('');
    }
  }

  async function handleStopSpeech() {
    try {
      await ttsRef.current?.stop();
    } catch {
      /* noop */
    }
    setTtsStatus('idle');
    setTtsProgress('');
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>STT · TTS Testing</Text>
        <Text style={s.heroSub}>
          Exercise{' '}
          <Text style={s.heroCode}>WhisperRNSTTAdapter</Text> (STT) and{' '}
          <Text style={s.heroCode}>SherpaOnnxTTSAdapter</Text> (Ryan voice)
          without the wake-word engine. Models are downloaded on first use.
        </Text>
      </View>

      {/* STT — WhisperRN */}
      <SectionCard title="Speech-to-Text (whisper.rn — iOS + Android)">
        <View style={s.pillRow}>
          <StatusPill
            label={whisperStatus}
            active={
              whisperStatus === 'recording' ||
              whisperStatus === 'initializing' ||
              whisperStatus === 'transcribing'
            }
          />
        </View>
        {whisperProgress ? (
          <Text style={s.progressText}>{whisperProgress}</Text>
        ) : null}
        {whisperStatus === 'recording' ? (
          <Btn
            label="Stop & Transcribe"
            onPress={handleCancelWhisper}
            tone="quiet"
          />
        ) : whisperStatus === 'initializing' ||
          whisperStatus === 'transcribing' ? (
          <Btn label="Working…" onPress={() => {}} disabled tone="quiet" />
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
        {whisperError ? (
          <View style={s.errorBox}>
            <Text style={s.resultLabel}>ERROR</Text>
            <Text style={s.errorText}>{whisperError}</Text>
          </View>
        ) : null}
        <Text style={s.hint}>
          Model downloaded on first use (~75 MB, cached).{'\n'}
          If you see [SOUND]: audio captured but not recognised as speech —
          speak louder/closer to the mic or check mic permissions.
        </Text>
      </SectionCard>

      {/* TTS — SherpaOnnxTTSAdapter */}
      <SectionCard title="Text-to-Speech (Ryan · Sherpa-ONNX · iOS)">
        <View style={s.pillRow}>
          <StatusPill
            label={ttsStatus}
            active={ttsStatus === 'loading' || ttsStatus === 'speaking'}
          />
        </View>
        {ttsProgress ? (
          <Text style={s.progressText}>{ttsProgress}</Text>
        ) : null}
        <TextInput
          style={s.textInput}
          value={ttsText}
          onChangeText={setTtsText}
          multiline
          placeholder="Enter text to speak…"
          placeholderTextColor={C.helper}
          editable={ttsStatus === 'idle' || ttsStatus === 'error'}
        />
        {ttsStatus === 'speaking' || ttsStatus === 'loading' ? (
          <Btn label="Stop" onPress={handleStopSpeech} tone="danger" />
        ) : (
          <Btn
            label="Speak (Ryan · Sherpa-ONNX)"
            onPress={handleSpeak}
            tone="primary"
            disabled={!ttsText.trim()}
          />
        )}
        {ttsError ? (
          <View style={s.errorBox}>
            <Text style={s.resultLabel}>ERROR</Text>
            <Text style={s.errorText}>{ttsError}</Text>
          </View>
        ) : null}
        <Text style={s.hint}>
          Uses SherpaOnnxTTSAdapter — runs Piper VITS natively via the
          sherpa-onnx C API already bundled in the library XCFramework.
          {'\n'}
          Model downloaded on first use (~63 MB, cached). iOS only.
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
  progressText: { fontSize: 13, color: C.meta, fontStyle: 'italic' },
  resultBox: {
    backgroundColor: C.tileBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 4,
  },
  errorBox: {
    backgroundColor: C.dangerBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.dangerBorder,
    padding: 12,
    gap: 4,
  },
  resultLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.label,
    letterSpacing: 0.5,
  },
  resultText: { fontSize: 14, color: C.heading, lineHeight: 20 },
  errorText: { fontSize: 14, color: C.dangerText, lineHeight: 20 },
  textInput: {
    backgroundColor: C.tileBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    fontSize: 14,
    color: C.heading,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
