import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import AppHeader, { ActiveWorkoutBanner } from '@/components/app-header';
import ExerciseInfo from '@/components/exercise-info';
import ExercisePicker from '@/components/exercise-picker';
import RoutineEditor from '@/components/routine-editor';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import {
  deleteRoutine,
  duplicateRoutine,
  fetchRoutines,
  formatRepRange,
  Routine,
  routineSetCount,
} from '@/lib/routines';
import { useSettings } from '@/lib/settings';
import { draftFromRoutine } from '@/lib/workout-draft';
import { useWorkoutSession } from '@/lib/workout-session';

export default function WorkoutsScreen() {
  const c = useRepzyColors();
  const session = useWorkoutSession();
  const { settings } = useSettings();

  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ routine?: Routine } | null>(null);
  const [library, setLibrary] = useState(false);
  const [infoFor, setInfoFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRoutines(await fetchRoutines());
    } catch (e: any) {
      setRoutines([]);
      setError(
        String(e.message).includes('routines')
          ? 'Routines need the latest database update. Run the SQL from the update notes.'
          : (e.message ?? 'Could not load routines'),
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function duplicate(routine: Routine) {
    try {
      await duplicateRoutine(routine);
      load();
    } catch (e: any) {
      Alert.alert('Could not duplicate', e.message ?? 'Please try again.');
    }
  }

  function confirmDelete(routine: Routine) {
    Alert.alert('Delete routine?', `“${routine.name}” will be deleted. Past workouts are not affected.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoutine(routine.id);
            setRoutines((list) => (list ?? []).filter((r) => r.id !== routine.id));
          } catch (e: any) {
            Alert.alert('Could not delete', e.message ?? 'Please try again.');
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]} edges={['top']}>
      <AppHeader title="Workouts" subtitle="Plan it once, start it in one tap" />
      <ActiveWorkoutBanner />

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Pressable
          onPress={session.startEmpty}
          style={({ pressed }) => [styles.primary, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={styles.primaryText}>Start empty workout</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>My routines</Text>
          <Pressable onPress={() => setEditing({})} hitSlop={10}>
            <Text style={[styles.link, { color: c.accent }]}>+ New routine</Text>
          </Pressable>
        </View>

        {error && <Text style={[styles.error, { color: c.error }]}>{error}</Text>}

        {routines === null ? (
          <ActivityIndicator />
        ) : routines.length === 0 && !error ? (
          <Pressable onPress={() => setEditing({})} style={[styles.emptyCard, { borderColor: c.border }]}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={[styles.emptyTitle, { color: c.text }]}>Create your first routine</Text>
            <Text style={[styles.emptyText, { color: c.subtext }]}>
              Save a plan like Push Day, Pull Day or Legs with target sets and reps. Starting it gives you a fresh workout
              and never changes the plan.
            </Text>
          </Pressable>
        ) : (
          routines.map((r) => (
            <RoutineCard
              key={r.id}
              routine={r}
              colors={c}
              onStart={() => session.startWith(draftFromRoutine(r, settings.defaultRestSeconds))}
              onEdit={() => setEditing({ routine: r })}
              onDuplicate={() => duplicate(r)}
              onDelete={() => confirmDelete(r)}
            />
          ))
        )}

        <Text style={[styles.sectionTitle, { color: c.text, marginTop: 8 }]}>Exercises</Text>
        <Pressable
          onPress={() => setLibrary(true)}
          style={({ pressed }) => [styles.libraryCard, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.libraryIcon}>📚</Text>
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Exercise library</Text>
            <Text style={{ color: c.subtext, fontSize: 13 }}>Search 1,400+ exercises, see how to do them, save favourites</Text>
          </View>
          <Text style={[styles.chevron, { color: c.subtext }]}>›</Text>
        </Pressable>
      </ScrollView>

      {editing && (
        <RoutineEditor
          routine={editing.routine}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {library && (
        <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => (infoFor ? setInfoFor(null) : setLibrary(false))}>
          <SafeAreaProvider>
          <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
            <ExercisePicker
              title="Exercise library"
              cancelLabel="Close"
              onInfo={setInfoFor}
              onCancel={() => setLibrary(false)}
            />
            {infoFor && <ExerciseInfo name={infoFor} onClose={() => setInfoFor(null)} />}
          </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function RoutineCard({
  routine,
  colors: c,
  onStart,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  routine: Routine;
  colors: RepzyColors;
  onStart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const preview = routine.exercises.slice(0, 4);
  const more = routine.exercises.length - preview.length;

  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <Pressable onPress={onEdit} style={styles.cardTop}>
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>
            {routine.name}
          </Text>
          <Text style={{ color: c.subtext, fontSize: 13 }}>
            {routine.exercises.length} exercise{routine.exercises.length === 1 ? '' : 's'} · {routineSetCount(routine)} sets
          </Text>
        </View>
      </Pressable>

      {preview.map((e, i) => {
        const reps = formatRepRange(e.rep_min, e.rep_max);
        return (
          <Text key={i} style={{ color: c.subtext, fontSize: 14 }} numberOfLines={1}>
            {e.target_sets} × {reps ? `${reps} ` : ''}
            <Text style={{ color: c.text }}>{e.exercise_name}</Text>
          </Text>
        );
      })}
      {more > 0 && <Text style={{ color: c.subtext, fontSize: 13 }}>+{more} more</Text>}

      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.startRoutine, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={styles.startRoutineText}>Start routine</Text>
      </Pressable>
      <View style={styles.actions}>
        <SmallAction label="Edit" onPress={onEdit} colors={c} />
        <SmallAction label="Duplicate" onPress={onDuplicate} colors={c} />
        <SmallAction label="Delete" onPress={onDelete} colors={c} danger />
      </View>
    </View>
  );
}

function SmallAction({
  label,
  onPress,
  colors: c,
  danger,
}: {
  label: string;
  onPress: () => void;
  colors: RepzyColors;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.smallAction, { backgroundColor: c.inputBg, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: danger ? c.error : c.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
  primary: { borderRadius: 18, paddingVertical: 18, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  link: { fontSize: 15, fontWeight: '800' },
  error: { fontSize: 14, textAlign: 'center' },
  emptyCard: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 18, padding: 20, alignItems: 'center', gap: 6 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  card: { borderRadius: 18, padding: 16, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  smallAction: { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  startRoutine: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  startRoutineText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  libraryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16 },
  libraryIcon: { fontSize: 28 },
  chevron: { fontSize: 26, fontWeight: '300' },
});
