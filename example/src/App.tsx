import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from './shared';
import { WakeWordScreen } from './screens/WakeWordScreen';
import { SessionScreen } from './screens/SessionScreen';
import { ManualScreen } from './screens/ManualScreen';
import { EnrollmentScreen } from './screens/EnrollmentScreen';
import { DemoScreen } from './screens/DemoScreen';

// ─── Tab definition ───────────────────────────────────────────────────────────

type TabId = 'enroll' | 'wake-word' | 'session' | 'manual' | 'demo';

const TABS: { id: TabId; num: string; label: string }[] = [
  { id: 'enroll', num: '①', label: 'Speaker ID' },
  { id: 'wake-word', num: '②', label: 'Wake Word' },
  { id: 'session', num: '③', label: 'Conversation' },
  { id: 'manual', num: '④', label: 'Engines' },
  { id: 'demo', num: '⑤', label: 'Demo' },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('enroll');

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[s.tabNum, active && s.tabTextActive]}>
                {tab.num}
              </Text>
              <Text style={[s.tabText, active && s.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Screens */}
      <View style={s.screen}>
        {activeTab === 'wake-word' && <WakeWordScreen />}
        {activeTab === 'session' && <SessionScreen />}
        {activeTab === 'manual' && <ManualScreen />}
        {activeTab === 'enroll' && <EnrollmentScreen />}
        {activeTab === 'demo' && <DemoScreen />}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    paddingHorizontal: 8,
    paddingTop: 90,
    paddingBottom: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    gap: 2,
  },
  tabActive: {
    backgroundColor: C.primary,
  },
  tabNum: {
    fontSize: 16,
    fontWeight: '700',
    color: C.meta,
  },
  tabText: {
    fontSize: 10,
    fontWeight: '600',
    color: C.meta,
  },
  tabTextActive: {
    color: C.primaryText,
  },
  screen: { flex: 1 },
});
