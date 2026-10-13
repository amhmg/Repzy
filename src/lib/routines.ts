import { supabase } from '@/lib/supabase';

export type RoutineExercise = {
  exercise_name: string;
  target_sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_seconds: number | null;
  notes: string | null;
};

export type Routine = {
  id: string;
  name: string;
  notes: string | null;
  updated_at: string;
  exercises: RoutineExercise[];
};

type RoutineRow = Omit<Routine, 'exercises'> & {
  routine_exercises: (RoutineExercise & { position: number })[];
};

export async function fetchRoutines(): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select(
      'id, name, notes, updated_at, routine_exercises(position, exercise_name, target_sets, rep_min, rep_max, rest_seconds, notes)',
    )
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RoutineRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    notes: r.notes,
    updated_at: r.updated_at,
    exercises: [...(r.routine_exercises ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(({ position: _position, ...rest }) => rest),
  }));
}

export async function saveRoutine(routine: {
  id?: string;
  name: string;
  notes: string | null;
  exercises: RoutineExercise[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_routine', {
    payload: {
      id: routine.id ?? null,
      name: routine.name,
      notes: routine.notes,
      exercises: routine.exercises.map((e) => ({
        name: e.exercise_name,
        target_sets: e.target_sets,
        rep_min: e.rep_min,
        rep_max: e.rep_max,
        rest_seconds: e.rest_seconds,
        notes: e.notes,
      })),
    },
  });
  if (error) throw error;
  return data as string;
}

export async function deleteRoutine(id: string) {
  const { error } = await supabase.from('routines').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicateRoutine(routine: Routine) {
  const base = routine.name.length > 53 ? routine.name.slice(0, 53) : routine.name;
  return saveRoutine({ name: `${base} (copy)`, notes: routine.notes, exercises: routine.exercises });
}

export function routineSetCount(routine: Routine) {
  return routine.exercises.reduce((n, e) => n + e.target_sets, 0);
}

export function formatRepRange(min: number | null, max: number | null) {
  if (min && max) return min === max ? `${min}` : `${min}–${max}`;
  if (min) return `${min}+`;
  if (max) return `≤${max}`;
  return '';
}
