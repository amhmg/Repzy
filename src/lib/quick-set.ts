// Set logic shared by the full workout screen and the minimised workout bar / lock-screen
// notification: which set is next, ticking it off, PR detection, and starting the rest timer.
// Pure (no React Native), so it's unit-tested in tests/quick-set.test.ts.

import { parseNumber, RECORD_TYPES, recordValues, type Bests, type RecordType } from './workout';
import type { DraftExercise, SetType, WorkoutDraft } from './workout-draft';

export function setTypeOf(s: { type?: SetType }): SetType {
  return s.type ?? 'normal';
}

// Works out which ticked sets are PRs, from scratch every time.
// Compares each ticked set (top to bottom) against your saved best plus the
// ticked sets above it. Unticking a set removes it from the comparison entirely.
export function markPRs(ex: DraftExercise): DraftExercise {
  const running: Bests = { ...ex.historicBest };
  const sets = ex.sets.map((s) => {
    if (!s.done || setTypeOf(s) === 'warmup') return { ...s, prTypes: [] };
    const weight = parseNumber(s.weight);
    const reps = parseNumber(s.reps);
    if (!weight || weight <= 0 || !reps || reps <= 0) return { ...s, prTypes: [] };

    const values = recordValues(weight, Math.round(reps));
    const improved: RecordType[] = [];
    for (const type of RECORD_TYPES) {
      const current = running[type];
      if (current === undefined || values[type] > current) {
        if (ex.hasHistory && current !== undefined) improved.push(type);
        running[type] = values[type];
      }
    }
    return { ...s, prTypes: improved };
  });
  return { ...ex, sets };
}

export type NextSet = {
  exerciseIndex: number;
  setIndex: number;
  exerciseName: string;
  label: string; // "Set 2 of 4", "Warm-up"
  weight: string; // what will be logged ('' = bodyweight)
  reps: string; // '' = unknown
  fromPrevious: boolean; // numbers came from last session, not typed in
  restSeconds: number;
};

// The next set to do: the first unticked set, in order
export function findNextSet(draft: WorkoutDraft): NextSet | null {
  for (let e = 0; e < draft.exercises.length; e++) {
    const ex = draft.exercises[e];
    const i = ex.sets.findIndex((s) => !s.done);
    if (i < 0) continue;
    const set = ex.sets[i];
    const prev = ex.previous[i];
    const weight = set.weight !== '' ? set.weight : prev?.weight != null ? String(prev.weight) : '';
    const typedReps = set.reps !== '' ? set.reps : '';
    const reps = typedReps || (prev?.reps != null ? String(prev.reps) : ex.target?.repMin ? String(ex.target.repMin) : '');
    const working = ex.sets.filter((s) => setTypeOf(s) !== 'warmup');
    const workingIndex = working.indexOf(set);
    const label =
      setTypeOf(set) === 'warmup' ? 'Warm-up set' : `Set ${workingIndex + 1} of ${working.length}`;
    return {
      exerciseIndex: e,
      setIndex: i,
      exerciseName: ex.name,
      label,
      weight,
      reps,
      fromPrevious: set.weight === '' || set.reps === '',
      restSeconds: ex.restSeconds,
    };
  }
  return null;
}

export function describeSet(n: Pick<NextSet, 'weight' | 'reps'>) {
  const w = parseNumber(n.weight);
  if (!n.reps) return w ? `${w} kg` : 'Add reps';
  return w && w > 0 ? `${w} kg × ${n.reps}` : `${n.reps} reps`;
}

export type CompleteResult =
  | { ok: true; draft: WorkoutDraft; done: NextSet; prTypes: RecordType[] }
  | { ok: false; reason: 'no_sets' | 'needs_reps' };

// Ticks off the next set (using last session's numbers for empty boxes, like the
// workout screen does) and starts the rest timer.
export function completeNextSet(draft: WorkoutDraft, now: number): CompleteResult {
  const next = findNextSet(draft);
  if (!next) return { ok: false, reason: 'no_sets' };
  const reps = parseNumber(next.reps);
  if (!reps || reps <= 0) return { ok: false, reason: 'needs_reps' };

  const ex = draft.exercises[next.exerciseIndex];
  const updated = markPRs({
    ...ex,
    sets: ex.sets.map((s, i) =>
      i === next.setIndex ? { ...s, weight: next.weight, reps: String(Math.round(reps)), done: true } : s,
    ),
  });
  const exercises = draft.exercises.map((e, i) => (i === next.exerciseIndex ? updated : e));
  const rest = ex.restSeconds > 0 ? { endsAt: now + ex.restSeconds * 1000, total: ex.restSeconds, exerciseName: ex.name } : null;
  return {
    ok: true,
    draft: { ...draft, exercises, rest, updatedAt: new Date(now).toISOString() },
    done: next,
    prTypes: updated.sets[next.setIndex].prTypes,
  };
}

export function countDoneSets(draft: WorkoutDraft) {
  return draft.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
}
