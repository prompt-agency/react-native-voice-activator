import { useEffect, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  addWakeWordListener,
  dispose,
  getStatus,
  initialize,
  startDetection,
  stopDetection,
  type WakeWordDetectedEvent,
  type WakeWordError,
  type WakeWordStatus,
} from 'react-native-voice-activator';
import { Btn, C, EventLog, SectionCard, StatusPill, type EventEntry } from '../shared';

// ─── Keyword presets ──────────────────────────────────────────────────────────

const KEYWORD_PRESETS = [
  {
    id: 'all',
    label: 'All bundled phrases',
    keywordAssetKey: 'keywords.txt',
    phrases: 'HELLO WORLD, HI GOOGLE, HEY SIRI, ALEXA, LOVE AND PEACE, PLAY MUSIC, GO HOME, HAPPY NEW YEAR, MERRY CHRISTMAS',
  },
  { id: 'hello-world', label: 'HELLO WORLD', keywordAssetKey: 'keywords-hello-world.txt', phrases: 'HELLO WORLD' },
  { id: 'hi-google', label: 'HI GOOGLE', keywordAssetKey: 'keywords-hi-google.txt', phrases: 'HI GOOGLE' },
  { id: 'hey-siri', label: 'HEY SIRI', keywordAssetKey: 'keywords-hey-siri.txt', phrases: 'HEY SIRI' },
  { id: 'alexa', label: 'ALEXA', keywordAssetKey: 'keywords-alexa.txt', phrases: 'ALEXA' },
  { id: 'love-and-peace', label: 'LOVE AND PEACE', keywordAssetKey: 'keywords-love-and-peace.txt', phrases: 'LOVE AND PEACE' },
  { id: 'play-music', label: 'PLAY MUSIC', keywordAssetKey: 'keywords-play-music.txt', phrases: 'PLAY MUSIC' },
  { id: 'go-home', label: 'GO HOME', keywordAssetKey: 'keywords-go-home.txt', phrases: 'GO HOME' },
  { id: 'happy-new-year', label: 'HAPPY NEW YEAR', keywordAssetKey: 'keywords-happy-new-year.txt', phrases: 'HAPPY NEW YEAR' },
  { id: 'merry-christmas', label: 'MERRY CHRISTMAS', keywordAssetKey: 'keywords-merry-christmas.txt', phrases: 'MERRY CHRISTMAS' },
];

let seq = 0;

// ─── Screen ───────────────────────────────────────────────────────────────────

export function WakeWordScreen() {
  const [status, setStatus] = useState<WakeWordStatus>(() => getStatus());
  const [selectedPresetId, setSelectedPresetId] = useState('all');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [lastDetection, setLastDetection] = useState<WakeWordDetectedEvent | null>(null);
  const [lastError, setLastError] = useState<WakeWordError | null>(null);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [progressText, setProgressText] = useState('');

  const selectedPreset = KEYWORD_PRESETS.find((p) => p.id === selectedPresetId) ?? KEYWORD_PRESETS[0]!;
  const needsReinit = activePresetId !== null && activePresetId !== selectedPresetId;

  function syncDiagnosticsFromStatus(s?: WakeWordStatus) {
    const next = s ?? getStatus();
    setStatus(next);
    setLastError(next.lastError ?? null);
  }

  function pushEvent(label: string, detail: string) {
    setEvents((prev) => [{ id: String(seq++), label, detail }, ...prev].slice(0, 5));
  }

  useEffect(() => {
    const subs = [
      addWakeWordListener('stateChanged', (e) => {
        syncDiagnosticsFromStatus();
        pushEvent('stateChanged', `→ ${e.state}`);
      }),
      addWakeWordListener('wakeWordDetected', (e) => {
        setLastDetection(e);
        pushEvent('wakeWordDetected', `"${e.detectedPhrase}" at ${e.detectedAt}`);
      }),
      addWakeWordListener('error', (e) => {
        syncDiagnosticsFromStatus();
        pushEvent('error', `${e.category}:${e.code}`);
      }),
      addWakeWordListener('interruption', (e) => {
        syncDiagnosticsFromStatus();
        pushEvent('interruption', `${e.reason} (${e.recoverable ? 'recoverable' : 'terminal'})`);
      }),
      addWakeWordListener('audioRouteChanged', (e) => {
        syncDiagnosticsFromStatus();
        pushEvent('audioRouteChanged', `→ ${e.route}`);
      }),
    ];
    syncDiagnosticsFromStatus();
    pushEvent('statusSnapshot', `initial state: ${getStatus().state}`);
    return () => subs.forEach((s) => s.remove());
  }, []);

  async function ensurePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      { title: 'Microphone', message: 'Required for wake word detection.', buttonPositive: 'Allow', buttonNegative: 'Cancel' }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function handleInitialize() {
    if (!(await ensurePermission())) return;
    try {
      await initialize({
        engineConfig: {
          assetKeys: { keywordAssetKey: selectedPreset.keywordAssetKey },
        },
        builtInSTT: { modelId: 'whisper-tiny-en' },
        builtInTTS: { modelId: 'piper-en-lessac' },
        autoSpeak: true,
        onBuiltInProgress: (u) =>
          setProgressText(u.progress != null ? `${u.message} (${u.progress}%)` : u.message),
      });
      setActivePresetId(selectedPresetId);
      setProgressText('');
      setLastDetection(null);
      pushEvent('initialize', selectedPreset.label);
      syncDiagnosticsFromStatus();
    } catch {
      syncDiagnosticsFromStatus();
    }
  }

  async function handleStart() {
    try { await startDetection(); syncDiagnosticsFromStatus(); }
    catch { syncDiagnosticsFromStatus(); }
  }

  async function handleStop() {
    try { await stopDetection(); syncDiagnosticsFromStatus(); }
    catch { syncDiagnosticsFromStatus(); }
  }

  async function handleDispose() {
    try {
      await dispose();
      setLastDetection(null);
      setActivePresetId(null);
      setProgressText('');
      syncDiagnosticsFromStatus();
      pushEvent('dispose', 'runtime torn down');
    } catch { syncDiagnosticsFromStatus(); }
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>

      {/* Header */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>Wake Word Detection</Text>
        <Text style={s.heroSub}>
          Select a keyword preset, initialize, then say the phrase. The runtime
          uses built-in Whisper STT and Piper TTS to transcribe and speak back
          each detection via <Text style={s.heroCode}>autoSpeak: true</Text>.
        </Text>
        <View style={s.pillRow}>
          <StatusPill label={status.state} active={status.isListening} />
          {lastDetection ? (
            <StatusPill label={`"${lastDetection.detectedPhrase}"`} active />
          ) : null}
        </View>
      </View>

      {lastError ? (
        <View style={s.errorBanner}>
          <Text style={s.errorTitle}>{lastError.category}: {lastError.code}</Text>
          <Text style={s.errorBody}>{lastError.message}</Text>
        </View>
      ) : null}

      {progressText ? <Text style={s.progress}>{progressText}</Text> : null}

      {/* Bundled keyword presets */}
      <SectionCard title="Bundled keyword presets">
        <Text style={s.hint}>
          Keyword detection status: {status.state}
          {needsReinit ? ' · Re-initialize to apply new preset' : ''}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
          {KEYWORD_PRESETS.map((preset) => {
            const active = selectedPresetId === preset.id;
            return (
              <Pressable
                key={preset.id}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setSelectedPresetId(preset.id)}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={s.hint}>Phrases: {selectedPreset.phrases}</Text>
        <Text style={s.hint}>Asset key: {selectedPreset.keywordAssetKey}</Text>
        {activePresetId && (
          <Text style={s.hint}>
            Active preset: {KEYWORD_PRESETS.find((p) => p.id === activePresetId)?.label ?? activePresetId}
          </Text>
        )}
        {needsReinit && (
          <Text style={s.warn}>
            Keyword selection changed. Run Initialize again before Start detection.
          </Text>
        )}
      </SectionCard>

      {/* Controls */}
      <SectionCard title="Controls">
        <Btn label="Initialize" onPress={handleInitialize} tone="primary" />
        <Btn label="Start detection" onPress={handleStart} disabled={!status.canStart} />
        <Btn label="Stop detection" onPress={handleStop} disabled={!status.isListening} tone="quiet" />
        <Btn label="Dispose" onPress={handleDispose} tone="danger" />
      </SectionCard>

      {/* Status */}
      <SectionCard title="Status">
        <Text style={s.hint}>isAvailable: {String(status.isAvailable)}</Text>
        <Text style={s.hint}>isListening: {String(status.isListening)}</Text>
        <Text style={s.hint}>canStart: {String(status.canStart)}</Text>
        {status.reason ? <Text style={s.hint}>reason: {status.reason}</Text> : null}
        {lastDetection ? (
          <Text style={s.hint}>
            Detected phrase: {lastDetection.detectedPhrase} at {lastDetection.detectedAt}
          </Text>
        ) : null}
      </SectionCard>

      {/* Background notes */}
      <SectionCard title="Background behavior">
        <Text style={s.meta}>
          iOS background continuation still requires the audio background mode
          and does not survive force-quit.
        </Text>
        <Text style={s.meta}>
          Android background continuation requires a visible app context for
          start and an active foreground-service notification while detection
          is running.
        </Text>
      </SectionCard>

      {/* Recent runtime events */}
      <SectionCard title="Recent runtime events">
        <EventLog events={events} />
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
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  errorBanner: {
    backgroundColor: C.dangerBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.dangerBorder,
    padding: 12,
    gap: 4,
  },
  errorTitle: { fontSize: 14, fontWeight: '700', color: C.dangerText },
  errorBody: { fontSize: 13, color: '#7a3028' },
  progress: { fontSize: 13, color: C.meta, textAlign: 'center' },
  hint: { fontSize: 13, color: C.helper, lineHeight: 18 },
  meta: { fontSize: 14, color: C.meta, lineHeight: 20 },
  warn: {
    fontSize: 13,
    color: '#7a4f1e',
    backgroundColor: '#fdf4e7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f0d9b5',
    padding: 10,
  },
  chipScroll: { marginHorizontal: -4 },
  chip: {
    marginHorizontal: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.tileBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: C.meta },
  chipTextActive: { color: C.primaryText },
});
