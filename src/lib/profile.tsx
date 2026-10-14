import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

type ProfileValue = {
  profile: Profile | null;
  refresh: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  updateAvatar: (value: string | null) => Promise<void>;
};

const ProfileContext = createContext<ProfileValue>({
  profile: null,
  refresh: async () => {},
  updateDisplayName: async () => {},
  updateAvatar: async () => {},
});

export function ProfileProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', userId).single();
    if (data) setProfile(data as Profile);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateDisplayName = useCallback(
    async (name: string) => {
      const clean = name.trim().replace(/\s+/g, ' ');
      if (clean.length > 40) throw new Error('Names can be up to 40 characters.');
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: clean || null })
        .eq('id', userId);
      if (error) throw error;
      await refresh();
    },
    [userId, refresh],
  );

  // value is "preset:<id>", a public image URL, or null for initials
  const updateAvatar = useCallback(
    async (value: string | null) => {
      const { error } = await supabase.from('profiles').update({ avatar_url: value }).eq('id', userId);
      if (error) throw error;
      setProfile((p) => (p ? { ...p, avatar_url: value } : p));
    },
    [userId],
  );

  return <ProfileContext.Provider value={{ profile, refresh, updateDisplayName, updateAvatar }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}

// The name to greet someone by: display name, then username
export function firstName(profile: Profile | null) {
  const name = profile?.display_name?.trim() || profile?.username || '';
  return name.split(' ')[0];
}

export function initials(profile: Profile | null) {
  const name = profile?.display_name?.trim() || profile?.username || '?';
  const parts = name.split(/[\s_]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}
