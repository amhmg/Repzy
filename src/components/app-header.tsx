import { ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Avatar from '@/components/avatar';
import ProfileSettings from '@/components/profile-settings';
import { useRepzyColors } from '@/constants/repzy-colors';
import { useProfile } from '@/lib/profile';
import { describeSet, findNextSet } from '@/lib/quick-set';
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

function formatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Mini player shown at the top of every tab while a workout is minimised:
// the next set, a live rest countdown, and ✓ to tick the set without opening the workout.
export function ActiveWorkoutBanner({ children }: { children?: ReactNode }) {
  const c = useRepzyColors();
  const { draft, resume, completeNextFromShortcut, skipRestFromShortcut } = useWorkoutSession();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!draft) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [draft]);

  if (!draft) return <>{children}</>;
  const sets = draftDoneSets(draft);
  const next = findNextSet(draft);
  const restLeft = draft.rest ? draft.rest.endsAt - now : 0;
  const resting = restLeft > 0 && draft.rest != null;
  const restProgress = resting && draft.rest ? Math.min(1, restLeft / (draft.rest.total * 1000)) : 0;

  async function tick() {
    if (busy) return;
    setBusy(true);
    try {
      await completeNextFromShortcut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.banner, { backgroundColor: c.accent }]}>
      <Pressable
        onPress={resume}
        accessibilityRole="button"
        accessibilityLabel="Open workout in progress"
        style={({ pressed }) => [styles.bannerMain, { opacity: pressed ? 0.75 : 1 }]}>
        <View style={styles.bannerTopRow}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            ● {next ? next.exerciseName : 'All sets done'}
          </Text>
          <Text style={styles.bannerElapsed}>{formatElapsed(draft.startedAt, now)}</Text>
        </View>
        {resting ? (
          <>
            <Text style={styles.bannerDetail} numberOfLines={1}>
              <Text style={styles.bannerRest}>Rest {formatCountdown(restLeft)}</Text>
              {next ? `  ·  next ${next.label.toLowerCase()}: ${describeSet(next)}` : ''}
            </Text>
            <View style={styles.restTrack}>
              <View style={[styles.restFill, { width: `${restProgress * 100}%` }]} />
            </View>
          </>
        ) : (
          <Text style={styles.bannerDetail} numberOfLines={1}>
            {next
              ? `${next.label}: ${describeSet(next)}${next.fromPrevious && next.reps ? ' (last time)' : ''}`
              : `${sets} set${sets === 1 ? '' : 's'} done · tap to finish`}
          </Text>
        )}
      </Pressable>

      {resting && (
        <Pressable
          onPress={skipRestFromShortcut}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      )}
      {next && (
        <Pressable
          onPress={tick}
          disabled={busy}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Done: ${next.exerciseName} ${next.label}, ${describeSet(next)}`}
          style={({ pressed }) => [styles.check, { opacity: pressed || busy ? 0.6 : 1 }]}>
          <Text style={[styles.checkText, { color: c.accent }]}>✓</Text>
        </Pressable>
      )}
    </View>
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
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bannerMain: { flex: 1, gap: 3 },
  bannerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerTitle: { flex: 1, color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  bannerElapsed: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] },
  bannerDetail: { color: 'rgba(255,255,255,0.92)', fontSize: 13 },
  bannerRest: { color: '#FFFFFF', fontWeight: '900', fontVariant: ['tabular-nums'] },
  restTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden', marginTop: 2 },
  restFill: { height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
  skip: { paddingHorizontal: 8, paddingVertical: 6 },
  skipText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  check: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 24, fontWeight: '900' },
});
