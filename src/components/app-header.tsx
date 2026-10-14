import { ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Avatar from '@/components/avatar';
import ProfileSettings from '@/components/profile-settings';
import { useRepzyColors } from '@/constants/repzy-colors';
import { useProfile } from '@/lib/profile';
import { draftDoneSets } from '@/lib/workout-draft';
import { useWorkoutSession } from '@/lib/workout-session';

// Screen title on the left, profile avatar on the right (opens Profile & Settings).
export default function AppHeader({
  title,
  subtitle,
  small,
}: {
  title: string;
  subtitle?: string;
  small?: boolean; // for long titles like the Home greeting
}) {
  const c = useRepzyColors();
  const { profile } = useProfile();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <Text
          style={[styles.title, small && styles.titleSmall, { color: c.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: c.subtext }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => setShowProfile(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Profile and settings"
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Avatar url={profile?.avatar_url} name={profile?.display_name || profile?.username || '?'} size={40} />
      </Pressable>
      {showProfile && <ProfileSettings onClose={() => setShowProfile(false)} />}
    </View>
  );
}

function formatElapsed(fromIso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// Shown at the top of every tab while a workout is minimised
export function ActiveWorkoutBanner({ children }: { children?: ReactNode }) {
  const c = useRepzyColors();
  const { draft, resume } = useWorkoutSession();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!draft) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [draft]);

  if (!draft) return <>{children}</>;
  const sets = draftDoneSets(draft);

  return (
    <Pressable
      onPress={resume}
      accessibilityRole="button"
      accessibilityLabel="Resume workout in progress"
      style={({ pressed }) => [styles.banner, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.flex}>
        <Text style={styles.bannerTitle} numberOfLines={1}>
          ● {draft.title || 'Workout'} in progress
        </Text>
        <Text style={styles.bannerDetail}>
          {sets} set{sets === 1 ? '' : 's'} done · tap to resume
        </Text>
      </View>
      <Text style={styles.bannerTimer}>{formatElapsed(draft.startedAt, now)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  titleSmall: { fontSize: 22, letterSpacing: -0.2 },
  subtitle: { fontSize: 14, marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  bannerTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  bannerDetail: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  bannerTimer: { color: '#FFFFFF', fontWeight: '900', fontSize: 18, fontVariant: ['tabular-nums'] },
});
