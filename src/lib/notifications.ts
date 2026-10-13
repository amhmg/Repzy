// Local notifications only.
//
// Importing 'expo-notifications' as a whole also loads its push-notification code,
// which throws straight away inside Expo Go on Android ("removed from Expo Go with
// SDK 53"). Repzy only uses local notifications, which do work in Expo Go, so we
// import just those pieces directly. If Repzy moves to a development build and needs
// push notifications later, this file can go back to `export * from 'expo-notifications'`.

export { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
export { dismissNotificationAsync } from 'expo-notifications/build/dismissNotificationAsync';
export { getPresentedNotificationsAsync } from 'expo-notifications/build/getPresentedNotificationsAsync';
export { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
export { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
export { clearLastNotificationResponse } from 'expo-notifications/build/NotificationsEmitter';
export { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
export { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
export { useLastNotificationResponse } from 'expo-notifications/build/useLastNotificationResponse';
export {
  AndroidImportance,
  AndroidNotificationVisibility,
} from 'expo-notifications/build/NotificationChannelManager.types';
export {
  AndroidNotificationPriority,
  SchedulableTriggerInputTypes,
} from 'expo-notifications/build/Notifications.types';
