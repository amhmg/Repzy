// Turns logged workouts (as loaded from the database) into what the coach engine needs.
// Pure: the exercise library lookup is passed in, so this can be unit-tested.

import type { CoachExercise, CoachSet, SetType, WorkoutLoad } from './engine';

export type RawSet = {
  set_number: number;
  weight: number | string | null;
  reps: number | null;
  set_type?: string | null;
  rpe?: number | string | null;
};

export type RawWorkout = {
  id: string;
  started_at: string | null;
  created_at: string;
  exercises: { name: string; order_index: number; sets: RawSet[] | null }[] | null;
};

export type ExerciseLookup = (name: string) => { group: string; equipment: string } | null;

const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure', 'amrap', 'backoff'];

function toSet(s: RawSet): CoachSet | null {
  const reps = s.reps == null ? 0 : Number(s.reps);
  if (!(reps > 0)) return null;
  const weight = s.weight == null || s.weight === '' ? null : Number(s.weight);
  const type = SET_TYPES.includes(s.set_type as SetType) ? (s.set_type as SetType) : 'normal';
  const rpe = s.rpe == null || s.rpe === '' ? null : Number(s.rpe);
  return { weight: weight != null && Number.isFinite(weight) ? weight : null, reps, type, rpe };
}

export function buildCoachInput(
  workouts: RawWorkout[],
  lookup: ExerciseLookup,
): { exercises: CoachExercise[]; loads: WorkoutLoad[] } {
  const ordered = [...workouts].sort(
    (a, b) => new Date(a.started_at ?? a.created_at).getTime() - new Date(b.started_at ?? b.created_at).getTime(),
  );
  const byKey = new Map<string, CoachExercise>();
  const loads: WorkoutLoad[] = [];

  for (const w of ordered) {
    const date = w.started_at ?? w.created_at;
    let hardSets = 0;
    let volume = 0;
    const exercises = [...(w.exercises ?? [])].sort((a, b) => a.order_index - b.order_index);

    for (const e of exercises) {
      const name = e.name?.trim();
      if (!name) continue;
      const sets = [...(e.sets ?? [])]
        .sort((a, b) => a.set_number - b.set_number)
        .map(toSet)
        .filter((s): s is CoachSet => s != null);
      if (sets.length === 0) continue;

      for (const s of sets) {
        if (s.type === 'warmup') continue;
        hardSets++;
        volume += (s.weight ?? 0) * s.reps;
      }

      const key = name.toLowerCase();
      let ex = byKey.get(key);
      if (!ex) {
        const info = lookup(name);
        ex = { name, group: info?.group ?? null, equipment: info?.equipment ?? null, sessions: [] };
        byKey.set(key, ex);
      }
      ex.name = name; // latest spelling wins
      // the same exercise twice in one workout counts as one session
      const last = ex.sessions[ex.sessions.length - 1];
      if (last && last.date === date) last.sets.push(...sets);
      else ex.sessions.push({ date, sets });
    }

    if (hardSets > 0) loads.push({ date, hardSets, volume });
  }

  return { exercises: [...byKey.values()], loads };
}
