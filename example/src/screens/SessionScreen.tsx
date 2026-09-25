import { useEffect, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
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
  useVoiceSession,
  type AIHandler,
} from 'react-native-voice-activator';
import { ExpoSpeechTtsProvider } from '../expo-speech-tts-provider';
import {
  markSpeakerRuntimeDisposed,
  markSpeakerRuntimeReady,
  ensureSttProvider,
  ensureVadModelPath,
  getDownloadedSpeakerModelPath,
  speakerVerificationProvider,
} from '../providers';
import { Btn, C, EventLog, SectionCard, StatusPill, type EventEntry } from '../shared';

// ─── Mock AI Handler ──────────────────────────────────────────────────────────

const mockAiHandler: AIHandler = async (transcript) => {
  await new Promise((r) => setTimeout(r, 600));
  return `You said: "${transcript}" — responding with built-in TTS.`;
};

let seq = 0;

// ─── Screen ───────────────────────────────────────────────────────────────────

export function SessionScreen() {
  const { sessionState, lastTranscript, lastSpeechText, turnCount, lastError, listen, close } =
    useVoiceSession();

  const [wakeStatus, setWakeStatus] = useState(() => getStatus());
  const [reListenMode, setReListenMode] = useState<'auto' | 'manual'>('auto');
  const [progressText, setProgressText] = useState('');
  const [events, setEvents] = useState<EventEntry[]>([]);

  function pushEvent(label: string, detail: string) {
    setEvents((prev) => [{ id: String(seq++), label, detail }, ...prev].slice(0, 5));
  }

  // Sync wake word status for canStart / isListening
  useEffect(() => {
    setWakeStatus(getStatus());
  }, [sessionState]);

  // Trace the session state machine into the event log. Without this a session
  // that never starts is indistinguishable from one that starts and stalls.
  useEffect(() => {
    pushEvent('sessionState', sessionState === null ? 'null (no session)' : sessionState);
  }, [sessionState]);

  // Surface wake word and runtime errors. Without this the screen is blind to
  // detections: a wake word that fires but fails to start a session produces no
  // visible change at all, which is indistinguishable from the mic not hearing.
  useEffect(() => {
    const subs = [
      addWakeWordListener('wakeWordDetected', (e) => {
        pushEvent('wakeWordDetected', `"${e.detectedPhrase}" at ${e.detectedAt}`);
        setWakeStatus(getStatus());
      }),
      addWakeWordListener('error', (e) => {
        pushEvent('error', `${e.category}:${e.code} ${e.message}`);
        setWakeStatus(getStatus());
      }),
      addWakeWordListener('stateChanged', (e) => {
        pushEvent('stateChanged', `→ ${e.state}`);
        setWakeStatus(getStatus());
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, []);

  async function ensurePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      { title: 'Microphone', message: 'Required for voice session.', buttonPositive: 'Allow', buttonNegative: 'Cancel' }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function handleInitialize() {
    if (!(await ensurePermission())) return;
    try {
      const speakerModelPath = await getDownloadedSpeakerModelPath();
      // Must be initialized by the app before use — see ensureSttProvider().
      setProgressText('Preparing speech-to-text model...');
      const sttProvider = await ensureSttProvider((u) =>
        setProgressText(
          u.progress != null ? `${u.message} (${u.progress}%)` : u.message
        )
      );
      const vadModelPath = await ensureVadModelPath();
      setProgressText('');
      await initialize({
        engineConfig: { assetKeys: { keywordAssetKey: 'keywords-merry-christmas.txt' } },
        sttProvider,
        // Required: session mode only engages when BOTH stt and tts are set.
        ttsProvider: new ExpoSpeechTtsProvider(),
        autoSpeak: true,
        // Kept configured so the Enrollment tab stays usable no matter which
        // screen initialized last. 'open' is required here: the default is
        // 'closed', which aborts every session when no speaker is enrolled yet.
        // Only wire speaker verification if the model is already on disk;
        // enrollment is what downloads it.
        ...(speakerModelPath
          ? { speakerVerificationProvider, speakerModelPath }
          : {}),
        verificationFailureBehavior: 'open',
        session: {
          aiHandler: mockAiHandler,
          reListenMode,
          // A real "user never started speaking" guard, as documented.
          // This only holds because session.vad is set below: speechStart
          // clears the timer. Without VAD nothing clears it until
          // transcribe() resolves, so the budget would also have to cover
          // Whisper inference and sessions get killed mid-utterance with
          // sessionEnded{reason:'timeout'} and no error.
          silenceTimeoutMs: 10_000,
          vad: { modelPath: vadModelPath },
        },
      });
      if (speakerModelPath) markSpeakerRuntimeReady();
      else markSpeakerRuntimeDisposed();
      setProgressText('');
      setWakeStatus(getStatus());
      pushEvent('initialize', `session mode, reListenMode: ${reListenMode}`);
    } catch (e: any) {
      setWakeStatus(getStatus());
      pushEvent('error', String(e?.message ?? e));
    }
  }

  async function handleStart() {
    try {
      await startDetection();
      setWakeStatus(getStatus());
      pushEvent('startDetection', 'listening for wake word');
    } catch (e: any) {
      pushEvent('error', String(e?.message ?? e));
    }
  }

  async function handleListen() {
    try { await listen(); } catch (e: any) { pushEvent('error', String(e?.message ?? e)); }
  }

  async function handleClose() {
    try {
      await close();
      pushEvent('close', 'session closed');
    } catch (e: any) { pushEvent('error', String(e?.message ?? e)); }
  }

  async function handleDispose() {
    try {
      await dispose();
      markSpeakerRuntimeDisposed();
      setWakeStatus(getStatus());
      pushEvent('dispose', 'runtime torn down');
    } catch { setWakeStatus(getStatus()); }
  }

  const sessionActive = sessionState !== null && sessionState !== 'closed';

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>

      {/* Header */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>③ Conversation</Text>
        <Text style={s.heroSub}>
          After wake word detection, the library manages the full listen{' '}
          <Text style={s.heroCode}>→</Text> transcribe{' '}
          <Text style={s.heroCode}>→</Text> respond{' '}
          <Text style={s.heroCode}>→</Text> speak loop.
          Say <Text style={s.heroCode}>MERRY CHRISTMAS</Text> to start a session.
        </Text>
        <View style={s.pillRow}>
          <StatusPill label={wakeStatus.state} active={wakeStatus.isListening} />
          {sessionState ? <StatusPill label={sessionState} active={sessionActive} /> : null}
          {turnCount > 0 ? <StatusPill label={`turn ${turnCount}`} active /> : null}
        </View>
      </View>

      {lastError ? (
        <View style={s.errorBanner}>
          <Text style={s.errorTitle}>{lastError.category}: {lastError.code}</Text>
          <Text style={s.errorBody}>{lastError.message}</Text>
        </View>
      ) : null}

      {progressText ? <Text style={s.progress}>{progressText}</Text> : null}

      {/* Echo handler notice */}
      <View style={s.echoNotice}>
        <Text style={s.echoNoticeTitle}>Echo handler active (demo mode)</Text>
        <Text style={s.echoNoticeBody}>
          This demo echoes your words back. Replace the{' '}
          <Text style={s.code}>mockAiHandler</Text> constant in{' '}
          <Text style={s.code}>SessionScreen.tsx</Text> with a call to
          your AI API to get a real conversation.
        </Text>
      </View>

      {/* Config */}
      <SectionCard title="Session configuration">
        <Text style={s.hint}>Re-listen mode (set before Initialize):</Text>
        <View style={s.modeRow}>
          {(['auto', 'manual'] as const).map((m) => (
            <Btn
              key={m}
              label={m}
              tone={reListenMode === m ? 'primary' : 'secondary'}
              onPress={() => setReListenMode(m)}
            />
          ))}
        </View>
        <Text style={s.hint}>
          Wake word: <Text style={s.code}>MERRY CHRISTMAS</Text>{'\n'}
          silenceTimeoutMs: <Text style={s.code}>10 000</Text>
        </Text>
      </SectionCard>

      {/* Controls */}
      <SectionCard title="Controls">
        <Btn label="Initialize" onPress={handleInitialize} tone="primary" />
        <Btn label="Start detection" onPress={handleStart} disabled={!wakeStatus.canStart} />
        {reListenMode === 'manual' && sessionState === 'idle' ? (
          <Btn label="Listen again" onPress={handleListen} />
        ) : null}
        {sessionActive ? (
          <Btn label="End session" onPress={handleClose} tone="quiet" />
        ) : null}
        <Btn label="Dispose" onPress={handleDispose} tone="danger" />
      </SectionCard>

      {/* Conversation */}
      <SectionCard title="Conversation">
        {lastTranscript || lastSpeechText ? (
          <View style={s.bubbles}>
            {lastTranscript ? (
              <View style={[s.bubble, s.bubbleYou]}>
                <Text style={s.bubbleLabel}>YOU SAID</Text>
                <Text style={s.bubbleText}>{lastTranscript}</Text>
              </View>
            ) : null}
            {lastSpeechText ? (
              <View style={[s.bubble, s.bubbleAi]}>
                <Text style={s.bubbleLabel}>AI SAID</Text>
                <Text style={s.bubbleText}>{lastSpeechText}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={s.hint}>No conversation yet. Initialize, start detection, then say the wake word.</Text>
        )}
      </SectionCard>

      {/* Recent events */}
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
  hero: { backgroundColor: C.hero, borderRadius: 20, padding: 18, gap: 10 },
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
  echoNotice: {
    backgroundColor: C.tileBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 14,
    gap: 6,
  },
  echoNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.heading,
  },
  echoNoticeBody: {
    fontSize: 12,
    color: C.helper,
    lineHeight: 18,
  },
  hint: { fontSize: 13, color: C.helper, lineHeight: 18 },
  code: { fontFamily: 'Menlo', fontSize: 12, color: C.meta },
  modeRow: { flexDirection: 'row', gap: 8 },
  bubbles: { gap: 10 },
  bubble: {
    borderRadius: 14,
    padding: 12,
    gap: 4,
    borderWidth: 1,
  },
  bubbleYou: {
    backgroundColor: C.secondaryBg,
    borderColor: C.secondaryBorder,
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  bubbleAi: {
    backgroundColor: C.tileBg,
    borderColor: C.cardBorder,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  bubbleLabel: { fontSize: 10, fontWeight: '700', color: C.label, letterSpacing: 0.5 },
  bubbleText: { fontSize: 14, color: C.heading, lineHeight: 20 },
});
