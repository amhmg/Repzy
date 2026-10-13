import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import ExerciseInfo from '@/components/exercise-info';
import ExercisePicker from '@/components/exercise-picker';
import ExerciseThumb from '@/components/exercise-thumb';
import RestPicker, { formatRest } from '@/components/rest-picker';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { findLibraryExercise } from '@/lib/exercise-library';
import { Routine, RoutineExercise, saveRoutine } from '@/lib/routines';
import { useSettings } from '@/lib/settings';
import { newId } from '@/lib/workout';

type EditableExercise = RoutineExercise & { key: string; repMinText: string; repMaxText: string };

function toEditable(e: RoutineExercise): EditableExercise {
  return {
    ...e,
    key: newId(),
    repMinText: e.rep_min ? String(e.rep_min) : '',
    repMaxText: e.rep_max ? String(e.rep_max) : '',
  };
}

function parseReps(text: string): number | null {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : null;
}

export default function RoutineEditor({
  routine,
  onClose,
  onSaved,
}: {
  routine?: Routine; // editing an existing routine; omit to create a new one
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useRepzyColors();
  const { settings } = useSettings();

  const [name, setName] = useState(routine?.name ?? '');
  const [notes, setNotes] = useState(routine?.notes ?? '');
  const [exercises, setExercises] = useState<EditableExercise[]>(() => (routine?.exercises ?? []).map(toEditable));
  const [picking, setPicking] = useState(false);
  const [restFor, setRestFor] = useState<string | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function change(key: string, patch: Partial<EditableExercise>) {
    setDirty(true);
    setExercises((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  function move(index: number, by: number) {
    const to = index + by;
    if (to < 0 || to >= exercises.length) return;
    setDirty(true);
    setExercises((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function remove(key: string) {
    setDirty(true);
    setExercises((list) => list.filter((e) => e.key !== key));
  }

  function addExercise(exerciseName: string) {
    setPicking(false);
    setDirty(true);
    setExercises((list) => [
      ...list,
      toEditable({
        exercise_name: exerciseName,
        target_sets: 3,
        rep_min: 8,
        rep_max: 12,
        rest_seconds: null,
        notes: null,
      }),
    ]);
  }

  function close() {
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'Your changes to this routine haven’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  }

  async function save() {
    setError(null);
    const cleanName = name.trim();
    if (!cleanName) return setError('Give your routine a name, like “Push Day”.');
    if (exercises.length === 0) return setError('Add at least one exercise.');

    const prepared: RoutineExercise[] = [];
    for (const e of exercises) {
      const min = parseReps(e.repMinText);
      const max = parseReps(e.repMaxText);
      if (min && max && min > max) {
        return setError(`The rep range for ${e.exercise_name} is the wrong way round (${min}–${max}).`);
      }
      prepared.push({
        exercise_name: e.exercise_name,
        target_sets: e.target_sets,
        rep_min: min,
        rep_max: max,
        rest_seconds: e.rest_seconds,
        notes: e.notes?.trim() || null,
      });
    }

    setSaving(true);
    try {
      await saveRoutine({ id: routine?.id, name: cleanName, notes: notes.trim() || null, exercises: prepared });
      onSaved();
    } catch (e: any) {
      setError(
        String(e.message).includes('save_routine')
          ? 'Routines need the latest database update. Run the SQL from the update notes, then try again.'
          : (e.message ?? 'Could not save the routine'),
      );
      setSaving(false);
    }
  }

  const restEditing = exercises.find((e) => e.key === restFor);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => (picking ? setPicking(false) : close())}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
        {picking ? (
          <ExercisePicker
            addedNames={exercises.map((e) => e.exercise_name)}
            onPick={({ name: picked }) => addExercise(picked)}
            onInfo={setInfoFor}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.header, { borderBottomColor: c.border }]}>
              <Pressable onPress={close} hitSlop={10} style={styles.headerSide}>
                <Text style={{ color: c.subtext, fontSize: 16 }}>Cancel</Text>
              </Pressable>
              <Text style={[styles.headerTitle, { color: c.text }]}>{routine ? 'Edit routine' : 'New routine'}</Text>
              <Pressable onPress={save} disabled={saving} hitSlop={10} style={[styles.headerSide, styles.right]}>
                {saving ? <ActivityIndicator /> : <Text style={[styles.saveText, { color: c.accent }]}>Save</Text>}
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <TextInput
                style={[styles.nameInput, { color: c.text, borderBottomColor: c.border }]}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setDirty(true);
                }}
                placeholder="Routine name, e.g. Push Day"
                placeholderTextColor={c.subtext}
                maxLength={60}
              />
              <TextInput
                style={[styles.notesInput, { backgroundColor: c.inputBg, color: c.text }]}
                value={notes}
                onChangeText={(t) => {
                  setNotes(t);
                  setDirty(true);
                }}
                placeholder="Notes (optional)"
                placeholderTextColor={c.subtext}
                multiline
                maxLength={1000}
              />

              {exercises.length === 0 && (
                <Text style={[styles.empty, { color: c.subtext }]}>
                  Add the exercises for this routine. You can set target sets, a rep range and rest time for each.
                </Text>
              )}

              {exercises.map((e, i) => (
                <ExerciseCard
                  key={e.key}
                  exercise={e}
                  index={i}
                  count={exercises.length}
                  colors={c}
                  defaultRest={settings.defaultRestSeconds}
                  onChange={(patch) => change(e.key, patch)}
                  onMove={(by) => move(i, by)}
                  onRemove={() => remove(e.key)}
                  onRest={() => setRestFor(e.key)}
                  onInfo={() => setInfoFor(e.exercise_name)}
                />
              ))}

              <Pressable onPress={() => setPicking(true)} style={[styles.addButton, { backgroundColor: c.accentSoft }]}>
                <Text style={[styles.addText, { color: c.accent }]}>+ Add exercise</Text>
              </Pressable>

              {error && <Text style={[styles.error, { color: c.error }]}>{error}</Text>}
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {restEditing && (
          <RestPicker
            exerciseName={restEditing.exercise_name}
            value={restEditing.rest_seconds ?? settings.defaultRestSeconds}
            onSave={(seconds) => {
              change(restEditing.key, { rest_seconds: seconds });
              setRestFor(null);
            }}
            onClose={() => setRestFor(null)}
          />
        )}
        {infoFor && <ExerciseInfo name={infoFor} onClose={() => setInfoFor(null)} />}
      </SafeAreaView>
    </Modal>
  );
}

function ExerciseCard({
  exercise: e,
  index,
  count,
  colors: c,
  defaultRest,
  onChange,
  onMove,
  onRemove,
  onRest,
  onInfo,
}: {
  exercise: EditableExercise;
  index: number;
  count: number;
  colors: RepzyColors;
  defaultRest: number;
  onChange: (patch: Partial<EditableExercise>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
  onRest: () => void;
  onInfo: () => void;
}) {
  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <View style={styles.cardHeader}>
        <ExerciseThumb gif={findLibraryExercise(e.exercise_name)?.gif ?? null} size={44} />
        <Pressable onPress={onInfo} style={styles.flex}>
          <Text style={[styles.exerciseName, { color: c.accent }]} numberOfLines={2}>
            {e.exercise_name}
          </Text>
        </Pressable>
        <IconButton label="↑" disabled={index === 0} onPress={() => onMove(-1)} colors={c} a11y="Move up" />
        <IconButton label="↓" disabled={index === count - 1} onPress={() => onMove(1)} colors={c} a11y="Move down" />
        <IconButton label="✕" onPress={onRemove} colors={c} a11y="Remove exercise" />
      </View>

      <View style={styles.fields}>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: c.subtext }]}>Sets</Text>
          <View style={styles.stepper}>
            <IconButton
              label="−"
              disabled={e.target_sets <= 1}
              onPress={() => onChange({ target_sets: e.target_sets - 1 })}
              colors={c}
              a11y="Fewer sets"
            />
            <Text style={[styles.stepValue, { color: c.text }]}>{e.target_sets}</Text>
            <IconButton
              label="+"
              disabled={e.target_sets >= 20}
              onPress={() => onChange({ target_sets: e.target_sets + 1 })}
              colors={c}
              a11y="More sets"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: c.subtext }]}>Reps</Text>
          <View style={styles.repRow}>
            <TextInput
              style={[styles.repInput, { backgroundColor: c.inputBg, color: c.text }]}
              value={e.repMinText}
              onChangeText={(t) => onChange({ repMinText: t.replace(/[^0-9]/g, '') })}
              placeholder="min"
              placeholderTextColor={c.subtext}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={{ color: c.subtext }}>–</Text>
            <TextInput
              style={[styles.repInput, { backgroundColor: c.inputBg, color: c.text }]}
              value={e.repMaxText}
              onChangeText={(t) => onChange({ repMaxText: t.replace(/[^0-9]/g, '') })}
              placeholder="max"
              placeholderTextColor={c.subtext}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: c.subtext }]}>Rest</Text>
          <Pressable onPress={onRest} style={[styles.restChip, { backgroundColor: c.inputBg }]}>
            <Text style={{ color: c.text, fontWeight: '700' }}>
              ⏱ {formatRest(e.rest_seconds ?? defaultRest)}
              {e.rest_seconds == null ? '*' : ''}
            </Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        style={[styles.exerciseNotes, { backgroundColor: c.inputBg, color: c.text }]}
        value={e.notes ?? ''}
        onChangeText={(t) => onChange({ notes: t })}
        placeholder="Notes, e.g. seat height 4, pause at the bottom"
        placeholderTextColor={c.subtext}
        maxLength={500}
      />
      {e.rest_seconds == null && (
        <Text style={[styles.footnote, { color: c.subtext }]}>* uses your default rest time</Text>
      )}
    </View>
  );
}

function IconButton({
  label,
  onPress,
  disabled,
  colors: c,
  a11y,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors: RepzyColors;
  a11y: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={a11y}
      style={[styles.iconButton, { backgroundColor: c.inputBg, opacity: disabled ? 0.3 : 1 }]}>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }}>{label}</Text>
    </Pressable>
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
  headerSide: { width: 64 },
  right: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  saveText: { fontSize: 16, fontWeight: '800' },
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  nameInput: { fontSize: 24, fontWeight: '800', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  notesInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 48 },
  empty: { textAlign: 'center', fontSize: 15, lineHeight: 21, marginVertical: 12 },
  card: { borderRadius: 16, padding: 14, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exerciseName: { fontSize: 16, fontWeight: '800' },
  iconButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fields: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepValue: { fontSize: 18, fontWeight: '800', minWidth: 22, textAlign: 'center' },
  repRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  repInput: { width: 52, borderRadius: 10, paddingVertical: 8, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  restChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  exerciseNotes: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  footnote: { fontSize: 11 },
  addButton: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  addText: { fontSize: 16, fontWeight: '800' },
  error: { textAlign: 'center', fontSize: 14 },
});
