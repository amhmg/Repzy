import * as Haptics from 'expo-haptics';

import { getSettings } from '@/lib/settings';

// Vibration feedback that respects the Haptics setting.

export const ImpactStyle = Haptics.ImpactFeedbackStyle;
export const NotifyType = Haptics.NotificationFeedbackType;

export function impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (getSettings().haptics) Haptics.impactAsync(style).catch(() => {});
}

export function notify(type: Haptics.NotificationFeedbackType) {
  if (getSettings().haptics) Haptics.notificationAsync(type).catch(() => {});
}

export function selection() {
  if (getSettings().haptics) Haptics.selectionAsync().catch(() => {});
}
