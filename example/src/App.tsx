import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from './shared';
import { WakeWordScreen } from './screens/WakeWordScreen';
import { SessionScreen } from './screens/SessionScreen';
import { ManualScreen } from './screens/ManualScreen';

// ─── Tab definition ───────────────────────────────────────────────────────────

type TabId = 'wake-word' | 'session' | 'manual';

const TABS: { id: TabId; label: string }[] = [
  { id: 'wake-word', label: 'Wake Word' },
  { id: 'session', label: 'Session' },
  { id: 'manual', label: 'STT · TTS' },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('wake-word');

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
              <Text style={[s.tabText, active && s.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Screens */}
      <View style={s.screen}>
        {activeTab === 'wake-word' && <WakeWordScreen />}
        {activeTab === 'session' && <SessionScreen />}
        {activeTab === 'manual' && <ManualScreen />}
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
    paddingTop: 4,
    paddingBottom: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: C.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.meta,
  },
  tabTextActive: {
    color: C.primaryText,
  },
  screen: { flex: 1 },
});
