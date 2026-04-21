import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
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

  const userId = 'demo-user';

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

      {/* Header */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>Speaker Enrollment</Text>
        <Text style={s.heroSub}>
          Demonstrates the full enrollment round-trip:{' '}
          <Text style={s.heroCode}>enrollSpeaker</Text> →{' '}
          <Text style={s.heroCode}>exportEnrollment</Text> →{' '}
          <Text style={s.heroCode}>clearEnrollment</Text> +{' '}
          <Text style={s.heroCode}>importEnrollment</Text>.
          Copy this pattern for real app integration.
        </Text>
      </View>

      {/* Section 1 — Enroll Speaker */}
      <SectionCard title="Enroll Speaker">
        <Text style={s.hint}>Samples: {sampleCount}/3</Text>
        <Text style={s.hint}>User ID: {userId}</Text>
        <Btn
          label={isRecording ? 'Enrolling…' : 'Record Sample'}
          onPress={handleRecordSample}
          tone="primary"
          disabled={isRecording || sampleCount >= 3}
        />
        <Text style={s.note}>
          On real device: captures mic audio. In simulator: uses dummy data.
        </Text>
      </SectionCard>

      {/* Section 2 — Export & Import */}
      <SectionCard title="Export &amp; Import">
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
  heroTitle: { fontSize: 24, fontWeight: '700', color: C.heroText },
  heroSub: { fontSize: 14, lineHeight: 20, color: C.heroSub },
  heroCode: { fontFamily: 'Menlo', fontSize: 12, color: '#a8d4be' },
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
