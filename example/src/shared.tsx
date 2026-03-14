import { Pressable, StyleSheet, Text, View } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EventEntry = { id: string; label: string; detail: string };

// ─── Palette ──────────────────────────────────────────────────────────────────

export const C = {
  bg: '#eef1eb',
  card: '#fbfbf7',
  cardBorder: '#dde5dc',
  hero: '#17352b',
  heroText: '#f5f7f2',
  heroSub: '#d7e4dc',
  primary: '#173f2f',
  primaryText: '#f7fbf8',
  secondaryBg: '#edf4ef',
  secondaryBorder: '#cedbd1',
  secondaryText: '#17352b',
  dangerBg: '#fff1ef',
  dangerBorder: '#f3c2bb',
  dangerText: '#9d3428',
  quietBg: '#f6f7f5',
  quietBorder: '#dde3dc',
  quietText: '#405249',
  tileBg: '#f0f4ee',
  listCard: '#f3f6f1',
  heading: '#183028',
  meta: '#43544b',
  helper: '#66776e',
  label: '#607468',
  eventLabel: '#23362d',
  warnText: '#7a4f1e',
  warnBg: '#fdf4e7',
  warnBorder: '#f0d9b5',
};

// ─── Btn ──────────────────────────────────────────────────────────────────────

type BtnTone = 'primary' | 'secondary' | 'danger' | 'quiet';

export function Btn({
  label,
  onPress,
  disabled = false,
  tone = 'secondary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: BtnTone;
}) {
  const bgStyle =
    tone === 'primary'
      ? btn.primary
      : tone === 'danger'
        ? btn.danger
        : tone === 'quiet'
          ? btn.quiet
          : btn.secondary;
  const textStyle =
    tone === 'primary'
      ? btn.textPrimary
      : tone === 'danger'
        ? btn.textDanger
        : tone === 'quiet'
          ? btn.textQuiet
          : btn.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        btn.base,
        bgStyle,
        disabled && btn.disabled,
        pressed && !disabled && btn.pressed,
      ]}
    >
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

const btn = StyleSheet.create({
  base: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    alignItems: 'center',
  },
  primary: { backgroundColor: C.primary, borderColor: C.primary },
  secondary: { backgroundColor: C.secondaryBg, borderColor: C.secondaryBorder },
  danger: { backgroundColor: C.dangerBg, borderColor: C.dangerBorder },
  quiet: { backgroundColor: C.quietBg, borderColor: C.quietBorder },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  textPrimary: { fontSize: 15, fontWeight: '700', color: C.primaryText },
  textSecondary: { fontSize: 15, fontWeight: '700', color: C.secondaryText },
  textDanger: { fontSize: 15, fontWeight: '700', color: C.dangerText },
  textQuiet: { fontSize: 15, fontWeight: '700', color: C.quietText },
});

// ─── EventLog ─────────────────────────────────────────────────────────────────

export function EventLog({ events }: { events: EventEntry[] }) {
  if (events.length === 0) {
    return <Text style={evLog.empty}>No events yet.</Text>;
  }
  return (
    <View style={evLog.container}>
      {events.map((e) => (
        <View key={e.id} style={evLog.row}>
          <Text style={evLog.label}>{e.label}</Text>
          <Text style={evLog.detail}>{e.detail}</Text>
        </View>
      ))}
    </View>
  );
}

const evLog = StyleSheet.create({
  container: { gap: 6 },
  row: {
    backgroundColor: C.listCard,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: { fontSize: 13, fontWeight: '700', color: C.eventLabel },
  detail: { fontSize: 12, color: C.helper, marginTop: 2 },
  empty: { fontSize: 13, color: C.helper },
});

// ─── StatusPill ───────────────────────────────────────────────────────────────

export function StatusPill({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <View style={[pill.base, active && pill.active]}>
      <Text style={[pill.text, active && pill.textActive]}>{label}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.tileBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  active: { backgroundColor: '#1e5c43', borderColor: '#1e5c43' },
  text: { fontSize: 13, fontWeight: '600', color: C.meta },
  textActive: { color: '#e8f5ee' },
});

// ─── SectionCard ──────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={card.container}>
      <Text style={card.title}>{title}</Text>
      {children}
    </View>
  );
}

const card = StyleSheet.create({
  container: {
    backgroundColor: C.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 17, fontWeight: '700', color: C.heading },
});
