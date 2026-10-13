import AsyncStorage from '@react-native-async-storage/async-storage';

import { Bests, RecordType } from '@/lib/workout';

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

export type DraftExercise = {
  id: string;
  name: string;
  gif: string | null;
  restSeconds: number;
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
