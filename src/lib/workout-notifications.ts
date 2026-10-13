import * as Notifications from '@/lib/notifications';
import { Platform } from 'react-native';

// Two kinds of notification:
// - "rest": fires when a rest timer ends, so the phone buzzes even when locked.
// - "active": a quiet "Workout in progress" notification that stays on the lock screen
//   (on Android it can't be swiped away until the workout is finished or discarded).

const REST_CHANNEL = 'rest-timer';
const ACTIVE_CHANNEL = 'workout-active';

export type RepzyNotificationType = 'rest' | 'active';

let restNotificationId: string | null = null;
let setupPromise: Promise<boolean> | null = null;

// In the app, the rest bar and vibration already show the rest is over,
// so only show notifications as banners when the app is in the background.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification.request.content.data?.type as RepzyNotificationType | undefined;
    if (type === 'rest') {
      return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    if (type === 'active') {
      return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
  },
});

async function createChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REST_CHANNEL, {
    name: 'Rest timer',
    description: 'Tells you when your rest is over',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync(ACTIVE_CHANNEL, {
    name: 'Workout in progress',
    description: 'Shows your current workout on the lock screen',
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
  });
}

// Sets up channels and asks for permission once. Returns whether notifications are allowed.
export function setupWorkoutNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  if (!setupPromise) {
    setupPromise = (async () => {
      try {
        // Android 13+ only shows the permission prompt once a channel exists
        await createChannels();
        const current = await Notifications.getPermissionsAsync();
        if (current.granted) return true;
        if (!current.canAskAgain) return false;
        const asked = await Notifications.requestPermissionsAsync();
        return asked.granted;
      } catch {
        return false;
      }
    })();
  }
  return setupPromise;
}

export async function scheduleRestDone(endsAt: number, exerciseName: string) {
  await cancelRestDone();
  if (!(await setupWorkoutNotifications())) return;

  const seconds = Math.round((endsAt - Date.now()) / 1000);
  if (seconds < 1) return;

  try {
    restNotificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest over 💪',
        body: `Time for your next set of ${exerciseName}.`,
        data: { type: 'rest' },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 400, 200, 400],
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: REST_CHANNEL,
      },
    });
  } catch {
    restNotificationId = null;
  }
}

export async function cancelRestDone() {
  const id = restNotificationId;
  restNotificationId = null;
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
    await Notifications.dismissNotificationAsync(id);
  } catch {
    // already fired or gone
  }
}

// Removes every "Workout in progress" notification on screen. We give each update its
// own id (Expo Go crashes if an id is reused), so look them up by type instead of id.
async function dismissActiveNotifications() {
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((n) => n.request.content.data?.type === 'active')
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {
    // nothing to dismiss
  }
}

// Updates run one at a time so two quick updates can't leave two notifications behind
let activeQueue: Promise<void> = Promise.resolve();

export function showActiveWorkout(info: {
  startedAt: Date;
  doneSets: number;
  currentExercise: string | null;
}) {
  activeQueue = activeQueue.then(() => presentActiveWorkout(info)).catch(() => {});
  return activeQueue;
}

async function presentActiveWorkout(info: {
  startedAt: Date;
  doneSets: number;
  currentExercise: string | null;
}) {
  if (!(await setupWorkoutNotifications())) return;

  const started = info.startedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const parts = [`Started ${started}`, `${info.doneSets} set${info.doneSets === 1 ? '' : 's'} done`];
  if (info.currentExercise) parts.push(info.currentExercise);

  await dismissActiveNotifications();
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `repzy-active-${Date.now()}`,
      content: {
        title: '🏋️ Workout in progress',
        body: parts.join(' · '),
        data: { type: 'active' },
        sticky: true,
        autoDismiss: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
      },
      trigger: Platform.OS === 'android' ? { channelId: ACTIVE_CHANNEL } : null,
    });
  } catch {
    // notifications are a nice-to-have; never break the workout over them
  }
}

export async function clearWorkoutNotifications() {
  await cancelRestDone();
  // wait for any update in flight, then remove what's on screen
  activeQueue = activeQueue.then(dismissActiveNotifications).catch(() => {});
  await activeQueue;
}
