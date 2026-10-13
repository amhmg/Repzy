import { findLibraryExercise } from '@/lib/exercise-library';
import { supabase } from '@/lib/supabase';
import { RecordType } from '@/lib/workout';

export type TrainingSummary = {
  total_workouts: number;
  total_sets: number;
  total_volume: number;
  week_workouts: number;
  last_week_workouts: number;
  week_volume: number;
  last_week_volume: number;
  month_workouts: number;
  week_days: number[]; // 1 = Monday … 7 = Sunday, days trained this week
  week_streak: number; // weeks in a row with at least one workout
  weeks: { week: string; workouts: number; volume: number }[]; // last 12 weeks, oldest first
  recent_prs: {
    exercise_name: string;
    record_type: RecordType;
    value: number;
    weight: number | null;
    reps: number | null;
    achieved_at: string;
  }[];
  week_exercise_sets: { name: string; sets: number }[];
};

export type MyExercise = {
  exercise_key: string;
  name: string;
  sessions: number;
  total_sets: number;
  last_done: string;
  best_e1rm: number | null;
};

export type RecordRow = {
  exercise_key: string;
  exercise_name: string;
  record_type: RecordType;
  value: number;
  weight: number | null;
  reps: number | null;
  achieved_at: string;
};

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function fetchTrainingSummary(): Promise<TrainingSummary> {
  const { data, error } = await supabase.rpc('get_training_summary', { p_tz: timeZone() });
  if (error) throw error;
  const s = data as TrainingSummary;
  return {
    ...s,
    total_volume: Number(s.total_volume),
    week_volume: Number(s.week_volume),
    last_week_volume: Number(s.last_week_volume),
    weeks: s.weeks.map((w) => ({ ...w, volume: Number(w.volume) })),
    recent_prs: s.recent_prs.map((p) => ({ ...p, value: Number(p.value), weight: p.weight == null ? null : Number(p.weight) })),
  };
}

export async function fetchMyExercises(): Promise<MyExercise[]> {
  const { data, error } = await supabase.rpc('get_my_exercises');
  if (error) throw error;
  return ((data ?? []) as MyExercise[]).map((e) => ({ ...e, best_e1rm: e.best_e1rm == null ? null : Number(e.best_e1rm) }));
}

export async function fetchAllRecords(): Promise<RecordRow[]> {
  const { data, error } = await supabase
    .from('personal_records')
    .select('exercise_key, exercise_name, record_type, value, weight, reps, achieved_at')
    .order('exercise_name');
  if (error) throw error;
  return ((data ?? []) as RecordRow[]).map((r) => ({
    ...r,
    value: Number(r.value),
    weight: r.weight == null ? null : Number(r.weight),
  }));
}

// Each set counts toward the main muscle group of its exercise (an estimate;
// compound lifts also work other muscles). Custom exercises go under "Other".
export function setsByMuscleGroup(rows: { name: string; sets: number }[]) {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const group = findLibraryExercise(r.name)?.group ?? 'Other';
    totals.set(group, (totals.get(group) ?? 0) + r.sets);
  }
  return [...totals.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets);
}

export const RECORD_SHORT: Record<RecordType, string> = {
  heaviest_weight: 'Heaviest',
  estimated_1rm: 'Est. 1RM',
  best_set_volume: 'Best set',
};

// A data-based tip for the Home screen, or null when there isn't enough to say
export function trainingInsight(s: TrainingSummary): string | null {
  if (s.total_workouts === 0) return null;
  if (s.week_streak >= 2 && s.week_workouts > 0) {
    return `🔥 ${s.week_streak} weeks in a row with a workout. Keep the streak going.`;
  }
  if (s.week_streak >= 2 && s.week_workouts === 0) {
    return `🔥 You're on a ${s.week_streak}-week streak. One workout this week keeps it alive.`;
  }
  if (s.last_week_workouts > s.week_workouts) {
    const gap = s.last_week_workouts - s.week_workouts;
    return `${gap} more workout${gap === 1 ? '' : 's'} to match last week (${s.last_week_workouts}).`;
  }
  if (s.week_workouts > s.last_week_workouts && s.last_week_workouts > 0) {
    return `You've already beaten last week's ${s.last_week_workouts} workout${s.last_week_workouts === 1 ? '' : 's'}. 💪`;
  }
  if (s.recent_prs.length > 0) {
    const pr = s.recent_prs[0];
    return `Your latest PR was on ${pr.exercise_name}. Check Progress → Records to see them all.`;
  }
  return null;
}
