import AsyncStorage from '@react-native-async-storage/async-storage';

import { findLibraryExercise } from '@/lib/exercise-library';
import { Bests, newId, RecordType } from '@/lib/workout';

// The workout you're in the middle of, saved on the phone after every change
// so closing the app, locking the phone or a crash never loses it.

export type DraftSet = {
  id: string;
  weight: string;
  reps: string;
  done: boolean;
  prTypes: RecordType[];
};

export type DraftPreviousSet = { set_number: number; weight: number | null; reps: number | null };

export type DraftTarget = { sets: number; repMin: number | null; repMax: number | null };

export type DraftExercise = {
  id: string;
  name: string;
  gif: string | null;
  restSeconds: number;
  target?: DraftTarget; // from a saved routine
  notes?: string | null; // routine notes for this exercise
  sets: DraftSet[];
  previous: DraftPreviousSet[];
  hasHistory: boolean;
  historicBest: Bests;
  loading: boolean;
};

export type DraftVisibility = 'private' | 'group' | 'public';

export type WorkoutDraft = {
  version: 1;
  startedAt: string;
  exercises: DraftExercise[];
  rest: { endsAt: number; total: number; exerciseName: string } | null;
  title: string;
  visibility: DraftVisibility;
  groupId: string | null;
  updatedAt: string;
};

const draftKey = (userId: string) => `repzy:active-workout:${userId}`;

export async function loadDraft(userId: string): Promise<WorkoutDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as WorkoutDraft;
    if (draft?.version !== 1 || !draft.startedAt || !Array.isArray(draft.exercises)) return null;
    return draft;
  } catch {
    return null;
  }
}

export async function saveDraft(userId: string, draft: WorkoutDraft) {
  try {
    await AsyncStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    // storage full or unavailable: the workout still works, it just won't survive a restart
  }
}

export async function clearDraft(userId: string) {
  try {
    await AsyncStorage.removeItem(draftKey(userId));
  } catch {
    // nothing to clear
  }
}

export function draftDoneSets(draft: WorkoutDraft) {
  return draft.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.done).length, 0);
}

// ---------- Building a new workout ----------

function emptyDraftSet(): DraftSet {
  return { id: newId(), weight: '', reps: '', done: false, prTypes: [] };
}

function draftExercise(
  name: string,
  setCount: number,
  restSeconds: number,
  extra?: { target?: DraftTarget; notes?: string | null },
): DraftExercise {
  return {
    id: newId(),
    name,
    gif: findLibraryExercise(name)?.gif ?? null,
    restSeconds,
    target: extra?.target,
    notes: extra?.notes ?? null,
    sets: Array.from({ length: Math.max(1, setCount) }, emptyDraftSet),
    previous: [],
    hasHistory: false,
    historicBest: {},
    loading: true, // the workout screen loads last session and PRs on open
  };
}

export function newDraft(title: string, exercises: DraftExercise[]): WorkoutDraft {
  return {
    version: 1,
    startedAt: new Date().toISOString(),
    exercises,
    rest: null,
    title,
    visibility: 'private',
    groupId: null,
    updatedAt: new Date().toISOString(),
  };
}

export type RoutineForDraft = {
  name: string;
  exercises: {
    exercise_name: string;
    target_sets: number;
    rep_min: number | null;
    rep_max: number | null;
    rest_seconds: number | null;
    notes: string | null;
  }[];
};

// Starting a routine copies it; the saved routine itself is never changed
export function draftFromRoutine(routine: RoutineForDraft, defaultRest: number): WorkoutDraft {
  return newDraft(
    routine.name,
    routine.exercises.map((e) =>
      draftExercise(e.exercise_name, e.target_sets, e.rest_seconds ?? defaultRest, {
        target: { sets: e.target_sets, repMin: e.rep_min, repMax: e.rep_max },
        notes: e.notes,
      }),
    ),
  );
}

export type WorkoutForDraft = {
  title: string | null;
  exercises: { name: string; sets: unknown[]; rest_seconds?: number | null }[];
};

// "Repeat workout": same exercises and number of sets, fresh empty sets
export function draftFromWorkout(workout: WorkoutForDraft, defaultRest: number): WorkoutDraft {
  return newDraft(
    workout.title || 'Workout',
    workout.exercises.map((e) => draftExercise(e.name, e.sets.length, e.rest_seconds ?? defaultRest)),
  );
}
