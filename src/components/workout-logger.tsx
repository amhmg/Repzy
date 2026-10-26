import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import ActionSheet, { SheetAction } from '@/components/action-sheet';
import ExerciseInfo from '@/components/exercise-info';
import ExercisePicker from '@/components/exercise-picker';
import ExerciseThumb from '@/components/exercise-thumb';
import RestPicker, { formatRest } from '@/components/rest-picker';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { CoachExercise, epley, recommendNext, Recommendation } from '@/lib/coach/engine';
import { findLibraryExercise } from '@/lib/exercise-library';
import { fetchMyGroups, GroupSummary } from '@/lib/groups';
import * as haptics from '@/lib/haptics';
import { findNextSet, markPRs, setTypeOf } from '@/lib/quick-set';
import { getSettings, useSettings } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import {
  Bests,
  formatKg,
  newId,
  parseNumber,
  RECORD_LABELS,
  RECORD_TYPES,
  RecordType,
  recordValues,
} from '@/lib/workout';
import {
  clearDraft,
  DraftExercise,
  DraftPreviousSet,
  DraftSet,
  DraftVisibility,
  saveDraft,
  SetType,
  WorkoutDraft,
} from '@/lib/workout-draft';
import {
  cancelRestDone,
  clearWorkoutNotifications,
  scheduleRestDone,
  setupWorkoutNotifications,
  showActiveWorkout,
} from '@/lib/workout-notifications';

// ---------- Types ----------

// The same shapes are saved to the phone as a draft (see lib/workout-draft.ts)
type LoggedSet = DraftSet;
type PreviousSet = DraftPreviousSet;
type LoggedExercise = DraftExercise; // historicBest = best-ever from saved workouts, never changed during this workout
type RestState = { endsAt: number; total: number; exerciseName: string };

type Celebration = { id: string; exercise: string; lines: string[] };

type Screen = 'log' | 'pick' | 'finish';

type Props = {
  userId: string;
  draft: WorkoutDraft | null; // resume this workout instead of starting a new one
  onDiscard: () => void;
  onMinimize: () => void;
  onSaved: (summary: { prCount: number; title: string }) => void;
  completeNextSignal?: number; // bumps when the notification's "✓ Done set" button is pressed
};

// ---------- Helpers ----------

const DEFAULT_REST = 90;

function emptySet(): LoggedSet {
  return { id: newId(), weight: '', reps: '', done: false, prTypes: [], type: 'normal', rpe: null };
}

const SET_TYPES: { type: SetType; label: string; short: string; detail: string }[] = [
  { type: 'normal', label: 'Working set', short: '', detail: 'A normal set' },
  { type: 'warmup', label: 'Warm-up', short: 'W', detail: 'Never counts toward PRs or the coach' },
  { type: 'drop', label: 'Drop set', short: 'D', detail: 'Straight after a set, lighter weight' },
  { type: 'failure', label: 'Failure', short: 'F', detail: 'Taken to failure' },
  { type: 'amrap', label: 'AMRAP', short: 'A', detail: 'As many reps as possible' },
  { type: 'backoff', label: 'Back-off', short: 'B', detail: 'Lighter set after your top set' },
];
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

// Best estimated 1RM of non-warm-up weighted sets (for "vs last time")
function bestE1rm(sets: { weight: number | null; reps: number | null; type?: SetType }[]) {
  let best = 0;
  for (const s of sets) {
    if (s.type === 'warmup' || !s.weight || !s.reps) continue;
    best = Math.max(best, epley(s.weight, s.reps));
  }
  return best;
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function defaultTitle(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'Morning workout';
  if (hour < 17) return 'Afternoon workout';
  return 'Evening workout';
}

function formatRepRange(min: number | null, max: number | null) {
  if (min && max) return min === max ? `${min} reps` : `${min}–${max} reps`;
  if (min) return `${min}+ reps`;
  if (max) return `up to ${max} reps`;
  return 'any reps';
}

function formatPrevious(p?: PreviousSet) {
  if (!p || p.reps == null) return '–';
  return p.weight != null && Number(p.weight) > 0 ? `${Number(p.weight)} × ${p.reps}` : `${p.reps} reps`;
}

// ---------- PR celebration ----------

function PRCelebration({
  celebration,
  colors,
  onDone,
}: {
  celebration: Celebration;
  colors: RepzyColors;
  onDone: () => void;
}) {
  const [scale] = useState(() => new Animated.Value(0.6));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    scale.setValue(0.6);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => onDone());
    }, 2400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration.id]);

  return (
    <View style={styles.celebrationWrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.celebrationCard,
          { backgroundColor: colors.card, borderColor: colors.gold, opacity, transform: [{ scale }] },
        ]}>
        <Text style={styles.celebrationTrophy}>🏆</Text>
        <Text style={[styles.celebrationTitle, { color: colors.gold }]}>New PR!</Text>
        <Text style={[styles.celebrationExercise, { color: colors.text }]}>{celebration.exercise}</Text>
        {celebration.lines.map((line) => (
          <Text key={line} style={[styles.celebrationLine, { color: colors.subtext }]}>
            {line}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

// ---------- Main screen ----------

export default function WorkoutLogger({ userId, draft, onDiscard, onMinimize, onSaved, completeNextSignal = 0 }: Props) {
  const c = useRepzyColors();

  const [startedAt] = useState(() => (draft ? new Date(draft.startedAt) : new Date()));
  const [now, setNow] = useState(() => Date.now());
  const [screen, setScreen] = useState<Screen>('log');
  const [exercises, setExercises] = useState<LoggedExercise[]>(() => draft?.exercises ?? []);
  const [rest, setRest] = useState<RestState | null>(() =>
    draft?.rest && draft.rest.endsAt > Date.now() ? draft.rest : null,
  );
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [restEditingId, setRestEditingId] = useState<string | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);

  const [title, setTitle] = useState(() => draft?.title ?? defaultTitle(new Date()));
  const [visibility, setVisibility] = useState<DraftVisibility>(() => draft?.visibility ?? 'private');
  const [groupId, setGroupId] = useState<string | null>(() => draft?.groupId ?? null);
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [workoutNotes, setWorkoutNotes] = useState(() => draft?.notes ?? '');

  const { settings } = useSettings();
  const [setSheet, setSetSheet] = useState<{ exId: string; setId: string } | null>(null);
  const [exerciseSheet, setExerciseSheet] = useState<string | null>(null);
  const [replaceFor, setReplaceFor] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());
  const [coachHidden, setCoachHidden] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ exId: string; set: LoggedSet; index: number } | null>(null);

  // One clock for both the workout timer and the rest timer
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (rest && now >= rest.endsAt) {
      setRest(null);
      cancelRestDone();
      // Only buzz if we were watching; coming back to the app long after shouldn't vibrate
      if (now - rest.endsAt < 3000) haptics.notify(haptics.NotifyType.Warning);
    }
  }, [now, rest]);

  // Ask for notification permission when the first workout starts, and
  // re-arm the rest alarm if we're resuming mid-rest
  useEffect(() => {
    setupWorkoutNotifications();
    if (rest) scheduleRestDone(rest.endsAt, rest.exerciseName);
    // Exercises that were still loading their history when the app closed
    for (const ex of exercises) {
      if (ex.loading) loadExerciseHistory(ex.id, ex.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save the workout to the phone after every change (debounced)
  const finished = useRef(false);

  function buildDraft(): WorkoutDraft {
    return {
      version: 1,
      startedAt: startedAt.toISOString(),
      exercises,
      rest,
      title,
      visibility,
      groupId,
      notes: workoutNotes,
      updatedAt: new Date().toISOString(),
    };
  }

  useEffect(() => {
    const draftNow: WorkoutDraft = {
      version: 1,
      startedAt: startedAt.toISOString(),
      exercises,
      rest,
      title,
      visibility,
      groupId,
      notes: workoutNotes,
      updatedAt: new Date().toISOString(),
    };
    const timer = setTimeout(() => {
      if (!finished.current) saveDraft(userId, draftNow);
    }, 300);
    return () => clearTimeout(timer);
  }, [userId, startedAt, exercises, rest, title, visibility, groupId, workoutNotes]);

  // The undo bar disappears after 5 seconds
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  // ---------- Stats ----------

  const doneSets = exercises.flatMap((ex) => ex.sets.filter((s) => s.done));
  const totalVolume = doneSets.reduce(
    (sum, s) => sum + (parseNumber(s.weight) ?? 0) * (parseNumber(s.reps) ?? 0),
    0,
  );
  const prCount = doneSets.filter((s) => s.prTypes.length > 0).length;
  const elapsed = (now - startedAt.getTime()) / 1000;

  const currentExercise =
    [...exercises].reverse().find((ex) => ex.sets.some((s) => s.done))?.name ??
    exercises[exercises.length - 1]?.name ??
    null;

  // What the lock-screen notification shows: the next set and its numbers, plus the rest end time
  const upcoming = findNextSet(buildDraft());
  const nextSetKey = upcoming
    ? `${upcoming.exerciseName}|${upcoming.label}|${upcoming.weight}|${upcoming.reps}|${doneSets.length}`
    : `done|${doneSets.length}`;

  // Keep the lock-screen "Workout in progress" notification up to date
  useEffect(() => {
    if (finished.current) return;
    // wait until typing stops, so the notification isn't replaced on every keystroke
    const t = setTimeout(() => {
      if (!finished.current) showActiveWorkout(buildDraft());
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextSetKey, rest?.endsAt]);

  // "✓ Done set" on the lock-screen notification while this screen is open: tick the next set
  const lastSignal = useRef(completeNextSignal);
  useEffect(() => {
    if (completeNextSignal === lastSignal.current) return;
    lastSignal.current = completeNextSignal;
    const next = findNextSet(buildDraft());
    if (next) toggleSet(exercises[next.exerciseIndex], next.setIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completeNextSignal]);

  // Load groups for the "share to group" option once you reach the finish screen
  useEffect(() => {
    if (screen !== 'finish' || groups) return;
    fetchMyGroups()
      .then((list) => {
        setGroups(list);
        if (list.length > 0 && !list.some((g) => g.id === groupId)) setGroupId(list[0].id);
        if (list.length === 0) {
          setGroupId(null);
          setVisibility((v) => (v === 'group' ? 'private' : v));
        }
      })
      .catch(() => setGroups([]));
  }, [screen, groups, groupId]);

  // ---------- Exercise actions ----------

  function updateExercise(id: string, change: (ex: LoggedExercise) => LoggedExercise) {
    setExercises((list) => list.map((ex) => (ex.id === id ? change(ex) : ex)));
  }

  async function addExercise(name: string, gif: string | null) {
    setScreen('log');

    const id = newId();
    setExercises((list) => [
      ...list,
      {
        id,
        name,
        gif,
        restSeconds: getSettings().defaultRestSeconds,
        sets: [emptySet()],
        previous: [],
        hasHistory: false,
        historicBest: {},
        loading: true,
      },
    ]);

    await loadExerciseHistory(id, name);
  }

  // Load saved bests and last session for an exercise in this workout
  async function loadExerciseHistory(id: string, name: string) {
    const [recordsRes, previousRes] = await Promise.all([
      supabase.from('personal_records').select('record_type, value').eq('exercise_key', name.trim().toLowerCase()),
      supabase.rpc('get_last_performance', { exercise_name: name }),
    ]);

    const historicBest: Bests = {};
    for (const r of recordsRes.data ?? []) {
      historicBest[r.record_type as RecordType] = Number(r.value);
    }
    const previous = ((previousRes.data ?? []) as PreviousSet[]).map((p) => ({
      ...p,
      weight: p.weight == null ? null : Number(p.weight),
    }));

    updateExercise(id, (ex) => {
      const untouched = ex.sets.every((s) => !s.done && s.weight === '' && s.reps === '');
      return markPRs({
        ...ex,
        previous,
        historicBest,
        hasHistory: Object.keys(historicBest).length > 0,
        loading: false,
        // Start with as many sets as last time, like Hevy
        // routines keep their target set count
        sets: untouched && !ex.target && previous.length > 1 ? previous.map(() => emptySet()) : ex.sets,
      });
    });
  }

  function moveExercise(exId: string, by: number) {
    setExercises((list) => {
      const i = list.findIndex((e) => e.id === exId);
      const to = i + by;
      if (i < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  // Swap the exercise but keep the sets you've planned or entered
  async function replaceExercise(exId: string, name: string, gif: string | null) {
    setReplaceFor(null);
    setScreen('log');
    updateExercise(exId, (ex) => ({
      ...ex,
      name,
      gif,
      previous: [],
      historicBest: {},
      hasHistory: false,
      loading: true,
      sets: ex.sets.map((s) => ({ ...s, prTypes: [] })),
    }));
    await loadExerciseHistory(exId, name);
  }

  function toggleNotes(exId: string) {
    setNotesOpen((prev) => {
      const next = new Set(prev);
      if (next.has(exId)) next.delete(exId);
      else next.add(exId);
      return next;
    });
  }

  // The coach's target for this exercise, from your last session (and routine target)
  function coachFor(ex: LoggedExercise): Recommendation | null {
    if (!settings.coachSuggestions || ex.loading || coachHidden.has(ex.id)) return null;
    if (ex.previous.length === 0) return null;
    const lib = findLibraryExercise(ex.name);
    const history: CoachExercise = {
      name: ex.name,
      group: lib?.group ?? null,
      equipment: lib?.equipment ?? null,
      sessions: [
        {
          date: new Date(Date.now() - 86400000).toISOString(),
          sets: ex.previous
            .filter((p) => p.reps != null && p.reps > 0)
            .map((p) => ({ weight: p.weight, reps: p.reps as number, type: p.set_type })),
        },
      ],
    };
    const rec = recommendNext(history, {
      target: ex.target ? { min: ex.target.repMin, max: ex.target.repMax, sets: ex.target.sets } : undefined,
    });
    return rec.action === 'start' ? null : rec;
  }

  // Fill the coach's numbers into the sets you haven't done yet (warm-ups left alone)
  function applyCoach(ex: LoggedExercise, rec: Recommendation) {
    haptics.selection();
    updateExercise(ex.id, (e) => {
      const sets = [...e.sets];
      let r = 0;
      for (let i = 0; i < sets.length && r < rec.reps.length; i++) {
        const s = sets[i];
        if (s.done || setTypeOf(s) === 'warmup') continue;
        sets[i] = { ...s, weight: rec.weight != null ? String(rec.weight) : s.weight, reps: String(rec.reps[r]) };
        r++;
      }
      while (r < rec.reps.length) {
        sets.push({ ...emptySet(), weight: rec.weight != null ? String(rec.weight) : '', reps: String(rec.reps[r]) });
        r++;
      }
      return { ...e, sets };
    });
  }

  function removeExercise(ex: LoggedExercise) {
    Alert.alert('Remove exercise?', `Remove ${ex.name} and its sets from this workout?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setExercises((list) => list.filter((e) => e.id !== ex.id)),
      },
    ]);
  }

  function setExerciseRest(exId: string, seconds: number) {
    updateExercise(exId, (e) => ({ ...e, restSeconds: seconds }));
    setRestEditingId(null);
  }

  // ---------- Set actions ----------

  function addSet(exId: string) {
    updateExercise(exId, (ex) => ({ ...ex, sets: [...ex.sets, emptySet()] }));
  }

  function deleteSet(exId: string, setId: string) {
    haptics.impact(haptics.ImpactStyle.Medium);
    const ex = exercises.find((e) => e.id === exId);
    const index = ex ? ex.sets.findIndex((s) => s.id === setId) : -1;
    if (ex && index >= 0) setUndo({ exId, set: ex.sets[index], index });
    updateExercise(exId, (e) => markPRs({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
  }

  function undoDelete() {
    if (!undo) return;
    const { exId, set, index } = undo;
    setUndo(null);
    updateExercise(exId, (e) => {
      const sets = [...e.sets];
      sets.splice(Math.min(index, sets.length), 0, set);
      return markPRs({ ...e, sets });
    });
  }

  function duplicateSet(exId: string, setId: string) {
    updateExercise(exId, (e) => {
      const i = e.sets.findIndex((s) => s.id === setId);
      if (i < 0) return e;
      const src = e.sets[i];
      const copy: LoggedSet = { ...src, id: newId(), done: false, prTypes: [] };
      const sets = [...e.sets];
      sets.splice(i + 1, 0, copy);
      return { ...e, sets };
    });
  }

  function setSetType(exId: string, setId: string, type: SetType) {
    updateExercise(exId, (e) => markPRs({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, type } : s)) }));
  }

  function setSetRpe(exId: string, setId: string, rpe: number | null) {
    updateExercise(exId, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, rpe } : s)) }));
  }

  // Tap the Previous value to copy it into the set
  function copyPrevious(exId: string, setId: string, prev?: PreviousSet) {
    if (!prev || prev.reps == null) return;
    haptics.selection();
    updateExercise(exId, (e) => ({
      ...e,
      sets: e.sets.map((s) =>
        s.id === setId && !s.done
          ? { ...s, weight: prev.weight != null ? String(prev.weight) : '', reps: String(prev.reps) }
          : s,
      ),
    }));
  }

  function editSet(exId: string, setId: string, field: 'weight' | 'reps', value: string) {
    updateExercise(exId, (ex) => ({
      ...ex,
      sets: ex.sets.map((s) => (s.id === setId ? { ...s, [field]: value } : s)),
    }));
  }

  function toggleSet(ex: LoggedExercise, setIndex: number) {
    const set = ex.sets[setIndex];

    // Unticking: recalculate PRs without this set
    if (set.done) {
      updateExercise(ex.id, (e) =>
        markPRs({ ...e, sets: e.sets.map((s) => (s.id === set.id ? { ...s, done: false } : s)) }),
      );
      return;
    }

    // Empty boxes use last session's numbers, like Hevy
    const prev = ex.previous[setIndex];
    const weightText = set.weight !== '' ? set.weight : prev?.weight != null ? String(prev.weight) : '';
    const repsText = set.reps !== '' ? set.reps : prev?.reps != null ? String(prev.reps) : '';
    const reps = parseNumber(repsText);

    if (!reps || reps <= 0) {
      Alert.alert('Add your reps', 'Enter how many reps you did before ticking the set.');
      return;
    }

    const updated = markPRs({
      ...ex,
      sets: ex.sets.map((s) =>
        s.id === set.id ? { ...s, weight: weightText, reps: String(Math.round(reps)), done: true } : s,
      ),
    });
    updateExercise(ex.id, () => updated);

    const tickedSet = updated.sets[setIndex];
    const weight = parseNumber(tickedSet.weight);

    if (tickedSet.prTypes.length > 0 && weight) {
      const values = recordValues(weight, Math.round(reps));
      setCelebration({
        id: newId(),
        exercise: ex.name,
        lines: tickedSet.prTypes.map((type) => `${RECORD_LABELS[type]} · ${formatKg(values[type])}`),
      });
      haptics.notify(haptics.NotifyType.Success);
    } else {
      haptics.impact(haptics.ImpactStyle.Light);
    }

    if (ex.restSeconds > 0) {
      const endsAt = Date.now() + ex.restSeconds * 1000;
      setRest({ endsAt, total: ex.restSeconds, exerciseName: ex.name });
      scheduleRestDone(endsAt, ex.name);
    }
  }

  // ---------- Rest timer ----------

  function adjustRest(seconds: number) {
    if (!rest) return;
    const next = { ...rest, endsAt: rest.endsAt + seconds * 1000, total: Math.max(1, rest.total + seconds) };
    setRest(next);
    scheduleRestDone(next.endsAt, next.exerciseName);
  }

  function skipRest() {
    setRest(null);
    cancelRestDone();
  }

  // ---------- Leaving and saving ----------

  async function discard() {
    finished.current = true;
    await clearDraft(userId);
    await clearWorkoutNotifications();
    onDiscard();
  }

  async function minimize() {
    await saveDraft(userId, buildDraft());
    onMinimize();
  }

  function confirmCancel() {
    if (exercises.length === 0) {
      discard();
      return;
    }
    Alert.alert(
      'Leave workout?',
      'Minimise keeps your workout going so you can come back to it. Discard deletes everything you logged.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Minimise', onPress: minimize },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Discard workout?', 'Everything you logged in this workout will be lost.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Discard', style: 'destructive', onPress: discard },
            ]),
        },
      ],
    );
  }

  function handleBack() {
    if (setSheet) setSetSheet(null);
    else if (exerciseSheet) setExerciseSheet(null);
    else if (infoFor) setInfoFor(null);
    else if (restEditingId) setRestEditingId(null);
    else if (screen === 'log') confirmCancel();
    else {
      setReplaceFor(null);
      setScreen('log');
    }
  }

  function startFinish() {
    if (doneSets.length === 0) {
      Alert.alert('Nothing to save yet', 'Tick off at least one set first.');
      return;
    }
    setSaveError(null);
    setScreen('finish');
  }

  async function saveWorkout() {
    if (visibility === 'group' && !groupId) {
      setSaveError('Choose which group to share this workout with.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    const payload = {
      title: title.trim(),
      visibility,
      group_id: visibility === 'group' ? groupId : null,
      started_at: startedAt.toISOString(),
      ended_at: new Date().toISOString(),
      notes: workoutNotes.trim() || null,
      exercises: exercises
        .map((ex) => ({
          name: ex.name,
          rest_seconds: ex.restSeconds,
          notes: ex.exerciseNotes?.trim() || null,
          sets: ex.sets
            .filter((s) => s.done)
            .map((s) => ({
              weight: parseNumber(s.weight),
              reps: Math.round(parseNumber(s.reps) ?? 0),
              type: setTypeOf(s),
              rpe: s.rpe ?? null,
            })),
        }))
        .filter((ex) => ex.sets.length > 0),
    };

    const { error } = await supabase.rpc('save_workout', { payload });
    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    finished.current = true;
    await clearDraft(userId);
    await clearWorkoutNotifications();
    onSaved({ prCount, title: payload.title || 'Workout' });
  }

  // ---------- Render ----------

  const restLeft = rest ? Math.max(0, (rest.endsAt - now) / 1000) : 0;

  // This session vs your last session, per exercise (best estimated 1RM, warm-ups ignored)
  const comparisons = exercises
    .map((ex) => {
      const done = ex.sets
        .filter((s) => s.done)
        .map((s) => ({ weight: parseNumber(s.weight), reps: parseNumber(s.reps), type: setTypeOf(s) }));
      const now1 = bestE1rm(done);
      const before = bestE1rm(ex.previous.map((p) => ({ weight: p.weight, reps: p.reps, type: p.set_type })));
      if (!now1 || !before) return null;
      return { name: ex.name, diff: Math.round((now1 - before) * 10) / 10 };
    })
    .filter((x): x is { name: string; diff: number } => x !== null);
  const improved = comparisons.filter((x) => x.diff > 0).length;

  const sheetExercise = exercises.find((e) => e.id === exerciseSheet);
  const sheetSetEx = setSheet ? exercises.find((e) => e.id === setSheet.exId) : undefined;
  const sheetSet = sheetSetEx?.sets.find((s) => s.id === setSheet?.setId);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={handleBack}>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
          {screen === 'pick' ? (
            <ExercisePicker
              title={replaceFor ? 'Replace exercise' : 'Add exercise'}
              addedNames={exercises.map((ex) => ex.name)}
              onPick={({ name, gif }) => (replaceFor ? replaceExercise(replaceFor, name, gif) : addExercise(name, gif))}
              onInfo={setInfoFor}
              onCancel={() => {
                setReplaceFor(null);
                setScreen('log');
              }}
            />
          ) : (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              {/* Header */}
              <View style={[styles.header, { borderBottomColor: c.border }]}>
                <Pressable onPress={handleBack} hitSlop={10}>
                  <Text style={[styles.headerSide, { color: c.subtext }]}>
                    {screen === 'finish' ? 'Back' : 'Leave'}
                  </Text>
                </Pressable>
                <View style={styles.headerCenter}>
                  <Text style={[styles.headerTimer, { color: c.text }]}>{formatClock(elapsed)}</Text>
                  <Text style={[styles.headerStats, { color: c.subtext }]}>
                    {doneSets.length} sets · {formatKg(totalVolume)}
                  </Text>
                </View>
                {screen === 'finish' ? (
                  <View style={styles.headerSpacer} />
                ) : (
                  <Pressable onPress={startFinish} style={[styles.finishButton, { backgroundColor: c.accent }]}>
                    <Text style={styles.finishText}>Finish</Text>
                  </Pressable>
                )}
              </View>

              {screen === 'finish' ? (
                /* ---------- Finish screen ---------- */
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                  <Text style={[styles.finishHeading, { color: c.text }]}>Nice work 💪</Text>

                  <View style={[styles.summaryRow, { backgroundColor: c.card }]}>
                    <Summary label="Time" value={formatClock(elapsed)} colors={c} />
                    <Summary label="Sets" value={String(doneSets.length)} colors={c} />
                    <Summary label="Volume" value={formatKg(totalVolume)} colors={c} />
                    <Summary label="PRs" value={prCount > 0 ? `🏆 ${prCount}` : '0'} colors={c} />
                  </View>

                  {comparisons.length > 0 && (
                    <View style={[styles.compareCard, { backgroundColor: c.card }]}>
                      <Text style={[styles.compareTitle, { color: c.text }]}>
                        Stronger on {improved} of {comparisons.length} exercise{comparisons.length === 1 ? '' : 's'} vs last time
                      </Text>
                      {comparisons.slice(0, 8).map((cmp) => (
                        <View key={cmp.name} style={styles.compareRow}>
                          <Text style={[styles.compareName, { color: c.text }]} numberOfLines={1}>
                            {cmp.name}
                          </Text>
                          <Text
                            style={{
                              color: cmp.diff > 0 ? c.success : cmp.diff < 0 ? c.error : c.subtext,
                              fontWeight: '800',
                            }}>
                            {cmp.diff > 0 ? '▲ +' : cmp.diff < 0 ? '▼ ' : '= '}
                            {cmp.diff === 0 ? 'same' : formatKg(cmp.diff)}
                          </Text>
                        </View>
                      ))}
                      <Text style={[styles.hint, { color: c.subtext, textAlign: 'left' }]}>
                        Compared by best estimated 1RM per exercise. Warm-ups don&apos;t count.
                      </Text>
                    </View>
                  )}

                  <Text style={[styles.label, { color: c.subtext }]}>Title</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: c.inputBg, color: c.text }]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Workout title"
                    placeholderTextColor={c.subtext}
                  />

                  <Text style={[styles.label, { color: c.subtext }]}>Notes</Text>
                  <TextInput
                    style={[styles.textInput, styles.notesInput, { backgroundColor: c.inputBg, color: c.text }]}
                    value={workoutNotes}
                    onChangeText={setWorkoutNotes}
                    placeholder="How did it feel? (optional)"
                    placeholderTextColor={c.subtext}
                    multiline
                    maxLength={2000}
                  />

                  <Text style={[styles.label, { color: c.subtext }]}>Who can see this?</Text>
                  <View style={styles.visibilityRow}>
                    <VisibilityOption
                      label="🔒 Only me"
                      selected={visibility === 'private'}
                      onPress={() => setVisibility('private')}
                      colors={c}
                    />
                    <VisibilityOption
                      label="👥 Group"
                      selected={visibility === 'group'}
                      disabled={groups !== null && groups.length === 0}
                      onPress={() => setVisibility('group')}
                      colors={c}
                    />
                    <VisibilityOption
                      label="🌍 Public"
                      selected={visibility === 'public'}
                      onPress={() => setVisibility('public')}
                      colors={c}
                    />
                  </View>

                  {groups !== null && groups.length === 0 && (
                    <Text style={[styles.hint, { color: c.subtext }]}>
                      Join or create a group in the Groups tab to share workouts with friends.
                    </Text>
                  )}

                  {visibility === 'group' && groups && groups.length > 0 && (
                    <View style={styles.groupChips}>
                      {groups.map((g) => {
                        const selected = g.id === groupId;
                        return (
                          <Pressable
                            key={g.id}
                            onPress={() => setGroupId(g.id)}
                            style={[
                              styles.groupChip,
                              {
                                backgroundColor: selected ? c.accent : c.inputBg,
                              },
                            ]}>
                            <Text style={{ color: selected ? '#FFFFFF' : c.text, fontWeight: '700' }}>{g.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {saveError && <Text style={[styles.errorText, { color: c.error }]}>{saveError}</Text>}

                  <Pressable
                    onPress={saveWorkout}
                    disabled={saving}
                    style={({ pressed }) => [
                      styles.saveButton,
                      { backgroundColor: c.accent, opacity: pressed || saving ? 0.7 : 1 },
                    ]}>
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveText}>Save workout</Text>
                    )}
                  </Pressable>
                </ScrollView>
              ) : (
                /* ---------- Logging screen ---------- */
                <ScrollView
                  contentContainerStyle={[styles.content, rest && styles.contentWithRest]}
                  keyboardShouldPersistTaps="handled">
                  {exercises.length === 0 && (
                    <Text style={[styles.emptyHint, { color: c.subtext }]}>
                      Add your first exercise to get started.
                    </Text>
                  )}

                  {exercises.map((ex) => (
                    <View key={ex.id} style={[styles.exerciseCard, { backgroundColor: c.card }]}>
                      <View style={styles.exerciseHeader}>
                        <ExerciseThumb gif={ex.gif} size={52} />
                        <Text style={[styles.exerciseName, { color: c.accent }]} numberOfLines={2}>
                          {ex.name}
                        </Text>
                        {ex.loading && <ActivityIndicator size="small" />}
                        <Pressable
                          onPress={() => setInfoFor(ex.name)}
                          hitSlop={10}
                          style={[styles.infoButton, { borderColor: c.border }]}>
                          <Text style={[styles.infoText, { color: c.subtext }]}>i</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setExerciseSheet(ex.id)}
                          hitSlop={10}
                          accessibilityLabel={`Options for ${ex.name}`}>
                          <Text style={[styles.removeText, { color: c.subtext }]}>•••</Text>
                        </Pressable>
                      </View>

                      {(() => {
                        const rec = coachFor(ex);
                        if (!rec) return null;
                        return (
                          <View style={[styles.coachBox, { backgroundColor: c.accentSoft }]}>
                            <View style={styles.flex}>
                              <Text style={[styles.coachHeadline, { color: c.text }]}>🧠 Coach: {rec.headline}</Text>
                              <Text style={[styles.coachReason, { color: c.subtext }]} numberOfLines={3}>
                                {rec.reason}
                              </Text>
                            </View>
                            <View style={styles.coachButtons}>
                              <Pressable
                                onPress={() => applyCoach(ex, rec)}
                                style={[styles.coachUse, { backgroundColor: c.accent }]}
                                accessibilityLabel="Use the coach's numbers">
                                <Text style={styles.coachUseText}>Use</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => setCoachHidden((prev) => new Set(prev).add(ex.id))}
                                hitSlop={8}
                                accessibilityLabel="Hide coach suggestion">
                                <Text style={{ color: c.subtext, fontSize: 16 }}>✕</Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })()}

                      {(notesOpen.has(ex.id) || !!ex.exerciseNotes) && (
                        <TextInput
                          style={[styles.exerciseNotes, { backgroundColor: c.inputBg, color: c.text }]}
                          value={ex.exerciseNotes ?? ''}
                          onChangeText={(t) => updateExercise(ex.id, (e) => ({ ...e, exerciseNotes: t }))}
                          placeholder="Note for this exercise, e.g. seat 4, felt easy"
                          placeholderTextColor={c.subtext}
                          maxLength={500}
                          multiline
                        />
                      )}

                      {(ex.target || ex.notes) && (
                        <View style={styles.targetBox}>
                          {ex.target && (
                            <Text style={[styles.targetText, { color: c.text }]}>
                              🎯 Target: {ex.target.sets} × {formatRepRange(ex.target.repMin, ex.target.repMax)}
                            </Text>
                          )}
                          {ex.notes ? (
                            <Text style={[styles.targetNotes, { color: c.subtext }]}>📝 {ex.notes}</Text>
                          ) : null}
                        </View>
                      )}

                      <Pressable
                        onPress={() => setRestEditingId(ex.id)}
                        style={[styles.restChip, { backgroundColor: c.inputBg }]}>
                        <Text style={[styles.restChipText, { color: c.subtext }]}>
                          ⏱ Rest {formatRest(ex.restSeconds)}
                        </Text>
                      </Pressable>

                      <View style={styles.setHeaderRow}>
                        <Text style={[styles.colSet, styles.colHeader, { color: c.subtext }]}>SET</Text>
                        <Text style={[styles.colPrev, styles.colHeader, { color: c.subtext }]}>PREVIOUS</Text>
                        <Text style={[styles.colInput, styles.colHeader, { color: c.subtext }]}>KG</Text>
                        <Text style={[styles.colInput, styles.colHeader, { color: c.subtext }]}>REPS</Text>
                        <View style={styles.colCheck} />
                      </View>

                      {ex.sets.map((set, i) => {
                        const prev = ex.previous[i];
                        const type = setTypeOf(set);
                        const short = SET_TYPES.find((t) => t.type === type)?.short ?? '';
                        // working sets are numbered 1, 2, 3…; other types show their letter
                        const workingNumber = ex.sets.slice(0, i + 1).filter((s) => setTypeOf(s) === 'normal').length;
                        return (
                          <ReanimatedSwipeable
                            key={set.id}
                            friction={2}
                            rightThreshold={40}
                            overshootRight={false}
                            renderRightActions={() => (
                              <Pressable
                                onPress={() => deleteSet(ex.id, set.id)}
                                style={[styles.deleteAction, { backgroundColor: c.error }]}>
                                <Text style={styles.deleteText}>Delete</Text>
                              </Pressable>
                            )}>
                            <View
                              style={[styles.setRow, { backgroundColor: set.done ? c.successSoft : c.card }]}>
                              <Pressable
                                onPress={() => setSetSheet({ exId: ex.id, setId: set.id })}
                                hitSlop={6}
                                accessibilityLabel={`Set ${i + 1} options`}
                                style={styles.colSet}>
                                <Text
                                  style={[
                                    styles.setNumber,
                                    {
                                      color: set.prTypes.length
                                        ? c.gold
                                        : type === 'warmup'
                                          ? c.gold
                                          : type !== 'normal'
                                            ? c.accent
                                            : c.text,
                                    },
                                  ]}>
                                  {set.prTypes.length ? '🏆' : short || workingNumber}
                                </Text>
                                {set.rpe != null && (
                                  <Text style={[styles.rpeTag, { color: c.subtext }]}>@{set.rpe}</Text>
                                )}
                              </Pressable>
                              <Pressable
                                onPress={() => copyPrevious(ex.id, set.id, prev)}
                                disabled={set.done || !prev}
                                style={styles.colPrev}
                                accessibilityLabel="Copy previous values">
                                <Text style={[styles.prevText, { color: c.subtext, textAlign: 'center' }]}>
                                  {formatPrevious(prev)}
                                </Text>
                              </Pressable>
                              <TextInput
                                style={[
                                  styles.colInput,
                                  styles.setInput,
                                  { backgroundColor: c.inputBg, color: c.text },
                                ]}
                                value={set.weight}
                                onChangeText={(v) => editSet(ex.id, set.id, 'weight', v)}
                                placeholder={prev?.weight != null ? String(prev.weight) : '–'}
                                placeholderTextColor={c.subtext}
                                keyboardType="decimal-pad"
                                editable={!set.done}
                              />
                              <TextInput
                                style={[
                                  styles.colInput,
                                  styles.setInput,
                                  { backgroundColor: c.inputBg, color: c.text },
                                ]}
                                value={set.reps}
                                onChangeText={(v) => editSet(ex.id, set.id, 'reps', v)}
                                placeholder={prev?.reps != null ? String(prev.reps) : '–'}
                                placeholderTextColor={c.subtext}
                                keyboardType="number-pad"
                                editable={!set.done}
                              />
                              <Pressable
                                onPress={() => toggleSet(ex, i)}
                                style={[
                                  styles.colCheck,
                                  styles.checkButton,
                                  { backgroundColor: set.done ? c.success : c.inputBg },
                                ]}>
                                <Text style={[styles.checkText, { color: set.done ? '#FFFFFF' : c.subtext }]}>
                                  ✓
                                </Text>
                              </Pressable>
                            </View>
                          </ReanimatedSwipeable>
                        );
                      })}

                      <Pressable
                        onPress={() => addSet(ex.id)}
                        style={[styles.addSetButton, { backgroundColor: c.inputBg }]}>
                        <Text style={[styles.addSetText, { color: c.text }]}>+ Add set</Text>
                      </Pressable>
                    </View>
                  ))}

                  <Pressable
                    onPress={() => setScreen('pick')}
                    style={[styles.addExerciseButton, { backgroundColor: c.accentSoft }]}>
                    <Text style={[styles.addExerciseText, { color: c.accent }]}>+ Add exercise</Text>
                  </Pressable>

                  {exercises.length > 0 && (
                    <Text style={[styles.tip, { color: c.subtext }]}>
                      Tips: tap a set number for warm-up, drop set or RPE. Tap Previous to copy it. Swipe left to delete.
                    </Text>
                  )}
                </ScrollView>
              )}

              {undo && screen === 'log' && (
                <View style={[styles.undoBar, { backgroundColor: c.text, bottom: rest ? 120 : 20 }]}>
                  <Text style={{ color: c.background, fontWeight: '600' }}>Set deleted</Text>
                  <Pressable onPress={undoDelete} hitSlop={10}>
                    <Text style={{ color: c.accent, fontWeight: '900' }}>UNDO</Text>
                  </Pressable>
                </View>
              )}

              {/* Rest timer bar */}
              {rest && screen === 'log' && (
                <View style={[styles.restBar, { backgroundColor: c.card, borderTopColor: c.border }]}>
                  <View style={[styles.restProgressTrack, { backgroundColor: c.inputBg }]}>
                    <View
                      style={[
                        styles.restProgressFill,
                        {
                          backgroundColor: c.accent,
                          width: `${Math.min(100, (restLeft / rest.total) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.restControls}>
                    <Pressable
                      onPress={() => adjustRest(-15)}
                      style={[styles.restButton, { backgroundColor: c.inputBg }]}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>−15</Text>
                    </Pressable>
                    <View style={styles.restCenter}>
                      <Text style={[styles.restLabel, { color: c.subtext }]}>Rest</Text>
                      <Text style={[styles.restTime, { color: c.text }]}>{formatClock(restLeft)}</Text>
                    </View>
                    <Pressable
                      onPress={() => adjustRest(15)}
                      style={[styles.restButton, { backgroundColor: c.inputBg }]}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>+15</Text>
                    </Pressable>
                    <Pressable
                      onPress={skipRest}
                      style={[styles.restButton, { backgroundColor: c.accent }]}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Skip</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </KeyboardAvoidingView>
          )}

          {restEditingId && (
            <RestPicker
              exerciseName={exercises.find((e) => e.id === restEditingId)?.name ?? ''}
              value={exercises.find((e) => e.id === restEditingId)?.restSeconds ?? DEFAULT_REST}
              onSave={(seconds) => setExerciseRest(restEditingId, seconds)}
              onClose={() => setRestEditingId(null)}
            />
          )}

          {infoFor && <ExerciseInfo name={infoFor} onClose={() => setInfoFor(null)} />}

          {sheetSetEx && sheetSet && setSheet && (
            <ActionSheet
              title={`${sheetSetEx.name} · set ${sheetSetEx.sets.findIndex((s) => s.id === sheetSet.id) + 1}`}
              onClose={() => setSetSheet(null)}
              actions={[
                ...SET_TYPES.map<SheetAction>((t) => ({
                  label: `${t.short ? t.short + ' · ' : ''}${t.label}`,
                  detail: t.detail,
                  selected: setTypeOf(sheetSet) === t.type,
                  onPress: () => setSetType(setSheet.exId, setSheet.setId, t.type),
                })),
                { label: 'Duplicate set', onPress: () => duplicateSet(setSheet.exId, setSheet.setId) },
                { label: 'Delete set', destructive: true, onPress: () => deleteSet(setSheet.exId, setSheet.setId) },
              ]}>
              <Text style={[styles.rpeLabel, { color: c.subtext }]}>
                Effort: RPE, or reps left in reserve (RIR). 10 = nothing left
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rpeRow}>
                {[null, ...RPE_VALUES].map((v) => {
                  const selected = (sheetSet.rpe ?? null) === v;
                  return (
                    <Pressable
                      key={String(v)}
                      onPress={() => setSetRpe(setSheet.exId, setSheet.setId, v)}
                      style={[styles.rpeChip, { backgroundColor: selected ? c.accent : c.inputBg }]}>
                      <Text style={{ color: selected ? '#FFFFFF' : c.text, fontWeight: '700' }}>{v ?? '–'}</Text>
                      {v != null && (
                        <Text style={{ color: selected ? '#FFFFFF' : c.subtext, fontSize: 10, fontWeight: '600' }}>
                          {Number.isInteger(10 - v) ? `${10 - v}` : `${Math.floor(10 - v)}–${Math.ceil(10 - v)}`} RIR
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </ActionSheet>
          )}

          {sheetExercise && (
            <ActionSheet
              title={sheetExercise.name}
              onClose={() => setExerciseSheet(null)}
              actions={[
                {
                  label: 'Move up',
                  disabled: exercises[0]?.id === sheetExercise.id,
                  onPress: () => moveExercise(sheetExercise.id, -1),
                },
                {
                  label: 'Move down',
                  disabled: exercises[exercises.length - 1]?.id === sheetExercise.id,
                  onPress: () => moveExercise(sheetExercise.id, 1),
                },
                {
                  label: 'Replace exercise',
                  detail: 'Keeps your sets',
                  onPress: () => {
                    setReplaceFor(sheetExercise.id);
                    setScreen('pick');
                  },
                },
                {
                  label: notesOpen.has(sheetExercise.id) || sheetExercise.exerciseNotes ? 'Hide note' : 'Add note',
                  onPress: () => toggleNotes(sheetExercise.id),
                },
                ...(coachHidden.has(sheetExercise.id)
                  ? [{ label: 'Show coach suggestion', onPress: () => setCoachHidden((prev) => {
                      const next = new Set(prev);
                      next.delete(sheetExercise.id);
                      return next;
                    }) }]
                  : []),
                { label: 'Remove exercise', destructive: true, onPress: () => removeExercise(sheetExercise) },
              ]}
            />
          )}

          {celebration && (
            <PRCelebration celebration={celebration} colors={c} onDone={() => setCelebration(null)} />
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------- Small pieces ----------

function Summary({ label, value, colors }: { label: string; value: string; colors: RepzyColors }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.subtext }]}>{label}</Text>
    </View>
  );
}

function VisibilityOption({
  label,
  selected,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress?: () => void;
  colors: RepzyColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.visibilityOption,
        {
          backgroundColor: selected ? colors.accentSoft : colors.inputBg,
          borderColor: selected ? colors.accent : 'transparent',
          opacity: disabled ? 0.45 : 1,
        },
      ]}>
      <Text style={{ color: selected ? colors.accent : colors.text, fontWeight: '600', fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { fontSize: 16, width: 64 },
  headerCenter: { alignItems: 'center' },
  headerTimer: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  headerStats: { fontSize: 12, marginTop: 2 },
  headerSpacer: { width: 64 },
  finishButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  finishText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  content: { padding: 16, gap: 14, paddingBottom: 40 },
  contentWithRest: { paddingBottom: 160 },
  emptyHint: { textAlign: 'center', marginVertical: 24, fontSize: 15 },

  exerciseCard: { borderRadius: 16, padding: 14, gap: 8 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exerciseThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseName: { fontSize: 17, fontWeight: '800', flex: 1 },
  removeText: { fontSize: 18, paddingHorizontal: 4 },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { fontSize: 14, fontWeight: '800', fontStyle: 'italic' },
  coachBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 10 },
  coachHeadline: { fontSize: 14, fontWeight: '800' },
  coachReason: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  coachButtons: { alignItems: 'center', gap: 8 },
  coachUse: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  coachUseText: { color: '#FFFFFF', fontWeight: '800' },
  exerciseNotes: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  rpeTag: { fontSize: 10, fontWeight: '700' },
  rpeLabel: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  rpeRow: { gap: 8, paddingVertical: 6, paddingHorizontal: 2 },
  rpeChip: { minWidth: 52, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  undoBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  compareCard: { borderRadius: 16, padding: 14, gap: 6 },
  compareTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  compareRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  compareName: { flex: 1, fontSize: 14 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  targetBox: { gap: 2 },
  targetText: { fontSize: 13, fontWeight: '700' },
  targetNotes: { fontSize: 13 },
  restChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  restChipText: { fontSize: 12, fontWeight: '600' },

  setHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  colHeader: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  colSet: { width: 32, alignItems: 'center' },
  colPrev: { flex: 1.3, textAlign: 'center' },
  colInput: { flex: 1, textAlign: 'center' },
  colCheck: { width: 40 },

  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderRadius: 10 },
  setNumber: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  prevText: { fontSize: 13 },
  setInput: { borderRadius: 8, paddingVertical: 8, fontSize: 16, fontWeight: '600' },
  checkButton: { height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 18, fontWeight: '800' },

  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderRadius: 10,
    marginLeft: 8,
  },
  deleteText: { color: '#FFFFFF', fontWeight: '800' },

  addSetButton: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  addSetText: { fontWeight: '700' },

  addExerciseButton: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  addExerciseText: { fontSize: 16, fontWeight: '800' },
  textInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  tip: { fontSize: 12, textAlign: 'center', marginTop: 4 },

  restBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 10,
  },
  restProgressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  restProgressFill: { height: 6, borderRadius: 3 },
  restControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  restCenter: { flex: 1, alignItems: 'center' },
  restLabel: { fontSize: 12 },
  restTime: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },

  celebrationWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 30,
  },
  celebrationCard: {
    borderWidth: 2,
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 4,
    minWidth: 260,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  celebrationTrophy: { fontSize: 56 },
  celebrationTitle: { fontSize: 26, fontWeight: '900' },
  celebrationExercise: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  celebrationLine: { fontSize: 14, fontWeight: '600' },

  finishHeading: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  summaryRow: { flexDirection: 'row', borderRadius: 16, paddingVertical: 16 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 17, fontWeight: '800' },
  summaryLabel: { fontSize: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: -6 },
  visibilityRow: { flexDirection: 'row', gap: 8 },
  visibilityOption: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  errorText: { textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center' },
  groupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  saveButton: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
