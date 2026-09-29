/**
 * Wake-word accuracy harness.
 *
 * This is the screen that turns "we have never measured detection rate or
 * false-accepts-per-hour" into a number. It runs entirely on device, because
 * `evaluateWavFile` is a native call and because the answer is only meaningful
 * on the hardware and audio stack a user actually has.
 *
 * Put a corpus on the device first; see docs/reliability-validation.md.
 *
 *   <corpus root>/positives/*.wav   one utterance of the phrase each
 *   <corpus root>/negatives/*.wav   speech and noise that must never fire
 *
 * The corpus root differs by platform, and on Android it matters: adb cannot
 * write to DocumentDirectoryPath. /data/user/0/<pkg>/files is Permission denied
 * without root, so the corpus has to live in app-specific external storage,
 * /sdcard/Android/data/<pkg>/files, which adb push can reach. Both are searched
 * and the screen prints the paths it looked in.
 *
 * False accepts per hour is a rate, so it needs hours of negative material to
 * mean anything. Minutes produce a number that looks like a measurement and is
 * not one.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  chooseOperatingPoint,
  getModelStatus,
  prepareModels,
  sweepWakeWordSensitivity,
  validateWakePhrase,
  type WakeWordEvaluationResult,
} from 'react-native-voice-activator';
import { Btn, C, SectionCard, StatusPill } from '../shared';

/**
 * Every place a corpus might legitimately be, most reachable first.
 *
 * ExternalDirectoryPath leads on Android because it is the only one of the two
 * that `adb push` can write to. On iOS it is irrelevant, so the filter drops it
 * and DocumentDirectoryPath, which Finder file sharing exposes, is the only
 * candidate.
 */
const CORPUS_ROOTS: string[] = [
  Platform.OS === 'android' ? RNFS.ExternalDirectoryPath : '',
  RNFS.DocumentDirectoryPath,
]
  .filter((root): root is string => typeof root === 'string' && root.length > 0)
  .map((root) => `${root}/wake-word-corpus`);
const SENSITIVITIES = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] as const;

type Corpus = { positives: string[]; negatives: string[] };

async function listWavs(directory: string): Promise<string[]> {
  try {
    const entries = await RNFS.readDir(directory);
    return entries
      .filter(
        (entry: RNFS.ReadDirResItemT) =>
          entry.isFile() && entry.name.toLowerCase().endsWith('.wav')
      )
      .map((entry: RNFS.ReadDirResItemT) => entry.path)
      .sort();
  } catch {
    return [];
  }
}

function defaultDeviceLabel(): string {
  // Prefilled, but editable: an evidence record whose device is "iPhone" is not
  // reproducible, and this is the field that makes the result citable later.
  const version = String(Platform.Version);
  return Platform.OS === 'ios'
    ? `iPhone, iOS ${version}`
    : `Android, API ${version}`;
}

export function EvaluationScreen() {
  const [deviceLabel, setDeviceLabel] = useState(defaultDeviceLabel);
  const [phrase, setPhrase] = useState('hey acme');
  const [budget, setBudget] = useState('1.0');
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [sweep, setSweep] = useState<WakeWordEvaluationResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const negativeHours = useMemo(() => {
    if (!sweep?.length) return null;
    return sweep[0]!.negativeHours;
  }, [sweep]);

  const operatingPoint = useMemo(() => {
    const max = Number(budget);
    if (!sweep || !Number.isFinite(max)) return null;
    return chooseOperatingPoint(sweep, max);
  }, [sweep, budget]);

  const handleScan = useCallback(async () => {
    setError('');
    const found: Corpus = { positives: [], negatives: [] };
    for (const root of CORPUS_ROOTS) {
      const [positives, negatives] = await Promise.all([
        listWavs(`${root}/positives`),
        listWavs(`${root}/negatives`),
      ]);
      found.positives.push(...positives);
      found.negatives.push(...negatives);
    }
    setCorpus(found);
    if (found.positives.length === 0 && found.negatives.length === 0) {
      setError(
        'No .wav files found. Searched:\n' +
          CORPUS_ROOTS.map((root) => `  ${root}`).join('\n') +
          (Platform.OS === 'android'
            ? `\n\nadb push <file> ${CORPUS_ROOTS[0]}/negatives/`
            : '') +
          '\n\nSee docs/reliability-validation.md.'
      );
    }
  }, []);

  const handleRun = useCallback(async () => {
    if (!corpus) return;
    const validation = validateWakePhrase(phrase);
    if (!validation.valid) {
      setError(
        validation.problems.join(' ') || 'That wake phrase is not usable.'
      );
      return;
    }

    setBusy(true);
    setError('');
    setSweep(null);
    try {
      setProgress('Preparing models...');
      await prepareModels();
      const status = await getModelStatus();
      const modelPath = status.directory;
      if (!modelPath) {
        throw new Error('prepareModels() did not yield a model directory.');
      }

      // Same plain-text form initialize({ wakePhrase }) generates, written here
      // so the harness needs nothing beyond the public API.
      const keywordsPath = `${modelPath}/evaluation-keywords.txt`;
      await RNFS.writeFile(keywordsPath, `${validation.normalized}\n`, 'utf8');

      const total = SENSITIVITIES.length;
      const results: WakeWordEvaluationResult[] = [];
      for (const [index, sensitivity] of SENSITIVITIES.entries()) {
        setProgress(
          `Sensitivity ${sensitivity} (${index + 1}/${total}), ` +
            `${corpus.positives.length + corpus.negatives.length} files...`
        );
        const [result] = await sweepWakeWordSensitivity(
          {
            positives: corpus.positives,
            negatives: corpus.negatives,
            modelPath,
            keywordsPath,
            keywordsAreRawText: true,
          },
          [sensitivity]
        );
        results.push(result!);
        setSweep([...results]);
      }
      setProgress('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, [corpus, phrase]);

  const handleExport = useCallback(async () => {
    if (!sweep) return;
    const payload = {
      schema: 'wake-word-evaluation/1',
      recordedAt: new Date().toISOString(),
      device: deviceLabel,
      platform: Platform.OS,
      platformVersion: String(Platform.Version),
      wakePhrase: validateWakePhrase(phrase).normalized ?? phrase,
      corpus: {
        positives: corpus?.positives.length ?? 0,
        negatives: corpus?.negatives.length ?? 0,
        negativeHours: sweep[0]?.negativeHours ?? 0,
      },
      falseAcceptBudgetPerHour: Number(budget),
      operatingPoint: operatingPoint
        ? {
            sensitivity: operatingPoint.sensitivity,
            detectionRate: operatingPoint.detectionRate,
            falseAcceptsPerHour: operatingPoint.falseAcceptsPerHour,
          }
        : null,
      sweep: sweep.map((r) => ({
        sensitivity: r.sensitivity,
        detectionRate: r.detectionRate,
        positivesDetected: r.positivesDetected,
        positivesTotal: r.positivesTotal,
        falseAcceptsPerHour: r.falseAcceptsPerHour,
        falseAcceptTotal: r.falseAcceptTotal,
        negativeHours: r.negativeHours,
      })),
    };

    const json = JSON.stringify(payload, null, 2);
    const outPath = `${RNFS.DocumentDirectoryPath}/wake-word-evaluation-${Date.now()}.json`;
    await RNFS.writeFile(outPath, json, 'utf8');
    await Share.share({ message: json, title: 'Wake word evaluation' });
    setProgress(`Written to ${outPath}`);
  }, [sweep, deviceLabel, phrase, budget, corpus, operatingPoint]);

  return (
    <ScrollView contentContainerStyle={s.content}>
      <SectionCard title="Corpus">
        <Text style={s.helper}>
          Place WAV files under positives/ and negatives/ in one of these:
        </Text>
        {CORPUS_ROOTS.map((root) => (
          <Text key={root} style={s.path} selectable>
            {root}
          </Text>
        ))}
        <Text style={s.helper}>
          False accepts per hour needs hours of negative audio to mean anything.
        </Text>
        <Btn label="Scan corpus" onPress={handleScan} disabled={busy} />
        {corpus && (
          <View style={s.pills}>
            <StatusPill
              label={`${corpus.positives.length} positives`}
              active={corpus.positives.length > 0}
            />
            <StatusPill
              label={`${corpus.negatives.length} negatives`}
              active={corpus.negatives.length > 0}
            />
          </View>
        )}
      </SectionCard>

      <SectionCard title="Run">
        <Text style={s.label}>Device (goes into the record)</Text>
        <TextInput
          style={s.input}
          value={deviceLabel}
          onChangeText={setDeviceLabel}
        />
        <Text style={s.label}>Wake phrase</Text>
        <TextInput
          style={s.input}
          value={phrase}
          onChangeText={setPhrase}
          autoCapitalize="none"
        />
        <Text style={s.label}>False-accept budget (per hour)</Text>
        <TextInput
          style={s.input}
          value={budget}
          onChangeText={setBudget}
          keyboardType="decimal-pad"
        />
        <Btn
          label="Run sensitivity sweep"
          tone="primary"
          onPress={handleRun}
          disabled={busy || !corpus || corpus.positives.length === 0}
        />
        {busy && (
          <View style={s.progressRow}>
            <ActivityIndicator />
            <Text style={s.helper}>{progress}</Text>
          </View>
        )}
        {!busy && progress !== '' && <Text style={s.helper}>{progress}</Text>}
        {error !== '' && <Text style={s.error}>{error}</Text>}
      </SectionCard>

      {sweep && sweep.length > 0 && (
        <SectionCard title="Curve">
          <View style={s.row}>
            <Text style={[s.cell, s.headCell]}>sens</Text>
            <Text style={[s.cell, s.headCell]}>detect</Text>
            <Text style={[s.cell, s.headCell]}>FA/hr</Text>
          </View>
          {sweep.map((r) => (
            <View key={r.sensitivity} style={s.row}>
              <Text style={s.cell}>{r.sensitivity.toFixed(2)}</Text>
              <Text style={s.cell}>
                {(r.detectionRate * 100).toFixed(1)}% ({r.positivesDetected}/
                {r.positivesTotal})
              </Text>
              <Text style={s.cell}>{r.falseAcceptsPerHour.toFixed(2)}</Text>
            </View>
          ))}
          <Text style={s.helper}>
            {negativeHours != null
              ? `Across ${negativeHours.toFixed(2)} h of negative audio.` +
                (negativeHours < 1
                  ? ' Under an hour: treat FA/hr as indicative only.'
                  : '')
              : ''}
          </Text>
          <Text style={s.helper}>
            {operatingPoint
              ? `Best within ${budget}/hr: sensitivity ${operatingPoint.sensitivity} ` +
                `at ${(operatingPoint.detectionRate * 100).toFixed(1)}% detection.`
              : `No sensitivity stays within ${budget} false accepts per hour. ` +
                'That is a real answer: the phrase needs changing.'}
          </Text>
          <Btn label="Export JSON" onPress={handleExport} disabled={busy} />
        </SectionCard>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  helper: { fontSize: 13, color: C.helper, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: C.label },
  error: { fontSize: 13, color: C.dangerText },
  path: {
    fontSize: 11,
    color: C.meta,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  input: {
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.tileBg,
    color: C.heading,
  },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, fontSize: 13, color: C.meta },
  headCell: { fontWeight: '700', color: C.heading },
});
