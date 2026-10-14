import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '@/components/app-header';
import { WorkoutCard, WorkoutDetailModal } from '@/components/workout-history';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { fetchWorkoutHistory, WorkoutSummary } from '@/lib/history';
import { firstName, useProfile } from '@/lib/profile';
import { fetchTrainingSummary, RECORD_SHORT, trainingInsight, TrainingSummary } from '@/lib/progress';
import { fetchRoutines, Routine, routineSetCount } from '@/lib/routines';
import { useSettings } from '@/lib/settings';
import { formatKg } from '@/lib/workout';
import { draftDoneSets, draftFromRoutine } from '@/lib/workout-draft';
import { useWorkoutSession } from '@/lib/workout-session';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function greeting(date: Date) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const c = useRepzyColors();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const session = useWorkoutSession();

  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [recent, setRecent] = useState<WorkoutSummary[] | null>(null);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [openWorkout, setOpenWorkout] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, r, rt] = await Promise.allSettled([
      fetchTrainingSummary(),
      fetchWorkoutHistory(undefined, { limit: 3 }),
      fetchRoutines(),
    ]);
    if (s.status === 'fulfilled') {
      setSummary(s.value);
      setSummaryError(false);
    } else setSummaryError(true);
    setRecent(r.status === 'fulfilled' ? r.value.rows : []);
    setRoutines(rt.status === 'fulfilled' ? rt.value : []);
  }, []);

  // Reload when the tab is shown and after every saved workout
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, session.savedVersion]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const rawName = firstName(profile);
  const name = rawName ? rawName[0].toUpperCase() + rawName.slice(1) : rawName;
  const draft = session.draft;
  const insight = summary ? trainingInsight(summary) : null;
  const latestPr = summary?.recent_prs[0];
  const isNewUser = summary !== null && summary.total_workouts === 0;
  const today = new Date();
  const todayIndex = (today.getDay() + 6) % 7; // Monday = 0

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]} edges={['top']}>
      <AppHeader
        title={name ? `${greeting(today)}, ${name}` : greeting(today)}
        small
        subtitle={today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {session.lastSaved && (
          <Pressable onPress={session.dismissSaved} style={[styles.savedBox, { backgroundColor: c.successSoft }]}>
            <Text style={{ color: c.success, fontWeight: '700', textAlign: 'center' }}>
              {session.lastSaved.prCount > 0
                ? `“${session.lastSaved.title}” saved with ${session.lastSaved.prCount} new PR${session.lastSaved.prCount === 1 ? '' : 's'} 🏆`
                : `“${session.lastSaved.title}” saved 💪`}
            </Text>
          </Pressable>
        )}

        {/* Start / resume */}
        {draft ? (
          <Pressable
            onPress={session.resume}
            style={({ pressed }) => [
              styles.resumeCard,
              { backgroundColor: c.accentSoft, borderColor: c.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={[styles.resumeLabel, { color: c.accent }]}>● Workout in progress</Text>
            <Text style={[styles.resumeTitle, { color: c.text }]} numberOfLines={1}>
              {draft.title || 'Workout'}
            </Text>
            <Text style={{ color: c.subtext }}>
              {draftDoneSets(draft)} sets done · {draft.exercises.length} exercise
              {draft.exercises.length === 1 ? '' : 's'}
            </Text>
            <View style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 10 }]}>
              <Text style={styles.primaryText}>Resume workout</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setShowStart(true)}
            style={({ pressed }) => [styles.primaryButton, styles.startButton, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={styles.startText}>Start workout</Text>
          </Pressable>
        )}

        {isNewUser && !draft && (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Welcome to Repzy 👋</Text>
            <Text style={{ color: c.subtext, lineHeight: 20 }}>
              Tap Start workout, add an exercise, and tick off each set as you go. Your stats and records will build up
              here.
            </Text>
          </View>
        )}

        {/* This week */}
        {summary && summary.total_workouts > 0 && (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.cardTitle, { color: c.text }]}>This week</Text>
              {summary.week_streak > 0 && (
                <Text style={[styles.streak, { color: c.accent }]}>🔥 {summary.week_streak}-week streak</Text>
              )}
            </View>
            <View style={styles.weekStats}>
              <Stat value={String(summary.week_workouts)} label={`workout${summary.week_workouts === 1 ? '' : 's'}`} colors={c} />
              <Stat value={formatKg(summary.week_volume)} label="lifted" colors={c} />
              <Stat value={String(summary.last_week_workouts)} label="last week" colors={c} />
            </View>
            <View style={styles.dots} accessibilityLabel={`Trained on ${summary.week_days.length} days this week`}>
              {DAY_LETTERS.map((d, i) => {
                const trained = summary.week_days.includes(i + 1);
                const isToday = i === todayIndex;
                const date = new Date(today);
                date.setDate(today.getDate() - todayIndex + i); // Monday … Sunday of this week
                const future = i > todayIndex;
                return (
                  <View key={i} style={styles.dotCol}>
                    <Text style={[styles.dotLabel, { color: isToday ? c.text : c.subtext }]}>{d}</Text>
                    <View
                      accessibilityLabel={`${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric' })}${trained ? ', trained' : ''}`}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: trained ? c.accent : c.inputBg,
                          borderColor: isToday ? c.accent : 'transparent',
                          opacity: future ? 0.55 : 1,
                        },
                      ]}>
                      <Text style={[styles.dotDate, { color: trained ? '#FFFFFF' : isToday ? c.accent : c.text }]}>
                        {date.getDate()}
                      </Text>
                    </View>
                    {trained ? (
                      <Text style={[styles.dotTick, { color: c.accent }]}>✓</Text>
                    ) : (
                      <Text style={styles.dotTick}> </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {summaryError && (
          <Text style={[styles.hint, { color: c.subtext }]}>
            Stats will appear once the latest database update is installed.
          </Text>
        )}

        {insight && (
          <View style={[styles.insight, { borderColor: c.border }]}>
            <Text style={{ color: c.text, lineHeight: 20 }}>{insight}</Text>
          </View>
        )}

        {/* Latest PR */}
        {latestPr && (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={[styles.smallLabel, { color: c.subtext }]}>Latest personal record</Text>
            <Text style={[styles.prValue, { color: c.gold }]}>
              🏆 {formatKg(latestPr.value)}
              {latestPr.record_type === 'estimated_1rm' ? ' (estimated)' : ''}
            </Text>
            <Text style={[styles.prDetail, { color: c.text }]}>
              {latestPr.exercise_name} · {RECORD_SHORT[latestPr.record_type]}
              {latestPr.weight != null && latestPr.reps != null ? ` · ${latestPr.weight} × ${latestPr.reps}` : ''}
            </Text>
            <Text style={{ color: c.subtext, fontSize: 12 }}>
              {new Date(latestPr.achieved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
        )}

        {/* Routines shortcut */}
        <Pressable
          onPress={() => router.navigate('/workouts')}
          style={({ pressed }) => [styles.card, styles.cardRow, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: c.text }]}>My routines</Text>
            <Text style={{ color: c.subtext }} numberOfLines={1}>
              {routines === null
                ? 'Loading…'
                : routines.length === 0
                  ? 'Save a plan like Push Day or Legs to start it in one tap'
                  : routines.map((r) => r.name).join(' · ')}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: c.subtext }]}>›</Text>
        </Pressable>

        {/* Recent workouts */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Recent workouts</Text>
          {recent && recent.length > 0 && (
            <Pressable onPress={() => router.navigate({ pathname: '/progress', params: { section: 'history' } })} hitSlop={10}>
              <Text style={[styles.link, { color: c.accent }]}>See all</Text>
            </Pressable>
          )}
        </View>
        {recent === null ? (
          <ActivityIndicator />
        ) : recent.length === 0 ? (
          <Text style={[styles.hint, { color: c.subtext }]}>Your finished workouts will appear here.</Text>
        ) : (
          recent.map((w) => <WorkoutCard key={w.id} workout={w} colors={c} onPress={() => setOpenWorkout(w.id)} />)
        )}
      </ScrollView>

      {showStart && (
        <StartSheet
          colors={c}
          routines={routines ?? []}
          hasDraft={!!draft}
          onClose={() => setShowStart(false)}
          onEmpty={() => {
            setShowStart(false);
            session.startEmpty();
          }}
          onRoutine={(r) => {
            setShowStart(false);
            session.startWith(draftFromRoutine(r, settings.defaultRestSeconds));
          }}
          onResume={() => {
            setShowStart(false);
            session.resume();
          }}
        />
      )}

      {openWorkout && (
        <WorkoutDetailModal
          id={openWorkout}
          onClose={() => setOpenWorkout(null)}
          onDeleted={() => {
            setOpenWorkout(null);
            load();
          }}
        />
      )}

    </SafeAreaView>
  );
}

function StartSheet({
  colors: c,
  routines,
  hasDraft,
  onClose,
  onEmpty,
  onRoutine,
  onResume,
}: {
  colors: RepzyColors;
  routines: Routine[];
  hasDraft: boolean;
  onClose: () => void;
  onEmpty: () => void;
  onRoutine: (r: Routine) => void;
  onResume: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: c.card }]}>
          <Text style={[styles.sheetTitle, { color: c.text }]}>Start a workout</Text>

          {hasDraft && (
            <SheetOption icon="▶️" title="Resume workout in progress" colors={c} onPress={onResume} />
          )}
          <SheetOption icon="➕" title="Empty workout" detail="Add exercises as you go" colors={c} onPress={onEmpty} />

          <Text style={[styles.sheetSection, { color: c.subtext }]}>From a routine</Text>
          {routines.length === 0 ? (
            <Pressable
              onPress={() => {
                onClose();
                router.navigate('/workouts');
              }}>
              <Text style={[styles.hint, { color: c.subtext }]}>
                No routines yet. <Text style={{ color: c.accent, fontWeight: '700' }}>Create one in Workouts</Text>
              </Text>
            </Pressable>
          ) : (
            <ScrollView style={styles.sheetList}>
              {routines.map((r) => (
                <SheetOption
                  key={r.id}
                  icon="📋"
                  title={r.name}
                  detail={`${r.exercises.length} exercises · ${routineSetCount(r)} sets`}
                  colors={c}
                  onPress={() => onRoutine(r)}
                />
              ))}
            </ScrollView>
          )}

          <Pressable onPress={onClose} style={[styles.cancel, { backgroundColor: c.inputBg }]}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SheetOption({
  icon,
  title,
  detail,
  colors: c,
  onPress,
}: {
  icon: string;
  title: string;
  detail?: string;
  colors: RepzyColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, { backgroundColor: c.inputBg, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={styles.optionIcon}>{icon}</Text>
      <View style={styles.flex}>
        <Text style={[styles.optionTitle, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {detail ? <Text style={{ color: c.subtext, fontSize: 13 }}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

function Stat({ value, label, colors }: { value: string; label: string; colors: RepzyColors }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.subtext }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
  savedBox: { borderRadius: 12, padding: 14 },
  primaryButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  startButton: { paddingVertical: 20, borderRadius: 18 },
  startText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  resumeCard: { borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 4 },
  resumeLabel: { fontSize: 13, fontWeight: '800' },
  resumeTitle: { fontSize: 20, fontWeight: '800' },
  card: { borderRadius: 18, padding: 16, gap: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  streak: { fontSize: 13, fontWeight: '800' },
  weekStats: { flexDirection: 'row' },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 12 },
  dots: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dotCol: { alignItems: 'center', gap: 4 },
  dot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotDate: { fontWeight: '800', fontSize: 14 },
  dotTick: { fontWeight: '900', fontSize: 11, lineHeight: 13 },
  dotLabel: { fontSize: 12, fontWeight: '700' },
  insight: { borderWidth: 1, borderRadius: 14, padding: 14 },
  smallLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  prValue: { fontSize: 24, fontWeight: '900' },
  prDetail: { fontSize: 15, fontWeight: '700' },
  chevron: { fontSize: 26, fontWeight: '300' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  link: { fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 14, lineHeight: 20 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  sheetSection: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginTop: 8 },
  sheetList: { maxHeight: 280 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, marginBottom: 8 },
  optionIcon: { fontSize: 20 },
  optionTitle: { fontSize: 16, fontWeight: '700' },
  cancel: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
});
