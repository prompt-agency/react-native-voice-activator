import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  addWakeWordListener,
  dispose,
  initialize,
  startDetection,
  stopDetection,
  type WakeWordDetectedEvent,
} from 'react-native-voice-activator';
import { BUNDLED_MODEL_ASSET_KEY } from '../providers';
import { Btn, C } from '../shared';

/**
 * A screen built for one job: being recorded as a short, silent demo loop for
 * the README and the React Native Directory `images` field.
 *
 * It is deliberately NOT a diagnostics screen — WakeWordScreen already does
 * that, and its 12px event log is illegible once scaled down to GIF width.
 * Everything here is sized to stay readable at ~480px wide, and the only state
 * shown is state a viewer can interpret without sound:
 *
 *   - the phrase to say, so they know what they are listening for;
 *   - a running clock, so they can see ordinary speech going by without
 *     triggering anything;
 *   - a detection counter that only moves on the phrase.
 *
 * The counter staying at 0 while someone talks IS the demo. A mic-on indicator
 * would show nothing a plain record button could not.
 */

// ─── Demo configuration ───────────────────────────────────────────────────────

/**
 * The phrase the demo listens for, as a bundled pre-tokenized keyword file.
 *
 * NOT `initialize({ wakePhrase })`, which is what this screen was originally
 * written against. sherpa-onnx's keyword encoder requires a pre-tokenized
 * keywords file (`\u25b8HE Y \u25b8S I RI`), and the plain text that the wakePhrase
 * path writes makes it call exit(-1) mid-initialize, taking the process with
 * it. Until that is fixed, the only configuration that actually runs on a
 * device is a bundled preset, so that is what gets recorded.
 */
const PRESET_KEYWORD_ASSET = 'keywords-hey-siri.txt';
const PRESET_PHRASE = 'hey siri';

/** How long the detection banner holds before returning to the listening state. */
const BANNER_HOLD_MS = 2600;

// ─── Phase ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'preparing' | 'listening' | 'stopped';

// ─── Screen ───────────────────────────────────────────────────────────────────

export function DemoScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progressText, setProgressText] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [detectionCount, setDetectionCount] = useState(0);
  const [lastDetection, setLastDetection] =
    useState<WakeWordDetectedEvent | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [errorText, setErrorText] = useState('');

  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  // ── Events ──
  // Only stateChanged and wakeWordDetected: the screen has no configuration to
  // reconcile, so the rest of the event map would be noise on camera. Errors
  // still surface, because a silent dead screen is the worst thing to record.
  useEffect(() => {
    const subs = [
      addWakeWordListener('wakeWordDetected', (e) => {
        setLastDetection(e);
        setDetectionCount((n) => n + 1);
        setBannerVisible(true);
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        bannerTimer.current = setTimeout(
          () => setBannerVisible(false),
          BANNER_HOLD_MS
        );
      }),
      addWakeWordListener('error', (e) => {
        setErrorText(`${e.category}:${e.code}`);
      }),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  // ── Listening clock ──
  // Wall-clock time since detection started, so a viewer can see that seconds
  // of speech went by without the counter moving. Not a latency measurement.
  useEffect(() => {
    if (phase !== 'listening') return;
    const started = Date.now();
    setElapsedSeconds(0);
    const id = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [phase]);

  // ── Listening pulse ──
  // Decorative. This is NOT a microphone level meter: the package exposes no
  // amplitude event, and animating one from nothing would be a lie on camera.
  useEffect(() => {
    if (phase !== 'listening') {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

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

  async function handleStart() {
    if (!(await ensurePermission())) return;
    setErrorText('');
    setPhase('preparing');
    try {
      // Bundled assets, so no model download and no progress spinner: the
      // recording opens straight on a live LISTENING state.
      await initialize({
        engineConfig: {
          assetKeys: {
            keywordAssetKey: PRESET_KEYWORD_ASSET,
            modelAssetKey: BUNDLED_MODEL_ASSET_KEY,
          },
        },
      });
      await startDetection();
      setDetectionCount(0);
      setLastDetection(null);
      setPhase('listening');
    } catch (cause) {
      setProgressText('');
      setErrorText(cause instanceof Error ? cause.message : String(cause));
      setPhase('idle');
    }
  }

  async function handleStop() {
    try {
      await stopDetection();
      await dispose();
    } catch {
      // Nothing useful to show on camera if teardown fails.
    }
    setPhase('stopped');
  }

  const clock = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(
    elapsedSeconds % 60
  ).padStart(2, '0')}`;

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  });

  return (
    <View style={s.root}>
      {/* Target phrase: the first thing a viewer needs, and the largest thing
          on screen. */}
      <View style={s.phraseBlock}>
        <Text style={s.phraseLabel}>WAKE PHRASE</Text>
        <Text style={s.phrase}>“{PRESET_PHRASE.toUpperCase()}”</Text>
        <Text style={s.phraseNote}>on device · no API key · no network</Text>
      </View>

      {/* Centre stage: either the listening indicator or the detection banner. */}
      <View style={s.stage}>
        {bannerVisible && lastDetection ? (
          <View style={s.banner}>
            <Text style={s.bannerKicker}>WAKE WORD DETECTED</Text>
            <Text style={s.bannerPhrase}>“{lastDetection.detectedPhrase}”</Text>
            <Text style={s.bannerTime}>{lastDetection.detectedAt}</Text>
          </View>
        ) : (
          <View style={s.indicator}>
            {phase === 'listening' && (
              <Animated.View
                style={[
                  s.ring,
                  { opacity: ringOpacity, transform: [{ scale: ringScale }] },
                ]}
              />
            )}
            <View style={[s.dot, phase === 'listening' && s.dotActive]} />
            <Text style={s.stateText}>
              {phase === 'listening'
                ? 'LISTENING'
                : phase === 'preparing'
                  ? 'PREPARING'
                  : phase === 'stopped'
                    ? 'STOPPED'
                    : 'IDLE'}
            </Text>
            {phase === 'listening' && <Text style={s.clock}>{clock}</Text>}
            {progressText !== '' && (
              <Text style={s.progress}>{progressText}</Text>
            )}
          </View>
        )}
      </View>

      {/* The counter is the evidence: it does not move while you talk. */}
      <View style={s.counterRow}>
        <View style={s.counterBox}>
          <Text style={s.counterValue}>{detectionCount}</Text>
          <Text style={s.counterLabel}>DETECTIONS</Text>
        </View>
        <View style={s.counterCopy}>
          <Text style={s.counterCopyText}>
            Speak freely. Nothing fires until the phrase does.
          </Text>
        </View>
      </View>

      {errorText !== '' && <Text style={s.error}>{errorText}</Text>}

      <View style={s.controls}>
        {phase === 'listening' ? (
          <Btn label="Stop" onPress={handleStop} tone="danger" />
        ) : (
          <Btn
            label={phase === 'preparing' ? 'Preparing…' : 'Start listening'}
            onPress={handleStart}
            disabled={phase === 'preparing'}
            tone="primary"
          />
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
//
// Type sizes here are larger than the rest of the example app on purpose: the
// screen is recorded and then scaled down, so anything under ~15px turns to
// mush in the GIF.
//
// The layout is centred as one tight band rather than spread with
// space-between. A phone screen is far taller than anything worth embedding in
// a README, so the recording gets cropped to the content; spreading the
// elements to the edges would make that crop impossible.

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 22,
    paddingVertical: 20,
    justifyContent: 'center',
    gap: 26,
  },
  phraseBlock: { alignItems: 'center', gap: 6 },
  phraseLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: C.label,
  },
  phrase: {
    fontSize: 36,
    fontWeight: '800',
    color: C.hero,
    textAlign: 'center',
  },
  phraseNote: { fontSize: 14, fontWeight: '600', color: C.helper },
  // Fixed height, not flex: the banner and the listening indicator swap in
  // and out of this slot, and a flexing stage would make everything below it
  // jump at the exact moment the GIF wants to be readable.
  stage: { minHeight: 230, alignItems: 'center', justifyContent: 'center' },
  indicator: { alignItems: 'center', gap: 10 },
  ring: {
    position: 'absolute',
    top: -16,
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#1e5c43',
  },
  dot: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: C.quietBg,
    borderWidth: 2,
    borderColor: C.cardBorder,
  },
  dotActive: { backgroundColor: '#1e5c43', borderColor: '#1e5c43' },
  stateText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2.2,
    color: C.heading,
  },
  clock: {
    fontSize: 17,
    fontWeight: '700',
    color: C.helper,
    fontVariant: ['tabular-nums'],
  },
  progress: { fontSize: 14, color: C.helper, textAlign: 'center' },
  banner: {
    alignSelf: 'stretch',
    backgroundColor: C.hero,
    borderRadius: 26,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  bannerKicker: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: C.heroSub,
  },
  bannerPhrase: {
    fontSize: 34,
    fontWeight: '800',
    color: C.heroText,
    textAlign: 'center',
  },
  bannerTime: {
    fontSize: 14,
    color: C.heroSub,
    fontVariant: ['tabular-nums'],
  },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  counterBox: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    minWidth: 104,
  },
  counterValue: {
    fontSize: 46,
    fontWeight: '800',
    color: C.hero,
    fontVariant: ['tabular-nums'],
  },
  counterLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: C.label,
  },
  counterCopy: { flex: 1 },
  counterCopyText: { fontSize: 16, fontWeight: '600', color: C.meta },
  error: {
    fontSize: 14,
    fontWeight: '600',
    color: C.dangerText,
    marginTop: 10,
  },
  controls: { marginTop: 4 },
});
