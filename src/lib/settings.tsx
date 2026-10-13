import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

// Per-account preferences, saved on the phone.

export type Settings = {
  defaultRestSeconds: number; // used for exercises added without a routine rest time
  haptics: boolean; // vibration feedback
  notifications: boolean; // rest-over alerts and the lock-screen "workout in progress" notification
};

export const DEFAULT_SETTINGS: Settings = {
  defaultRestSeconds: 90,
  haptics: true,
  notifications: true,
};

// A plain copy for code outside React (haptics and notification helpers)
let current: Settings = { ...DEFAULT_SETTINGS };
export function getSettings() {
  return current;
}

const key = (userId: string) => `repzy:settings:${userId}`;

type SettingsContextValue = {
  settings: Settings;
  updateSettings: (change: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
});

export function SettingsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key(userId))
      .then((raw) => {
        if (cancelled) return;
        const loaded = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
        current = loaded;
        setSettings(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updateSettings = useCallback(
    (change: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...change };
        current = next;
        AsyncStorage.setItem(key(userId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  return <SettingsContext.Provider value={{ settings, updateSettings }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
