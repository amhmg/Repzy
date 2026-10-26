import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import WorkoutLogger from '@/components/workout-logger';
import * as haptics from '@/lib/haptics';
import * as Notifications from '@/lib/notifications';
import { completeNextSet } from '@/lib/quick-set';
import { clearDraft, loadDraft, saveDraft, WorkoutDraft } from '@/lib/workout-draft';
import {
  clearWorkoutNotifications,
  DONE_SET_ACTION,
  RepzyNotificationType,
  scheduleRestDone,
  showActiveWorkout,
} from '@/lib/workout-notifications';

// The workout in progress lives here, above the tabs, so it keeps running and can be
// reopened from any tab. The draft itself is saved on the phone (see workout-draft.ts).

type SavedSummary = { prCount: number; title: string; at: number };

type WorkoutSessionValue = {
  draft: WorkoutDraft | null; // the saved in-progress workout, if any (shown when minimised)
  isOpen: boolean;
  lastSaved: SavedSummary | null;
  savedVersion: number; // bumps after every save so screens can reload their data
  startEmpty: () => void;
  startWith: (draft: WorkoutDraft) => void; // from a routine or "repeat workout"
  resume: () => void;
  refreshDraft: () => Promise<WorkoutDraft | null>;
  dismissSaved: () => void;
  // Ticks off the next set without opening the workout (minimised bar and notification button)
  completeNextFromShortcut: () => Promise<void>;
  markChanged: () => void; // a saved workout was edited: screens reload
  skipRestFromShortcut: () => Promise<void>;
};

const WorkoutSessionContext = createContext<WorkoutSessionValue | null>(null);

export function WorkoutSessionProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [open, setOpen] = useState<{ key: number; draft: WorkoutDraft | null } | null>(null);
  const [lastSaved, setLastSaved] = useState<SavedSummary | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const [completeSignal, setCompleteSignal] = useState(0);

  const lastResponse = Notifications.useLastNotificationResponse();

  const refreshDraft = useCallback(async () => {
    const d = await loadDraft(userId);
    setDraft(d);
    return d;
  }, [userId]);

  useEffect(() => {
    refreshDraft();
  }, [refreshDraft]);

  const completeNextFromShortcut = useCallback(async () => {
    const current = await loadDraft(userId);
    if (!current) return;
    const result = completeNextSet(current, Date.now());
    if (!result.ok) {
      if (result.reason === 'needs_reps') {
        // nothing to copy from last time: open the workout so the reps can be typed in
        setDraft(current);
        setOpen({ key: Date.now(), draft: current });
      }
      return;
    }
    await saveDraft(userId, result.draft);
    setDraft(result.draft);
    if (result.prTypes.length > 0) haptics.notify(haptics.NotifyType.Success);
    else haptics.impact(haptics.ImpactStyle.Light);
    if (result.draft.rest) scheduleRestDone(result.draft.rest.endsAt, result.draft.rest.exerciseName);
    showActiveWorkout(result.draft);
  }, [userId]);

  const skipRestFromShortcut = useCallback(async () => {
    const current = await loadDraft(userId);
    if (!current?.rest) return;
    const next = { ...current, rest: null, updatedAt: new Date().toISOString() };
    await saveDraft(userId, next);
    setDraft(next);
    await clearWorkoutNotifications();
    showActiveWorkout(next);
  }, [userId]);

  // The notification's "✓ Done set" button ticks off the next set.
  // Tapping the lock-screen notification or rest alert itself reopens the workout.
  useEffect(() => {
    if (!lastResponse) return;
    const type = lastResponse.notification.request.content.data?.type as RepzyNotificationType | undefined;
    if (type !== 'active' && type !== 'rest') return;
    Notifications.clearLastNotificationResponse();
    if (lastResponse.actionIdentifier === DONE_SET_ACTION) {
      if (open) setCompleteSignal((n) => n + 1); // the open workout screen ticks it
      else completeNextFromShortcut();
      return;
    }
    if (open) return;
    loadDraft(userId).then((d) => {
      if (d) {
        setDraft(d);
        setOpen({ key: Date.now(), draft: d });
      }
    });
  }, [lastResponse, userId, open, completeNextFromShortcut]);

  // Starting something new while a workout is in progress asks first
  const confirmReplace = useCallback(
    async (start: () => void) => {
      const existing = await refreshDraft();
      if (!existing) {
        start();
        return;
      }
      Alert.alert('Workout in progress', 'You already have a workout going. Resume it or start a fresh one?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Resume', onPress: () => setOpen({ key: Date.now(), draft: existing }) },
        {
          text: 'Start new',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Discard the current workout?', 'Everything logged in it will be lost.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: async () => {
                  await clearDraft(userId);
                  await clearWorkoutNotifications();
                  setDraft(null);
                  start();
                },
              },
            ]),
        },
      ]);
    },
    [refreshDraft, userId],
  );

  const startEmpty = useCallback(() => {
    setLastSaved(null);
    confirmReplace(() => setOpen({ key: Date.now(), draft: null }));
  }, [confirmReplace]);

  const startWith = useCallback(
    (newDraft: WorkoutDraft) => {
      setLastSaved(null);
      confirmReplace(() => setOpen({ key: Date.now(), draft: newDraft }));
    },
    [confirmReplace],
  );

  const resume = useCallback(() => {
    refreshDraft().then((d) => {
      if (d) setOpen({ key: Date.now(), draft: d });
    });
  }, [refreshDraft]);

  const value: WorkoutSessionValue = {
    draft: open ? null : draft,
    isOpen: !!open,
    lastSaved,
    savedVersion,
    startEmpty,
    startWith,
    resume,
    refreshDraft,
    dismissSaved: () => setLastSaved(null),
    completeNextFromShortcut,
    skipRestFromShortcut,
    markChanged: () => setSavedVersion((v) => v + 1),
  };

  return (
    <WorkoutSessionContext.Provider value={value}>
      {children}
      {open && (
        <WorkoutLogger
          key={open.key}
          userId={userId}
          draft={open.draft}
          completeNextSignal={completeSignal}
          onDiscard={() => {
            setOpen(null);
            setDraft(null);
          }}
          onMinimize={() => {
            setOpen(null);
            refreshDraft().then((d) => d && showActiveWorkout(d));
          }}
          onSaved={({ prCount, title }) => {
            setOpen(null);
            setDraft(null);
            setLastSaved({ prCount, title, at: Date.now() });
            setSavedVersion((v) => v + 1);
          }}
        />
      )}
    </WorkoutSessionContext.Provider>
  );
}

export function useWorkoutSession() {
  const ctx = useContext(WorkoutSessionContext);
  if (!ctx) throw new Error('useWorkoutSession must be used inside WorkoutSessionProvider');
  return ctx;
}
