import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addWakeWordListener,
  getStatus,
  voiceActivator,
  type EnrollmentData,
} from 'react-native-voice-activator';
import { Btn, C, SectionCard } from '../shared';

// ─── Screen ───────────────────────────────────────────────────────────────────

export function EnrollmentScreen() {
  const [sampleCount, setSampleCount] = useState(0);
  const [exportedData, setExportedData] = useState<string | null>(null);
  const [status, setStatus] = useState('No action taken yet.');
  const [isRecording, setIsRecording] = useState(false);
  const [isReady, setIsReady] = useState(() => getStatus().isAvailable);

  const [userId, setUserId] = useState('demo-user');

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

  // ── Enroll ───────────────────────────────────────────────────────────────────

  async function handleRecordSample() {
    setIsRecording(true);
    try {
      // Create a dummy ArrayBuffer (512 bytes of zeros) for the demo.
      // On a real device this would be replaced with mic-captured PCM audio.
      const dummyBuffer = new ArrayBuffer(512);
      await voiceActivator.enrollSpeaker(userId, dummyBuffer);
      const next = sampleCount + 1;
      setSampleCount(next);
      setStatus(`Sample ${next} enrolled`);
    } catch (err) {
      setStatus(`Error enrolling sample: ${String(err)}`);
    } finally {
      setIsRecording(false);
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
        <Text style={s.hint}>Samples: {sampleCount}/3</Text>
        <Btn
          label={isRecording ? 'Recording…' : `Record Sample ${sampleCount + 1}`}
          onPress={handleRecordSample}
          tone="primary"
          disabled={!isReady || isRecording || sampleCount >= 3 || userId.trim() === ''}
        />
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
  heroCode: { fontFamily: 'Menlo', fontSize: 12, color: '#a8d4be' },
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
});
