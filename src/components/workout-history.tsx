import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import ExerciseInfo from '@/components/exercise-info';
import ExerciseThumb from '@/components/exercise-thumb';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { findLibraryExercise } from '@/lib/exercise-library';
import {
  deleteWorkout,
  fetchWorkoutDetail,
  fetchWorkoutHistory,
  formatDay,
  formatDuration,
  formatFullDate,
  formatMonth,
  formatSet,
  SET_TYPE_LABEL,
  formatTime,
  workoutDate,
  WorkoutDetail,
  WorkoutSummary,
} from '@/lib/history';
import { useSettings } from '@/lib/settings';
import { estimateOneRepMax, formatKg } from '@/lib/workout';
import { draftFromWorkout } from '@/lib/workout-draft';
import { useWorkoutSession } from '@/lib/workout-session';

const VISIBILITY_ICON = { private: '🔒', group: '👥', public: '🌍' } as const;

// The History list inside Progress: searchable, grouped by month, newest first.
export default function HistoryList({ reloadKey }: { reloadKey?: number }) {
  const c = useRepzyColors();

  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  // Wait until typing pauses before searching
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadFirstPage = useCallback(async () => {
    setError(null);
    try {
      const { rows, hasMore: more } = await fetchWorkoutHistory(undefined, { search: query });
      setWorkouts(rows);
      setHasMore(more);
    } catch (e: any) {
      setError(
        query && String(e.message).includes('p_search')
          ? 'Search needs the latest database update. Run the SQL from the update notes.'
          : (e.message ?? 'Could not load your workouts'),
      );
    }
  }, [query]);

  useEffect(() => {
    setLoading(true);
    loadFirstPage().finally(() => setLoading(false));
  }, [loadFirstPage, reloadKey]);

  async function refresh() {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  }

  async function loadMore() {
    if (!hasMore || loadingMore || workouts.length === 0) return;
    setLoadingMore(true);
    try {
      const last = workouts[workouts.length - 1];
      const { rows, hasMore: more } = await fetchWorkoutHistory(workoutDate(last).toISOString(), { search: query });
      setWorkouts((list) => [...list, ...rows.filter((r) => !list.some((w) => w.id === r.id))]);
      setHasMore(more);
    } catch {
      // keep what we have
    } finally {
      setLoadingMore(false);
    }
  }

  // Group by month
  const sections: { title: string; data: WorkoutSummary[] }[] = [];
  for (const w of workouts) {
    const title = formatMonth(workoutDate(w));
    const section = sections.find((s) => s.title === title);
    if (section) section.data.push(w);
    else sections.push({ title, data: [w] });
  }

  return (
    <View style={styles.flex}>
      <View style={styles.searchWrap}>
        <TextInput
          style={[styles.search, { backgroundColor: c.inputBg, color: c.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="🔍  Search by workout or exercise"
          placeholderTextColor={c.subtext}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : error ? (
        <View style={styles.centered}>
          <Text style={{ color: c.error, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={refresh} style={[styles.retry, { backgroundColor: c.accent }]}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(w) => w.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          stickySectionHeadersEnabled={false}
          keyboardDismissMode="on-drag"
          renderSectionHeader={({ section }) => (
            <Text style={[styles.monthHeader, { color: c.subtext }]}>
              {section.title} · {section.data.length}
            </Text>
          )}
          renderItem={({ item }) => <WorkoutCard workout={item} colors={c} onPress={() => setOpenId(item.id)} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>{query ? '🔍' : '📋'}</Text>
              <Text style={[styles.emptyText, { color: c.subtext }]}>
                {query
                  ? `No workouts match “${query}”.`
                  : 'No workouts yet. Finish a workout and it will show up here.'}
              </Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.loading} /> : undefined}
        />
      )}

      {openId && (
        <WorkoutDetailModal
          id={openId}
          onClose={() => setOpenId(null)}
          onDeleted={() => {
            setWorkouts((list) => list.filter((w) => w.id !== openId));
            setOpenId(null);
          }}
        />
      )}
    </View>
  );
}

// A workout's full detail in its own window (used by History, Home and anywhere else)
export function WorkoutDetailModal({
  id,
  onClose,
  onDeleted,
  canDelete = true,
  ownerLabel,
}: {
  id: string;
  onClose: () => void;
  onDeleted?: () => void;
  canDelete?: boolean;
  ownerLabel?: string;
}) {
  const c = useRepzyColors();
  const [infoFor, setInfoFor] = useState<string | null>(null);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => (infoFor ? setInfoFor(null) : onClose())}>
      <SafeAreaProvider>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
        <WorkoutDetailView
          id={id}
          colors={c}
          onBack={onClose}
          onInfo={setInfoFor}
          onDeleted={onDeleted}
          onRepeatStarted={onClose}
          canDelete={canDelete}
          ownerLabel={ownerLabel}
        />
        {infoFor && <ExerciseInfo name={infoFor} onClose={() => setInfoFor(null)} />}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

// ---------- Workout card ----------

export function WorkoutCard({
  workout,
  colors: c,
  onPress,
}: {
  workout: WorkoutSummary;
  colors: RepzyColors;
  onPress: () => void;
}) {
  const date = workoutDate(workout);
  const names = workout.exercise_names;
  const shown = names.slice(0, 3).join(', ');
  const extra = names.length > 3 ? ` +${names.length - 3} more` : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>
          {workout.title || 'Workout'}
        </Text>
        <Text style={styles.cardIcon}>{VISIBILITY_ICON[workout.visibility]}</Text>
      </View>
      <Text style={[styles.cardDate, { color: c.subtext }]}>
        {formatDay(date)} · {formatTime(date)}
      </Text>

      <View style={styles.cardStats}>
        <Text style={[styles.cardStat, { color: c.text }]}>⏱ {formatDuration(workout.duration_minutes)}</Text>
        <Text style={[styles.cardStat, { color: c.text }]}>{workout.set_count} sets</Text>
        <Text style={[styles.cardStat, { color: c.text }]}>{formatKg(workout.volume)}</Text>
        {workout.pr_count > 0 && (
          <Text style={[styles.cardStat, { color: c.gold }]}>
            🏆 {workout.pr_count} PR{workout.pr_count === 1 ? '' : 's'}
          </Text>
        )}
      </View>

      {names.length > 0 && (
        <Text style={[styles.cardExercises, { color: c.subtext }]} numberOfLines={2}>
          {shown}
          {extra}
        </Text>
      )}
    </Pressable>
  );
}

// ---------- Workout detail ----------

export function WorkoutDetailView({
  id,
  colors: c,
  onBack,
  onInfo,
  onDeleted,
  canDelete = true,
  ownerLabel,
  onRepeatStarted,
}: {
  id: string;
  colors: RepzyColors;
  onBack: () => void;
  onInfo: (name: string) => void;
  onDeleted?: () => void;
  canDelete?: boolean; // false when viewing someone else's workout
  ownerLabel?: string; // e.g. "@sam", shown under the title
  onRepeatStarted?: () => void; // close whatever is showing this, so the workout is visible
}) {
  const session = useWorkoutSession();
  const { settings } = useSettings();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchWorkoutDetail(id)
      .then(setDetail)
      .catch((e) => setError(e.message ?? 'Could not load this workout'));
  }, [id]);

  function confirmDelete() {
    Alert.alert(
      'Delete workout?',
      'This removes the workout and its sets for good. Your personal records will be recalculated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteWorkout(id);
              onDeleted?.();
            } catch (e: any) {
              setDeleting(false);
              Alert.alert('Could not delete', e.message ?? 'Please try again.');
            }
          },
        },
      ],
    );
  }

  const allSets = detail?.exercises.flatMap((e) => e.sets) ?? [];
  const volume = allSets.reduce((sum, s) => sum + (s.weight ?? 0) * s.reps, 0);
  const date = detail ? workoutDate(detail) : null;

  return (
    <>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={[styles.headerSide, { color: c.subtext }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.text }]}>Workout</Text>
        <View style={styles.headerSide} />
      </View>

      {error ? (
        <Text style={[styles.centeredText, { color: c.error }]}>{error}</Text>
      ) : !detail || !date ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Text style={[styles.detailTitle, { color: c.text }]}>{detail.title || 'Workout'}</Text>
          {ownerLabel ? <Text style={{ color: c.accent, fontWeight: '700' }}>{ownerLabel}</Text> : null}
          <Text style={{ color: c.subtext }}>
            {formatFullDate(date)} · {formatTime(date)} · {VISIBILITY_ICON[detail.visibility]}
          </Text>

          {detail.notes ? (
            <Text style={{ color: c.text, fontStyle: 'italic' }}>📝 {detail.notes}</Text>
          ) : null}

          <View style={[styles.summary, { backgroundColor: c.card }]}>
            <Stat label="Time" value={formatDuration(detail.duration_minutes)} colors={c} />
            <Stat label="Sets" value={String(allSets.length)} colors={c} />
            <Stat label="Volume" value={formatKg(volume)} colors={c} />
          </View>

          {detail.exercises.map((ex) => {
            const best = ex.sets
              .filter((s) => s.weight != null && s.weight > 0 && s.set_type !== 'warmup')
              .reduce((m, s) => Math.max(m, estimateOneRepMax(s.weight as number, s.reps)), 0);
            return (
              <View key={ex.id} style={[styles.exerciseCard, { backgroundColor: c.card }]}>
                <View style={styles.exerciseHeader}>
                  <ExerciseThumb gif={findLibraryExercise(ex.name)?.gif ?? null} size={48} />
                  <View style={styles.flex}>
                    <Text style={[styles.exerciseName, { color: c.accent }]} numberOfLines={2}>
                      {ex.name}
                    </Text>
                    {best > 0 && (
                      <Text style={{ color: c.subtext, fontSize: 12 }}>Best est. 1RM {formatKg(best)}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => onInfo(ex.name)}
                    hitSlop={10}
                    style={[styles.infoButton, { borderColor: c.border }]}>
                    <Text style={[styles.infoText, { color: c.subtext }]}>i</Text>
                  </Pressable>
                </View>
                {ex.notes ? (
                  <Text style={{ color: c.subtext, fontStyle: 'italic' }}>📝 {ex.notes}</Text>
                ) : null}
                {ex.sets.map((s) => {
                  const typeLabel = s.set_type ? SET_TYPE_LABEL[s.set_type] : undefined;
                  return (
                    <View key={s.set_number} style={styles.setRow}>
                      <Text style={[styles.setNumber, { color: typeLabel ? c.accent : c.subtext }]}>
                        {typeLabel ? typeLabel[0] : s.set_number}
                      </Text>
                      <Text style={[styles.setText, { color: c.text }]}>
                        {formatSet(s)}
                        {typeLabel ? <Text style={{ color: c.subtext }}>  · {typeLabel}</Text> : null}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}

          <Pressable
            onPress={() => {
              session.startWith(draftFromWorkout(detail, settings.defaultRestSeconds));
              onRepeatStarted?.();
            }}
            style={({ pressed }) => [styles.repeatButton, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}>
            <Text style={styles.repeatText}>↻ Do this workout again</Text>
          </Pressable>

          {canDelete && (
          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            style={[styles.deleteButton, { borderColor: c.error, opacity: deleting ? 0.5 : 1 }]}>
            {deleting ? (
              <ActivityIndicator color={c.error} />
            ) : (
              <Text style={{ color: c.error, fontWeight: '700' }}>Delete workout</Text>
            )}
          </Pressable>
          )}
        </ScrollView>
      )}
    </>
  );
}

function Stat({ label, value, colors }: { label: string; value: string; colors: RepzyColors }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.subtext }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: 64, fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  loading: { marginVertical: 24 },
  centered: { alignItems: 'center', padding: 32, gap: 12 },
  centeredText: { textAlign: 'center', padding: 32 },
  retry: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  list: { padding: 16, paddingBottom: 48, gap: 10 },
  summary: { flexDirection: 'row', borderRadius: 16, paddingVertical: 14, marginBottom: 4 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 12 },
  monthHeader: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginTop: 12, marginBottom: 2 },
  card: { borderRadius: 16, padding: 14, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '800' },
  cardIcon: { fontSize: 14 },
  cardDate: { fontSize: 13 },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 },
  cardStat: { fontSize: 13, fontWeight: '600' },
  cardExercises: { fontSize: 13 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { textAlign: 'center', fontSize: 15 },
  detailContent: { padding: 16, gap: 12, paddingBottom: 48 },
  detailTitle: { fontSize: 24, fontWeight: '800' },
  exerciseCard: { borderRadius: 16, padding: 14, gap: 6 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  exerciseName: { fontSize: 16, fontWeight: '800' },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { fontSize: 14, fontWeight: '800', fontStyle: 'italic' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 3 },
  setNumber: { width: 20, textAlign: 'center', fontWeight: '700' },
  setText: { fontSize: 15, fontWeight: '600' },
  repeatButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  repeatText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 4 },
  search: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  deleteButton: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
});
