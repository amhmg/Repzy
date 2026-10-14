import { fetchDailyLogs } from '@/lib/daily-log';
import { findLibraryExercise } from '@/lib/exercise-library';
import { fetchRoutines } from '@/lib/routines';
import { supabase } from '@/lib/supabase';

import type { CoachTarget, DailyLog } from './analysis';
import type { CoachExercise, WorkoutLoad } from './engine';
import { buildCoachInput, RawWorkout } from './input';

const DAYS = 120;
const SELECT =
  'id, started_at, created_at, exercises(name, order_index, sets(set_number, weight, reps, set_type, rpe))';
// Used if the set-types database update hasn't been installed yet
const SELECT_OLD = 'id, started_at, created_at, exercises(name, order_index, sets(set_number, weight, reps))';

export type CoachData = {
  exercises: CoachExercise[];
  loads: WorkoutLoad[];
  targets: Map<string, CoachTarget>;
  workoutCount: number;
  daily: DailyLog[]; // check-ins, oldest first
  dailyAvailable: boolean; // false until the check-in database update is installed
};

// Your own workouts from the last 120 days, plus rep targets from your routines.
export async function fetchCoachData(): Promise<CoachData> {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new Error('Please log in again.');

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const query = (select: string) =>
    supabase
      .from('workouts')
      .select(select)
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(400);

  let res = await query(SELECT);
  if (res.error) res = await query(SELECT_OLD);
  if (res.error) throw res.error;

  const rows = (res.data ?? []) as unknown as RawWorkout[];
  const { exercises, loads } = buildCoachInput(rows, (name) => {
    const lib = findLibraryExercise(name);
    return lib ? { group: lib.group, equipment: lib.equipment } : null;
  });

  // Routine rep ranges make recommendations match your plan; if this fails the coach infers them
  const targets = new Map<string, CoachTarget>();
  try {
    for (const r of await fetchRoutines()) {
      for (const e of r.exercises) {
        const key = e.exercise_name.trim().toLowerCase();
        if (!targets.has(key) && (e.rep_min || e.rep_max)) {
          targets.set(key, { min: e.rep_min, max: e.rep_max, sets: e.target_sets });
        }
      }
    }
  } catch {}

  let daily: DailyLog[] = [];
  let dailyAvailable = false;
  try {
    const res = await fetchDailyLogs(DAYS);
    daily = res.logs;
    dailyAvailable = res.available;
  } catch {}

  return { exercises, loads, targets, workoutCount: rows.length, daily, dailyAvailable };
}
