import { useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createExternalAudioDetector,
  prepareModels,
  startAudioCapture,
  validateWakePhrase,
} from 'react-native-voice-activator';
import {
  ExternalAudioTestSession,
  type ExternalTestSnapshot,
} from '../external-audio-test-session';
import { Btn, C, SectionCard, StatusPill } from '../shared';

async function requestMicrophone(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone access',
      message: 'Use the microphone to test wake phrase detection.',
      buttonPositive: 'Allow',
      buttonNegative: 'Cancel',
    }
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function ExternalAudioCard() {
  const [phrase, setPhrase] = useState('hello world');
  const [snapshot, setSnapshot] = useState<ExternalTestSnapshot>({
    phase: 'idle',
    progress: '',
    frames: 0,
    dropped: 0,
    detections: 0,
    lastKeyword: null,
    error: null,
  });
  const mounted = useRef(false);
  const session = useRef<ExternalAudioTestSession | null>(null);

  if (!session.current) {
    session.current = new ExternalAudioTestSession(
      {
        requestPermission: requestMicrophone,
        prepareModels: async (onProgress) => {
          await prepareModels({
            onProgress: ({ percent }) => {
              onProgress(`Preparing models: ${percent}%`);
            },
          });
        },
        createDetector: (wakePhrase) =>
          createExternalAudioDetector({ wakePhrase }),
        startCapture: (onFrame) =>
          startAudioCapture(({ pcmBase64 }) => onFrame(pcmBase64)),
      },
      (next) => {
        if (mounted.current) setSnapshot(next);
      }
    );
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      session.current?.stop().catch(() => undefined);
    };
  }, []);

  const validation = validateWakePhrase(phrase);
  const active =
    snapshot.phase === 'preparing' ||
    snapshot.phase === 'loading' ||
    snapshot.phase === 'listening';
  const canEdit = snapshot.phase === 'idle' || snapshot.phase === 'error';

  return (
    <SectionCard title="External audio wake detector">
      <Text style={s.intro}>
        Feed captured audio into a separate detector. This test uses the app's
        microphone stream and does not start the managed wake-word session.
      </Text>
      <View style={s.statusRow}>
        <StatusPill label={snapshot.phase} active={active} />
        {snapshot.progress ? (
          <Text style={s.progress} accessibilityLiveRegion="polite">
            {snapshot.progress}
          </Text>
        ) : null}
      </View>
      <Text style={s.fieldLabel}>Wake phrase</Text>
      <TextInput
        style={s.input}
        value={phrase}
        onChangeText={setPhrase}
        autoCapitalize="none"
        autoCorrect={false}
        editable={canEdit}
        accessibilityLabel="Wake phrase for external audio test"
        placeholder="hello world"
        placeholderTextColor={C.helper}
      />
      {!validation.valid ? (
        <Text style={s.validation}>{validation.problems[0]}</Text>
      ) : null}
      {canEdit ? (
        <Btn
          label="Prepare models and listen"
          tone="primary"
          disabled={!validation.valid}
          onPress={() => {
            session.current?.start(phrase).catch(() => undefined);
          }}
        />
      ) : (
        <View style={s.actions}>
          <View style={s.action}>
            <Btn
              label={snapshot.phase === 'stopping' ? 'Stopping...' : 'Stop'}
              tone="danger"
              disabled={snapshot.phase === 'stopping'}
              onPress={() => {
                session.current?.stop().catch(() => undefined);
              }}
            />
          </View>
          {snapshot.phase === 'listening' ? (
            <View style={s.action}>
              <Btn
                label="Reset audio"
                tone="quiet"
                onPress={() => {
                  session.current?.reset().catch(() => undefined);
                }}
              />
            </View>
          ) : null}
        </View>
      )}
      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={s.statValue}>{snapshot.detections}</Text>
          <Text style={s.statLabel}>Detections</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statValue}>{snapshot.frames}</Text>
          <Text style={s.statLabel}>Frames</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statValue}>{snapshot.dropped}</Text>
          <Text style={s.statLabel}>Dropped</Text>
        </View>
      </View>
      {snapshot.lastKeyword ? (
        <Text style={s.detected} accessibilityLiveRegion="polite">
          Last detected: {snapshot.lastKeyword}
        </Text>
      ) : null}
      {snapshot.error ? (
        <Text style={s.error} accessibilityLiveRegion="assertive">
          {snapshot.error}
        </Text>
      ) : null}
      <Text style={s.hint}>
        Say the phrase above. Speak normally between attempts and watch the
        detection count. Models may download on first use. Stop before switching
        to another microphone test.
      </Text>
    </SectionCard>
  );
}

const s = StyleSheet.create({
  intro: { color: C.meta, fontSize: 14, lineHeight: 20 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  progress: { color: C.meta, fontSize: 13, flexShrink: 1 },
  fieldLabel: { color: C.label, fontSize: 12, fontWeight: '700' },
  input: {
    backgroundColor: C.tileBg,
    borderColor: C.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.heading,
    fontSize: 15,
  },
  validation: { color: C.warnText, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: C.tileBg,
    borderRadius: 12,
    paddingVertical: 10,
  },
  statValue: { color: C.heading, fontSize: 22, fontWeight: '700' },
  statLabel: { color: C.helper, fontSize: 11 },
  detected: { color: C.primary, fontSize: 14, fontWeight: '700' },
  error: {
    color: C.dangerText,
    backgroundColor: C.dangerBg,
    borderColor: C.dangerBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
  },
  hint: { color: C.helper, fontSize: 12, lineHeight: 18 },
});
