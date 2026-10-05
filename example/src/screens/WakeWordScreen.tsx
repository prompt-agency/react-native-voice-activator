import { useEffect, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  addWakeWordListener,
  dispose,
  getStatus,
  initialize,
  startDetection,
  stopDetection,
  validateWakePhrase,
  type WakeWordDetectedEvent,
  type WakeWordError,
  type WakeWordStatus,
} from 'react-native-voice-activator';
import {
  markSpeakerRuntimeDisposed,
  markSpeakerRuntimeReady,
  BUNDLED_MODEL_ASSET_KEY,
  ensureModelsReady,
  ensureSttProvider,
  getDownloadedSpeakerModelPath,
  speakerVerificationProvider,
} from '../providers';
import {
  Btn,
  C,
  EventLog,
  SectionCard,
  StatusPill,
  type EventEntry,
} from '../shared';

// ─── Keyword presets ──────────────────────────────────────────────────────────

const KEYWORD_PRESETS = [
  {
    id: 'all',
    label: 'All bundled phrases',
    keywordAssetKey: 'keywords.txt',
    phrases:
      'HELLO WORLD, HI GOOGLE, HEY SIRI, ALEXA, LOVE AND PEACE, PLAY MUSIC, GO HOME, HAPPY NEW YEAR, MERRY CHRISTMAS',
  },
  {
    id: 'hello-world',
    label: 'HELLO WORLD',
    keywordAssetKey: 'keywords-hello-world.txt',
    phrases: 'HELLO WORLD',
  },
  {
    id: 'hi-google',
    label: 'HI GOOGLE',
    keywordAssetKey: 'keywords-hi-google.txt',
    phrases: 'HI GOOGLE',
  },
  {
    id: 'hey-siri',
    label: 'HEY SIRI',
    keywordAssetKey: 'keywords-hey-siri.txt',
    phrases: 'HEY SIRI',
  },
  {
    id: 'alexa',
    label: 'ALEXA',
    keywordAssetKey: 'keywords-alexa.txt',
    phrases: 'ALEXA',
  },
  {
    id: 'love-and-peace',
    label: 'LOVE AND PEACE',
    keywordAssetKey: 'keywords-love-and-peace.txt',
    phrases: 'LOVE AND PEACE',
  },
  {
    id: 'play-music',
    label: 'PLAY MUSIC',
    keywordAssetKey: 'keywords-play-music.txt',
    phrases: 'PLAY MUSIC',
  },
  {
    id: 'go-home',
    label: 'GO HOME',
    keywordAssetKey: 'keywords-go-home.txt',
    phrases: 'GO HOME',
  },
  {
    id: 'happy-new-year',
    label: 'HAPPY NEW YEAR',
    keywordAssetKey: 'keywords-happy-new-year.txt',
    phrases: 'HAPPY NEW YEAR',
  },
  {
    id: 'merry-christmas',
    label: 'MERRY CHRISTMAS',
    keywordAssetKey: 'keywords-merry-christmas.txt',
    phrases: 'MERRY CHRISTMAS',
  },
];

/**
 * The upstream Sherpa-ONNX demo keywords.
 *
 * Kept for smoke-testing — "Hello World" is unambiguous — but not what an app
 * ships: several are trademarked phrases and none is a product's own name. The
 * custom-phrase tab is the one that matters.
 */
function PresetPicker({
  selectedPresetId,
  onSelect,
  selectedPreset,
  activePresetId,
  needsReinit,
  state,
}: {
  selectedPresetId: string;
  onSelect: (id: string) => void;
  selectedPreset: (typeof KEYWORD_PRESETS)[number];
  activePresetId: string | null;
  needsReinit: boolean;
  state: string;
}) {
  return (
    <>
      <Text style={s.hint}>
        Bundled keyword presets · Keyword detection status: {state}
        {needsReinit ? ' · Re-initialize to apply new preset' : ''}
      </Text>
      <Text style={s.hint}>
        Pre-tokenized upstream demo keywords. Useful for a first smoke test, not
        for shipping.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipScroll}
      >
        {KEYWORD_PRESETS.map((preset) => {
          const active = selectedPresetId === preset.id;
          return (
            <Pressable
              key={preset.id}
              style={[s.chip, active && s.chipActive]}
              onPress={() => onSelect(preset.id)}
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
      {activePresetId ? (
        <Text style={s.hint}>
          Active preset:{' '}
          {KEYWORD_PRESETS.find((p) => p.id === activePresetId)?.label ??
            activePresetId}
        </Text>
      ) : null}
      {needsReinit ? (
        <Text style={s.warn}>
          Keyword selection changed. Run Initialize again before Start
          detection.
        </Text>
      ) : null}
    </>
  );
}

let seq = 0;

// ─── Screen ───────────────────────────────────────────────────────────────────

export function WakeWordScreen() {
  const [status, setStatus] = useState<WakeWordStatus>(() => getStatus());
  const [selectedPresetId, setSelectedPresetId] = useState('all');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  // Custom phrase is the default mode: it is what the package is for, and the
  // bundled presets are upstream demo keywords nobody ships.
  const [useCustomPhrase, setUseCustomPhrase] = useState(true);
  const [phraseInput, setPhraseInput] = useState('hey acme');
  const [activePhrase, setActivePhrase] = useState<string | null>(null);
  const [lastDetection, setLastDetection] =
    useState<WakeWordDetectedEvent | null>(null);
  const [lastError, setLastError] = useState<WakeWordError | null>(null);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [progressText, setProgressText] = useState('');

  const selectedPreset =
    KEYWORD_PRESETS.find((p) => p.id === selectedPresetId) ??
    KEYWORD_PRESETS[0]!;
  const phraseCheck = validateWakePhrase(phraseInput);

  // What is configured versus what is running, so the screen can say when a
  // re-initialize is needed rather than silently detecting the old phrase.
  const activeSelection = useCustomPhrase
    ? phraseCheck.normalized
    : selectedPreset.keywordAssetKey;
  const runningSelection = activePhrase ?? activePresetId;
  const needsReinit =
    runningSelection !== null && runningSelection !== activeSelection;

  function syncDiagnosticsFromStatus(s?: WakeWordStatus) {
    const next = s ?? getStatus();
    setStatus(next);
    setLastError(next.lastError ?? null);
  }

  function pushEvent(label: string, detail: string) {
    setEvents((prev) =>
      [{ id: String(seq++), label, detail }, ...prev].slice(0, 5)
    );
  }

  useEffect(() => {
    const subs = [
      addWakeWordListener('stateChanged', (e) => {
        syncDiagnosticsFromStatus();
        pushEvent('stateChanged', `→ ${e.state}`);
      }),
      addWakeWordListener('wakeWordDetected', (e) => {
        setLastDetection(e);
        pushEvent(
          'wakeWordDetected',
          `"${e.detectedPhrase}" at ${e.detectedAt}`
        );
      }),
      addWakeWordListener('error', (e) => {
        syncDiagnosticsFromStatus();
        pushEvent('error', `${e.category}:${e.code}`);
      }),
      addWakeWordListener('interruption', (e) => {
        syncDiagnosticsFromStatus();
        pushEvent(
          'interruption',
          `${e.reason} (${e.recoverable ? 'recoverable' : 'terminal'})`
        );
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
      {
        title: 'Microphone',
        message: 'Required for wake word detection.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function handleInitialize() {
    if (!(await ensurePermission())) return;
    try {
      const speakerModelPath = await getDownloadedSpeakerModelPath();
      setProgressText('Preparing speech-to-text model...');
      if (useCustomPhrase) {
        // wakePhrase needs an absolute modelAssetKey (initialize() rejects
        // otherwise, since it writes the generated keywords file next to the
        // model bundle), so it stays on the on-demand download path. Presets
        // below use the model bundle already shipped in the app instead.
        await ensureModelsReady((u) =>
          setProgressText(
            u.progress != null ? `${u.message} (${u.progress}%)` : u.message
          )
        );
      }
      const sttProvider = await ensureSttProvider((u) =>
        setProgressText(
          u.progress != null ? `${u.message} (${u.progress}%)` : u.message
        )
      );
      setProgressText('');
      await initialize({
        // wakePhrase and keywordAssetKey are mutually exclusive: one generates a
        // keywords file the package tokenizes before writing, the other selects a
        // pre-tokenized one that ships with the app. Presets pair keywordAssetKey with the bundled
        // modelAssetKey so they load offline; wakePhrase relies on the
        // on-demand download above and passes no modelAssetKey.
        ...(useCustomPhrase
          ? { wakePhrase: phraseInput }
          : {
              engineConfig: {
                assetKeys: {
                  keywordAssetKey: selectedPreset.keywordAssetKey,
                  modelAssetKey: BUNDLED_MODEL_ASSET_KEY,
                },
              },
            }),
        sttProvider,
        // Only wire speaker verification if the model is already on disk;
        // enrollment is what downloads it.
        ...(speakerModelPath
          ? { speakerVerificationProvider, speakerModelPath }
          : {}),
        autoSpeak: true,
      });
      if (speakerModelPath) markSpeakerRuntimeReady();
      else markSpeakerRuntimeDisposed();
      if (useCustomPhrase) {
        setActivePhrase(phraseCheck.normalized);
        setActivePresetId(null);
      } else {
        setActivePresetId(selectedPresetId);
        setActivePhrase(null);
      }
      setProgressText('');
      setLastDetection(null);
      pushEvent(
        'initialize',
        useCustomPhrase
          ? `wakePhrase "${phraseCheck.normalized}"`
          : selectedPreset.label
      );
      syncDiagnosticsFromStatus();
    } catch {
      syncDiagnosticsFromStatus();
    }
  }

  async function handleStart() {
    try {
      await startDetection();
      syncDiagnosticsFromStatus();
    } catch {
      syncDiagnosticsFromStatus();
    }
  }

  async function handleStop() {
    try {
      await stopDetection();
      syncDiagnosticsFromStatus();
    } catch {
      syncDiagnosticsFromStatus();
    }
  }

  async function handleDispose() {
    try {
      await dispose();
      markSpeakerRuntimeDisposed();
      setLastDetection(null);
      setActivePresetId(null);
      setActivePhrase(null);
      setProgressText('');
      syncDiagnosticsFromStatus();
      pushEvent('dispose', 'runtime torn down');
    } catch {
      syncDiagnosticsFromStatus();
    }
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>② Wake Word</Text>
        <Text style={s.heroSub}>
          Type any phrase you like — no training, no cloud, no API key. The
          engine listens continuously on device and wakes your app when it hears
          it. Initialize, then say it aloud.
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
          <Text style={s.errorTitle}>
            {lastError.category}: {lastError.code}
          </Text>
          <Text style={s.errorBody}>{lastError.message}</Text>
        </View>
      ) : null}

      {progressText ? <Text style={s.progress}>{progressText}</Text> : null}

      {/* Mode switch */}
      <SectionCard title="Wake phrase">
        <View style={s.modeRow}>
          <Pressable
            style={[s.modeTab, useCustomPhrase && s.modeTabActive]}
            onPress={() => setUseCustomPhrase(true)}
          >
            <Text
              style={[s.modeTabText, useCustomPhrase && s.modeTabTextActive]}
            >
              Any phrase you like
            </Text>
          </Pressable>
          <Pressable
            style={[s.modeTab, !useCustomPhrase && s.modeTabActive]}
            onPress={() => setUseCustomPhrase(false)}
          >
            <Text
              style={[s.modeTabText, !useCustomPhrase && s.modeTabTextActive]}
            >
              Bundled presets
            </Text>
          </Pressable>
        </View>

        {useCustomPhrase ? (
          <>
            <Text style={s.hint}>
              No training, no GPU, no console, no API key. The package tokenizes
              the phrase against the model's own vocabulary and writes the
              keywords file beside the model bundle, so anything you type here
              works.
            </Text>
            <TextInput
              value={phraseInput}
              onChangeText={setPhraseInput}
              placeholder="hey acme"
              placeholderTextColor={C.helper}
              autoCapitalize="none"
              autoCorrect={false}
              style={[s.input, !phraseCheck.valid && s.inputInvalid]}
            />
            {phraseCheck.valid ? (
              <Text style={s.hint}>
                Will listen for: {phraseCheck.normalized}
              </Text>
            ) : (
              <View style={s.warnBox}>
                {phraseCheck.problems.map((problem) => (
                  <Text key={problem} style={s.warnText}>
                    {problem}
                  </Text>
                ))}
              </View>
            )}
            <Text style={s.hint}>
              Two or more distinct words work far better than one short word: a
              short trigger fires on ordinary speech.
            </Text>
            <View style={s.chipRow}>
              {['hey acme', 'ok computer', 'hello assistant'].map(
                (suggestion) => (
                  <Pressable
                    key={suggestion}
                    style={s.chip}
                    onPress={() => setPhraseInput(suggestion)}
                  >
                    <Text style={s.chipText}>{suggestion}</Text>
                  </Pressable>
                )
              )}
            </View>
            {activePhrase ? (
              <Text style={s.hint}>Active phrase: {activePhrase}</Text>
            ) : null}
            {needsReinit ? (
              <Text style={s.warn}>
                Keyword selection changed. Run Initialize again before Start
                detection.
              </Text>
            ) : null}
          </>
        ) : (
          <PresetPicker
            selectedPresetId={selectedPresetId}
            onSelect={setSelectedPresetId}
            selectedPreset={selectedPreset}
            activePresetId={activePresetId}
            needsReinit={needsReinit}
            state={status.state}
          />
        )}
      </SectionCard>

      {/* Controls */}
      <SectionCard title="Controls">
        <Btn
          label="Initialize"
          onPress={handleInitialize}
          tone="primary"
          disabled={useCustomPhrase && !phraseCheck.valid}
        />
        <Btn
          label="Start detection"
          onPress={handleStart}
          disabled={!status.canStart}
        />
        <Btn
          label="Stop detection"
          onPress={handleStop}
          disabled={!status.isListening}
          tone="quiet"
        />
        <Btn label="Dispose" onPress={handleDispose} tone="danger" />
      </SectionCard>

      {/* Status */}
      <SectionCard title="Status">
        <Text style={s.hint}>isAvailable: {String(status.isAvailable)}</Text>
        <Text style={s.hint}>isListening: {String(status.isListening)}</Text>
        <Text style={s.hint}>canStart: {String(status.canStart)}</Text>
        {status.reason ? (
          <Text style={s.hint}>reason: {status.reason}</Text>
        ) : null}
        {lastDetection ? (
          <Text style={s.hint}>
            Detected phrase: {lastDetection.detectedPhrase} at{' '}
            {lastDetection.detectedAt}
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
          start and an active foreground-service notification while detection is
          running.
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
  modeRow: { flexDirection: 'row', gap: 8 },
  modeTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.tileBg,
    alignItems: 'center',
  },
  modeTabActive: { backgroundColor: C.primary, borderColor: C.primary },
  modeTabText: { fontSize: 13, fontWeight: '600', color: C.secondaryText },
  modeTabTextActive: { color: C.primaryText },
  input: {
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: C.heading,
    backgroundColor: C.card,
  },
  inputInvalid: { borderColor: C.dangerBorder, backgroundColor: C.dangerBg },
  warnText: { fontSize: 13, color: C.warnText, lineHeight: 18 },
  warnBox: {
    backgroundColor: C.warnBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.warnBorder,
    padding: 10,
    gap: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
