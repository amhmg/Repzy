import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader, { ActiveWorkoutBanner } from '@/components/app-header';
import ExerciseInfo from '@/components/exercise-info';
import ExerciseThumb from '@/components/exercise-thumb';
import HistoryList from '@/components/workout-history';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { findLibraryExercise } from '@/lib/exercise-library';
import {
  fetchAllRecords,
  fetchMyExercises,
  fetchTrainingSummary,
  MyExercise,
  RECORD_SHORT,
  RecordRow,
  setsByMuscleGroup,
  TrainingSummary,
} from '@/lib/progress';
import { formatKg, RECORD_TYPES } from '@/lib/workout';
import { useWorkoutSession } from '@/lib/workout-session';

type Section = 'overview' | 'history' | 'exercises' | 'records';
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'history', label: 'History' },
  { key: 'exercises', label: 'Exercises' },
  { key: 'records', label: 'Records' },
];

const UPDATE_NEEDED = 'This needs the latest database update. Run the SQL from the update notes, then pull to refresh.';

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function ProgressScreen() {
  const c = useRepzyColors();
  const params = useLocalSearchParams<{ section?: string }>();
  const { savedVersion } = useWorkoutSession();
  const [section, setSection] = useState<Section>('overview');
  const [infoFor, setInfoFor] = useState<string | null>(null);

  // "See all" on Home opens History directly
  useEffect(() => {
    if (params.section && SECTIONS.some((s) => s.key === params.section)) {
      setSection(params.section as Section);
      router.setParams({ section: undefined }); // so the next "See all" works again
    }
  }, [params.section]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]} edges={['top']}>
      <AppHeader title="Progress" />
      <ActiveWorkoutBanner />

      <View style={[styles.tabs, { backgroundColor: c.inputBg }]}>
        {SECTIONS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setSection(s.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === s.key }}
            style={[styles.tab, section === s.key && { backgroundColor: c.card }]}>
            <Text style={{ color: section === s.key ? c.text : c.subtext, fontWeight: '700', fontSize: 13 }}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.flex}>
        {section === 'overview' && <Overview colors={c} reloadKey={savedVersion} onExercise={setInfoFor} />}
        {section === 'history' && <HistoryList reloadKey={savedVersion} />}
        {section === 'exercises' && <Exercises colors={c} reloadKey={savedVersion} onExercise={setInfoFor} />}
        {section === 'records' && <Records colors={c} reloadKey={savedVersion} onExercise={setInfoFor} />}
      </View>

      {infoFor && <ExerciseInfo name={infoFor} onClose={() => setInfoFor(null)} />}
    </SafeAreaView>
  );
}

// ---------- Overview ----------

function Overview({
  colors: c,
  reloadKey,
  onExercise,
}: {
  colors: RepzyColors;
  reloadKey: number;
  onExercise: (name: string) => void;
}) {
  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummary(await fetchTrainingSummary());
    } catch (e: any) {
      setError(String(e.message).includes('get_training_summary') ? UPDATE_NEEDED : (e.message ?? 'Could not load your stats'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, reloadKey]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={refresh} />;

  if (error) return <Message text={error} colors={c} refreshControl={refreshControl} />;
  if (!summary) return <ActivityIndicator style={styles.loading} />;
  if (summary.total_workouts === 0) {
    return (
      <Message
        emoji="📈"
        text="Your stats appear here after your first workout: weekly consistency, total volume, records and which muscles you train."
        colors={c}
        refreshControl={refreshControl}
      />
    );
  }

  const muscles = setsByMuscleGroup(summary.week_exercise_sets);
  const maxMuscle = Math.max(1, ...muscles.map((m) => m.sets));
  const maxWeek = Math.max(1, ...summary.weeks.map((w) => w.workouts));
  const activeWeeks = summary.weeks.filter((w) => w.workouts > 0).length;

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
      <View style={styles.tiles}>
        <Tile value={String(summary.week_workouts)} label="This week" colors={c} />
        <Tile value={String(summary.month_workouts)} label="This month" colors={c} />
        <Tile value={String(summary.total_workouts)} label="All workouts" colors={c} />
      </View>
      <View style={styles.tiles}>
        <Tile value={summary.total_sets.toLocaleString()} label="Sets logged" colors={c} />
        <Tile value={formatKg(summary.total_volume)} label="Total volume" colors={c} />
        <Tile value={summary.week_streak > 0 ? `🔥 ${summary.week_streak}` : '0'} label="Week streak" colors={c} />
      </View>

      {/* Consistency: workouts per week, last 12 weeks */}
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Workouts per week</Text>
        <Text style={[styles.cardSub, { color: c.subtext }]}>
          Trained in {activeWeeks} of the last 12 weeks
        </Text>
        <View style={styles.chart} accessibilityLabel={`Workouts per week for the last 12 weeks: ${summary.weeks.map((w) => w.workouts).join(', ')}`}>
          {summary.weeks.map((w, i) => {
            const isLast = i === summary.weeks.length - 1;
            return (
              <View key={w.week} style={styles.barCol}>
                {(isLast || w.workouts === maxWeek) && w.workouts > 0 && (
                  <Text style={[styles.barValue, { color: c.text }]}>{w.workouts}</Text>
                )}
                <View
                  style={[
                    styles.bar,
                    {
                      height: w.workouts > 0 ? `${Math.max(6, (w.workouts / maxWeek) * 100)}%` : 3,
                      backgroundColor: w.workouts > 0 ? (isLast ? c.accent : c.accentSoft) : c.inputBg,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.axis}>
          <Text style={[styles.axisLabel, { color: c.subtext }]}>12 weeks ago</Text>
          <Text style={[styles.axisLabel, { color: c.subtext }]}>This week</Text>
        </View>
      </View>

      {/* Muscle groups this week */}
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Sets by muscle group this week</Text>
        <Text style={[styles.cardSub, { color: c.subtext }]}>
          Estimate: each set counts toward its exercise&apos;s main muscle group.
        </Text>
        {muscles.length === 0 ? (
          <Text style={{ color: c.subtext }}>No sets logged this week yet.</Text>
        ) : (
          muscles.map((m) => (
            <View key={m.group} style={styles.hRow}>
              <Text style={[styles.hLabel, { color: c.text }]}>{m.group}</Text>
              <View style={[styles.hTrack, { backgroundColor: c.inputBg }]}>
                <View style={[styles.hFill, { width: `${(m.sets / maxMuscle) * 100}%`, backgroundColor: c.accent }]} />
              </View>
              <Text style={[styles.hValue, { color: c.text }]}>{m.sets}</Text>
            </View>
          ))
        )}
      </View>

      {/* Recent PRs */}
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Recent records</Text>
        {summary.recent_prs.length === 0 ? (
          <Text style={{ color: c.subtext }}>
            Records start counting from the second time you do an exercise. Beat your previous best to set one.
          </Text>
        ) : (
          summary.recent_prs.map((pr, i) => (
            <Pressable key={i} onPress={() => onExercise(pr.exercise_name)} style={styles.prRow}>
              <Text style={styles.prIcon}>🏆</Text>
              <View style={styles.flex}>
                <Text style={[styles.prName, { color: c.text }]} numberOfLines={1}>
                  {pr.exercise_name}
                </Text>
                <Text style={{ color: c.subtext, fontSize: 12 }}>
                  {RECORD_SHORT[pr.record_type]}
                  {pr.weight != null && pr.reps != null ? ` · ${pr.weight} × ${pr.reps}` : ''} · {shortDate(pr.achieved_at)}
                </Text>
              </View>
              <Text style={[styles.prValue, { color: c.gold }]}>
                {formatKg(pr.value)}
                {pr.record_type === 'estimated_1rm' ? '*' : ''}
              </Text>
            </Pressable>
          ))
        )}
        {summary.recent_prs.some((p) => p.record_type === 'estimated_1rm') && (
          <Text style={{ color: c.subtext, fontSize: 11 }}>* estimated one-rep max (Epley formula), not a lift you did</Text>
        )}
      </View>
    </ScrollView>
  );
}

// ---------- Exercises ----------

function Exercises({
  colors: c,
  reloadKey,
  onExercise,
}: {
  colors: RepzyColors;
  reloadKey: number;
  onExercise: (name: string) => void;
}) {
  const [list, setList] = useState<MyExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await fetchMyExercises());
    } catch (e: any) {
      setError(String(e.message).includes('get_my_exercises') ? UPDATE_NEEDED : (e.message ?? 'Could not load exercises'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, reloadKey]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) return <Message text={error} colors={c} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} />;
  if (!list) return <ActivityIndicator style={styles.loading} />;

  const term = search.trim().toLowerCase();
  const shown = term ? list.filter((e) => e.name.toLowerCase().includes(term)) : list;

  return (
    <View style={styles.flex}>
      <View style={styles.searchWrap}>
        <TextInput
          style={[styles.search, { backgroundColor: c.inputBg, color: c.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="🔍  Search your exercises"
          placeholderTextColor={c.subtext}
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(e) => e.exercise_key}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onExercise(item.name)}
            style={({ pressed }) => [styles.exRow, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
            <ExerciseThumb gif={findLibraryExercise(item.name)?.gif ?? null} size={48} />
            <View style={styles.flex}>
              <Text style={[styles.prName, { color: c.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: c.subtext, fontSize: 12 }}>
                {item.sessions} session{item.sessions === 1 ? '' : 's'} · {item.total_sets} sets · last {shortDate(item.last_done)}
              </Text>
            </View>
            {item.best_e1rm != null && (
              <View style={styles.exBest}>
                <Text style={[styles.exBestValue, { color: c.text }]}>{formatKg(item.best_e1rm)}</Text>
                <Text style={{ color: c.subtext, fontSize: 10 }}>est. 1RM</Text>
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.subtext }]}>
            {term ? `No exercises match “${search.trim()}”.` : 'Exercises you log will appear here with their history and charts.'}
          </Text>
        }
      />
    </View>
  );
}

// ---------- Records ----------

function Records({
  colors: c,
  reloadKey,
  onExercise,
}: {
  colors: RepzyColors;
  reloadKey: number;
  onExercise: (name: string) => void;
}) {
  const [rows, setRows] = useState<RecordRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchAllRecords());
    } catch (e: any) {
      setError(e.message ?? 'Could not load your records');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, reloadKey]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) return <Message text={error} colors={c} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} />;
  if (!rows) return <ActivityIndicator style={styles.loading} />;

  // One card per exercise, most recently improved first
  const byExercise = new Map<string, RecordRow[]>();
  for (const r of rows) byExercise.set(r.exercise_key, [...(byExercise.get(r.exercise_key) ?? []), r]);
  const groups = [...byExercise.values()].sort(
    (a, b) =>
      Math.max(...b.map((r) => new Date(r.achieved_at).getTime())) - Math.max(...a.map((r) => new Date(r.achieved_at).getTime())),
  );

  return (
    <FlatList
      data={groups}
      keyExtractor={(g) => g[0].exercise_key}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        groups.length > 0 ? (
          <Text style={{ color: c.subtext, fontSize: 12, marginBottom: 4 }}>
            Your best ever per exercise. Heaviest and best set are lifts you did; est. 1RM is calculated from a set (Epley
            formula). Bodyweight-only sets don&apos;t create records yet.
          </Text>
        ) : null
      }
      renderItem={({ item: group }) => (
        <Pressable
          onPress={() => onExercise(group[0].exercise_name)}
          style={({ pressed }) => [styles.recordCard, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.prName, { color: c.text }]} numberOfLines={1}>
            {group[0].exercise_name}
          </Text>
          <View style={styles.recordRow}>
            {RECORD_TYPES.map((type) => {
              const r = group.find((x) => x.record_type === type);
              if (!r) return null;
              return (
                <View key={type} style={styles.recordCell}>
                  <Text style={[styles.recordValue, { color: c.gold }]}>{formatKg(r.value)}</Text>
                  <Text style={{ color: c.subtext, fontSize: 11 }}>{RECORD_SHORT[type]}</Text>
                  <Text style={{ color: c.subtext, fontSize: 11 }}>
                    {r.weight != null && r.reps != null ? `${r.weight} × ${r.reps}` : ''}
                  </Text>
                  <Text style={{ color: c.subtext, fontSize: 10 }}>{shortDate(r.achieved_at)}</Text>
                </View>
              );
            })}
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: c.subtext }]}>
          Your records appear here once you log weighted sets.
        </Text>
      }
    />
  );
}

// ---------- Small pieces ----------

function Tile({ value, label, colors }: { value: string; label: string; colors: RepzyColors }) {
  return (
    <View style={[styles.tile, { backgroundColor: colors.card }]}>
      <Text style={[styles.tileValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.tileLabel, { color: colors.subtext }]}>{label}</Text>
    </View>
  );
}

function Message({
  text,
  emoji,
  colors,
  refreshControl,
}: {
  text: string;
  emoji?: string;
  colors: RepzyColors;
  refreshControl?: React.ReactElement<any>;
}) {
  return (
    <ScrollView contentContainerStyle={styles.message} refreshControl={refreshControl}>
      {emoji ? <Text style={{ fontSize: 40 }}>{emoji}</Text> : null}
      <Text style={{ color: colors.subtext, textAlign: 'center', fontSize: 15, lineHeight: 21 }}>{text}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  loading: { marginTop: 32 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },
  message: { padding: 32, alignItems: 'center', gap: 12 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 10, gap: 2 },
  tileValue: { fontSize: 20, fontWeight: '800' },
  tileLabel: { fontSize: 12 },
  card: { borderRadius: 18, padding: 16, gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardSub: { fontSize: 12, marginTop: -4 },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 6 },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '80%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barValue: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { fontSize: 11 },
  hRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hLabel: { width: 76, fontSize: 13, fontWeight: '700' },
  hTrack: { flex: 1, height: 12, borderRadius: 6, overflow: 'hidden' },
  hFill: { height: 12, borderRadius: 6 },
  hValue: { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  prIcon: { fontSize: 18 },
  prName: { fontSize: 15, fontWeight: '800' },
  prValue: { fontSize: 15, fontWeight: '900' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  search: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 10 },
  exBest: { alignItems: 'flex-end' },
  exBestValue: { fontSize: 14, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15, lineHeight: 21 },
  recordCard: { borderRadius: 16, padding: 14, gap: 10 },
  recordRow: { flexDirection: 'row', gap: 8 },
  recordCell: { flex: 1, gap: 1 },
  recordValue: { fontSize: 16, fontWeight: '900' },
});
