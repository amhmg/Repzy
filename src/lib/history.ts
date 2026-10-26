import { supabase } from '@/lib/supabase';
import { removeWorkoutPhoto } from '@/lib/workout-photo';
import { RecordType } from '@/lib/workout';

export type WorkoutSummary = {
  id: string;
  title: string | null;
  visibility: 'private' | 'group' | 'public';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  duration_minutes: number | null;
  exercise_count: number;
  set_count: number;
  volume: number;
  exercise_names: string[];
  pr_count: number;
  photo_url?: string | null;
};

export type HistorySet = {
  set_number: number;
  weight: number | null;
  reps: number;
  set_type?: string | null;
  rpe?: number | null;
};

export type WorkoutDetail = {
  id: string;
  title: string | null;
  visibility: 'private' | 'group' | 'public';
  started_at: string | null;
  created_at: string;
  duration_minutes: number | null;
  notes?: string | null;
  photo_url?: string | null;
  group_id?: string | null;
  ended_at?: string | null;
  exercises: {
    id: string;
    name: string;
    order_index: number;
    rest_seconds: number | null;
    notes?: string | null;
    sets: HistorySet[];
  }[];
};

export type ExerciseSession = {
  workout_id: string;
  t: string;
  title: string | null;
  sets: { weight: number | null; reps: number }[];
};

export type ExerciseRecord = {
  record_type: RecordType;
  value: number;
  weight: number | null;
  reps: number | null;
  achieved_at: string;
};

const PAGE_SIZE = 20;

export function workoutDate(w: { started_at: string | null; created_at: string }) {
  return new Date(w.started_at ?? w.created_at);
}

export async function fetchWorkoutHistory(before?: string, options?: { search?: string; limit?: number }) {
  const limit = options?.limit ?? PAGE_SIZE;
  const search = options?.search?.trim();
  const { data, error } = await supabase.rpc(
    'get_workout_history',
    // only send p_search when searching, so this still works before the search update is installed
    search ? { p_limit: limit, p_before: before ?? null, p_search: search } : { p_limit: limit, p_before: before ?? null },
  );
  if (error) throw error;
  const rows = await attachPhotos(((data ?? []) as WorkoutSummary[]).map((w) => ({ ...w, volume: Number(w.volume) })));
  return { rows, hasMore: rows.length === limit };
}

const DETAIL_SELECT_PHOTO =
  'id, title, notes, photo_url, group_id, visibility, started_at, ended_at, created_at, duration_minutes, exercises(id, name, order_index, rest_seconds, notes, sets(set_number, weight, reps, set_type, rpe))';
const DETAIL_SELECT =
  'id, title, notes, group_id, visibility, started_at, ended_at, created_at, duration_minutes, exercises(id, name, order_index, rest_seconds, notes, sets(set_number, weight, reps, set_type, rpe))';
// Used if the set-types update hasn't been installed in the database yet
const DETAIL_SELECT_OLD =
  'id, title, notes, visibility, started_at, created_at, duration_minutes, exercises(id, name, order_index, rest_seconds, sets(set_number, weight, reps))';

// Adds each workout's photo (one extra query). Missing photos or an old database just mean no photo.
export async function attachPhotos<T extends { id: string; photo_url?: string | null }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const { data, error } = await supabase.from('workouts').select('id, photo_url').in('id', rows.map((r) => r.id));
  if (error || !data) return rows;
  const photos = new Map((data as { id: string; photo_url: string | null }[]).map((r) => [r.id, r.photo_url]));
  return rows.map((r) => ({ ...r, photo_url: photos.get(r.id) ?? null }));
}

export type WorkoutEditPayload = {
  title: string;
  notes: string | null;
  visibility: 'private' | 'group' | 'public';
  group_id: string | null;
  photo_url: string | null;
  exercises: { name: string; rest_seconds: number; notes: string | null; sets: { weight: number | null; reps: number; type: string; rpe: number | null }[] }[];
};

export async function updateWorkout(id: string, payload: WorkoutEditPayload) {
  const { data, error } = await supabase.rpc('update_workout', { p_workout_id: id, payload });
  if (error) {
    if (/update_workout/.test(error.message) && /function|schema cache/i.test(error.message)) {
      throw new Error('Editing workouts needs the latest database update. Run the SQL from the update notes first.');
    }
    throw error;
  }
  return data as { workout_id: string; pr_count: number };
}

export async function fetchWorkoutDetail(id: string): Promise<WorkoutDetail> {
  // Newest columns first; fall back if a database update hasn't been installed yet
  let res = await supabase.from('workouts').select(DETAIL_SELECT_PHOTO).eq('id', id).single();
  if (res.error && res.error.code !== 'PGRST116') {
    res = await supabase.from('workouts').select(DETAIL_SELECT).eq('id', id).single();
  }
  if (res.error && res.error.code !== 'PGRST116') {
    res = await supabase.from('workouts').select(DETAIL_SELECT_OLD).eq('id', id).single();
  }
  const { data, error } = res;
  if (error) throw error;

  const detail = data as unknown as WorkoutDetail;
  return {
    ...detail,
    exercises: [...(detail.exercises ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map((e) => ({
        ...e,
        sets: [...(e.sets ?? [])]
          .sort((a, b) => a.set_number - b.set_number)
          .map((s) => ({
            ...s,
            weight: s.weight == null ? null : Number(s.weight),
            rpe: s.rpe == null ? null : Number(s.rpe),
          })),
      })),
  };
}

export async function deleteWorkout(id: string, photoUrl?: string | null) {
  const { error } = await supabase.rpc('delete_workout', { p_workout_id: id });
  if (error) throw error;
  if (photoUrl) await removeWorkoutPhoto(photoUrl);
}

export async function fetchExerciseHistory(name: string): Promise<ExerciseSession[]> {
  const { data, error } = await supabase.rpc('get_exercise_history', { exercise_name: name, p_limit: 20 });
  if (error) throw error;
  return ((data ?? []) as ExerciseSession[]).map((s) => ({
    ...s,
    sets: (s.sets ?? []).map((set) => ({ ...set, weight: set.weight == null ? null : Number(set.weight) })),
  }));
}

export async function fetchExerciseRecords(name: string): Promise<ExerciseRecord[]> {
  const { data, error } = await supabase
    .from('personal_records')
    .select('record_type, value, weight, reps, achieved_at')
    .eq('exercise_key', name.trim().toLowerCase());
  if (error) throw error;
  return ((data ?? []) as ExerciseRecord[]).map((r) => ({
    ...r,
    value: Number(r.value),
    weight: r.weight == null ? null : Number(r.weight),
  }));
}

// ---------- Formatting ----------

export function formatDay(date: Date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatFullDate(date: Date) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatTime(date: Date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatMonth(date: Date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function formatDuration(minutes: number | null) {
  if (minutes == null) return '–';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatSet(set: { weight: number | null; reps: number; rpe?: number | null }) {
  const base = set.weight != null && set.weight > 0 ? `${set.weight} kg × ${set.reps}` : `${set.reps} reps`;
  return set.rpe != null ? `${base} @${set.rpe}` : base;
}

export const SET_TYPE_LABEL: Record<string, string> = {
  warmup: 'Warm-up',
  drop: 'Drop set',
  failure: 'To failure',
  amrap: 'AMRAP',
  backoff: 'Back-off',
};
