import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import WorkoutHistory from '@/components/workout-history';
import WorkoutLogger from '@/components/workout-logger';
import { useRepzyColors } from '@/constants/repzy-colors';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const c = useRepzyColors();
  const { session } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setUsername(data?.username ?? null));
  }, [session]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.top}>
        <Text style={[styles.logo, { color: c.accent }]}>Repzy</Text>
        <Text style={{ color: c.subtext }}>@{username ?? '...'}</Text>
      </View>

      <View style={styles.middle}>
        {savedMessage && (
          <View style={[styles.savedBox, { backgroundColor: c.successSoft }]}>
            <Text style={{ color: c.success, fontWeight: '700', textAlign: 'center' }}>{savedMessage}</Text>
          </View>
        )}

        <Pressable
          onPress={() => {
            setSavedMessage(null);
            setLogging(true);
          }}
          style={({ pressed }) => [styles.startButton, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={styles.startText}>Start workout</Text>
        </Pressable>

        <Pressable
          onPress={() => setShowHistory(true)}
          style={({ pressed }) => [styles.historyButton, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.historyText, { color: c.text }]}>📋 Workout history</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => supabase.auth.signOut()} style={styles.logout}>
        <Text style={{ color: c.subtext }}>Log out</Text>
      </Pressable>

      {logging && (
        <WorkoutLogger
          onClose={() => setLogging(false)}
          onSaved={({ prCount, title }) => {
            setLogging(false);
            setSavedMessage(
              prCount > 0
                ? `"${title}" saved with ${prCount} new PR${prCount === 1 ? '' : 's'} 🏆`
                : `"${title}" saved 💪`,
            );
          }}
        />
      )}

      {showHistory && <WorkoutHistory onClose={() => setShowHistory(false)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  top: { alignItems: 'center', marginTop: 32, gap: 4 },
  logo: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  middle: { flex: 1, justifyContent: 'center', gap: 14 },
  savedBox: { borderRadius: 12, padding: 14 },
  startButton: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  startText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  historyButton: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  historyText: { fontSize: 17, fontWeight: '700' },
  logout: { alignItems: 'center', paddingVertical: 20 },
});
