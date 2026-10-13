import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import WorkoutLogger from '@/components/workout-logger';
import * as Notifications from '@/lib/notifications';
import { clearDraft, loadDraft, WorkoutDraft } from '@/lib/workout-draft';
import { clearWorkoutNotifications, RepzyNotificationType } from '@/lib/workout-notifications';

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
};

const WorkoutSessionContext = createContext<WorkoutSessionValue | null>(null);

export function WorkoutSessionProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [open, setOpen] = useState<{ key: number; draft: WorkoutDraft | null } | null>(null);
  const [lastSaved, setLastSaved] = useState<SavedSummary | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);

  const lastResponse = Notifications.useLastNotificationResponse();

  const refreshDraft = useCallback(async () => {
    const d = await loadDraft(userId);
    setDraft(d);
    return d;
  }, [userId]);

  useEffect(() => {
    refreshDraft();
  }, [refreshDraft]);

  // Tapping the lock-screen notification or rest alert reopens the workout
  useEffect(() => {
    if (!lastResponse) return;
    const type = lastResponse.notification.request.content.data?.type as RepzyNotificationType | undefined;
    if (type !== 'active' && type !== 'rest') return;
    Notifications.clearLastNotificationResponse();
    if (open) return;
    loadDraft(userId).then((d) => {
      if (d) {
        setDraft(d);
        setOpen({ key: Date.now(), draft: d });
      }
    });
  }, [lastResponse, userId, open]);

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
  };

  return (
    <WorkoutSessionContext.Provider value={value}>
      {children}
      {open && (
        <WorkoutLogger
          key={open.key}
          userId={userId}
          draft={open.draft}
          onDiscard={() => {
            setOpen(null);
            setDraft(null);
          }}
          onMinimize={() => {
            setOpen(null);
            refreshDraft();
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
