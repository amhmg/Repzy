import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import WorkoutHistory from '@/components/workout-history';
import WorkoutLogger from '@/components/workout-logger';
import { useRepzyColors } from '@/constants/repzy-colors';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { clearDraft, draftDoneSets, loadDraft, WorkoutDraft } from '@/lib/workout-draft';
import { clearWorkoutNotifications, RepzyNotificationType } from '@/lib/workout-notifications';

function formatElapsed(fromIso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export default function HomeScreen() {
  const c = useRepzyColors();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [username, setUsername] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [logger, setLogger] = useState<{ key: number; draft: WorkoutDraft | null } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single()
      .then(({ data }) => setUsername(data?.username ?? null));
  }, [userId]);

  const refreshDraft = useCallback(async () => {
    if (!userId) return null;
    const d = await loadDraft(userId);
    setDraft(d);
    return d;
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refreshDraft();
    }, [refreshDraft]),
  );

  // Tick the "in progress" timer on the resume card
  useEffect(() => {
    if (!draft || logger) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [draft, logger]);

  // Tapping the lock-screen workout notification (or the rest alert) reopens the workout
  useEffect(() => {
    if (!lastResponse || !userId) return;
    const type = lastResponse.notification.request.content.data?.type as RepzyNotificationType | undefined;
    if (type !== 'active' && type !== 'rest') return;
    Notifications.clearLastNotificationResponse();
    if (logger) return;
    loadDraft(userId).then((d) => {
      if (d) {
        setDraft(d);
        setLogger({ key: Date.now(), draft: d });
      }
    });
  }, [lastResponse, userId, logger]);

  function resume() {
    if (!draft) return;
    setSavedMessage(null);
    setLogger({ key: Date.now(), draft });
  }

  async function startNew() {
    setSavedMessage(null);
    const existing = await refreshDraft();
    if (!existing) {
      setLogger({ key: Date.now(), draft: null });
      return;
    }
    Alert.alert('Workout in progress', 'You already have a workout going. Resume it or start a fresh one?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resume', onPress: () => setLogger({ key: Date.now(), draft: existing }) },
      {
        text: 'Start new',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Discard the current workout?', 'Everything logged in it will be lost.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Discard',
              style: 'destructive',
              onPress: async () => {
                if (userId) await clearDraft(userId);
                await clearWorkoutNotifications();
                setDraft(null);
                setLogger({ key: Date.now(), draft: null });
              },
            },
          ]),
      },
    ]);
  }

  const doneSets = draft ? draftDoneSets(draft) : 0;
  const currentExercise = draft?.exercises[draft.exercises.length - 1]?.name;

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

        {draft && !logger ? (
          <Pressable
            onPress={resume}
            style={({ pressed }) => [
              styles.resumeCard,
              { backgroundColor: c.accentSoft, borderColor: c.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <View style={styles.resumeTop}>
              <Text style={[styles.resumeLabel, { color: c.accent }]}>● Workout in progress</Text>
              <Text style={[styles.resumeTimer, { color: c.text }]}>{formatElapsed(draft.startedAt, now)}</Text>
            </View>
            <Text style={[styles.resumeTitle, { color: c.text }]} numberOfLines={1}>
              {draft.title || 'Workout'}
            </Text>
            <Text style={{ color: c.subtext }} numberOfLines={1}>
              {doneSets} set{doneSets === 1 ? '' : 's'} done
              {currentExercise ? ` · ${currentExercise}` : ''}
            </Text>
            <View style={[styles.resumeButton, { backgroundColor: c.accent }]}>
              <Text style={styles.startText}>Resume workout</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={startNew}
            style={({ pressed }) => [styles.startButton, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}>
            <Text style={styles.startText}>Start workout</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => setShowHistory(true)}
          style={({ pressed }) => [styles.historyButton, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.historyText, { color: c.text }]}>📋 Workout history</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => supabase.auth.signOut()} style={styles.logout}>
        <Text style={{ color: c.subtext }}>Log out</Text>
      </Pressable>

      {logger && userId && (
        <WorkoutLogger
          key={logger.key}
          userId={userId}
          draft={logger.draft}
          onDiscard={() => {
            setLogger(null);
            setDraft(null);
          }}
          onMinimize={() => {
            setLogger(null);
            refreshDraft();
          }}
          onSaved={({ prCount, title }) => {
            setLogger(null);
            setDraft(null);
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
  resumeCard: { borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 4 },
  resumeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resumeLabel: { fontSize: 13, fontWeight: '800' },
  resumeTimer: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  resumeTitle: { fontSize: 20, fontWeight: '800' },
  resumeButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  historyButton: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  historyText: { fontSize: 17, fontWeight: '700' },
  logout: { alignItems: 'center', paddingVertical: 20 },
});
