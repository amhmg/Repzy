import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import Avatar from '@/components/avatar';
import ExerciseInfo from '@/components/exercise-info';
import { WorkoutDetailView } from '@/components/workout-history';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { useAuth } from '@/lib/auth';
import {
  deleteGroup,
  fetchAvatars,
  fetchGroupFeed,
  fetchGroupLeaderboard,
  GroupFeedItem,
  GroupMemberStats,
  GroupSummary,
  leaveGroup,
  memberName,
  relativeTime,
} from '@/lib/groups';
import { formatDuration } from '@/lib/history';
import { formatKg } from '@/lib/workout';

type Props = {
  group: GroupSummary;
  onClose: () => void;
  onLeft: () => void; // left or deleted the group
};

type Tab = 'week' | 'feed';

const MEDALS = ['🥇', '🥈', '🥉'];

export function shareInvite(group: { name: string; invite_code: string }) {
  Share.share({
    message: `Join my workout group "${group.name}" on Repzy! Open the Groups tab, tap "Join with code" and enter: ${group.invite_code}`,
  });
}

export default function GroupDetail({ group, onClose, onLeft }: Props) {
  const c = useRepzyColors();
  const { session } = useAuth();
  const myId = session?.user.id;
  const isCreator = group.created_by === myId;

  const [tab, setTab] = useState<Tab>('week');
  const [members, setMembers] = useState<GroupMemberStats[] | null>(null);
  const [feed, setFeed] = useState<GroupFeedItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openWorkout, setOpenWorkout] = useState<GroupFeedItem | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [board, firstPage] = await Promise.all([fetchGroupLeaderboard(group.id), fetchGroupFeed(group.id)]);
      setMembers(board);
      setFeed(firstPage.rows);
      setHasMore(firstPage.hasMore);
      fetchAvatars(board.map((m) => m.user_id)).then(setAvatars);
    } catch (e: any) {
      setError(e.message ?? 'Could not load this group');
    }
  }, [group.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function loadMore() {
    if (!hasMore || loadingMore || !feed || feed.length === 0) return;
    setLoadingMore(true);
    try {
      const last = feed[feed.length - 1];
      const { rows, hasMore: more } = await fetchGroupFeed(group.id, last.started_at ?? last.created_at);
      setFeed((list) => [...(list ?? []), ...rows.filter((r) => !(list ?? []).some((w) => w.id === r.id))]);
      setHasMore(more);
    } catch {
      // keep what we have
    } finally {
      setLoadingMore(false);
    }
  }

  function openMenu() {
    if (isCreator) {
      Alert.alert(group.name, 'You created this group.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share invite code', onPress: () => shareInvite(group) },
        {
          text: 'Delete group',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Delete group?',
              'This removes the group for everyone. Workouts stay in each person’s own history.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteGroup(group.id);
                      onLeft();
                    } catch (e: any) {
                      Alert.alert('Could not delete', e.message ?? 'Please try again.');
                    }
                  },
                },
              ],
            ),
        },
      ]);
    } else {
      Alert.alert(group.name, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share invite code', onPress: () => shareInvite(group) },
        {
          text: 'Leave group',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Leave group?', 'You can rejoin later with the invite code.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Leave',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await leaveGroup(group.id);
                    onLeft();
                  } catch (e: any) {
                    Alert.alert('Could not leave', e.message ?? 'Please try again.');
                  }
                },
              },
            ]),
        },
      ]);
    }
  }

  function handleBack() {
    if (infoFor) setInfoFor(null);
    else if (openWorkout) setOpenWorkout(null);
    else onClose();
  }

  const ranked = [...(members ?? [])].sort(
    (a, b) => b.week_workouts - a.week_workouts || b.week_volume - a.week_volume || b.week_streak - a.week_streak,
  );
  const groupWorkouts = ranked.reduce((n, m) => n + m.week_workouts, 0);
  const activeCount = ranked.filter((m) => m.week_workouts > 0).length;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={handleBack}>
      <SafeAreaProvider>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
        {openWorkout ? (
          <WorkoutDetailView
            id={openWorkout.id}
            colors={c}
            onBack={() => setOpenWorkout(null)}
            onInfo={setInfoFor}
            canDelete={openWorkout.user_id === myId}
            ownerLabel={openWorkout.user_id === myId ? 'You' : memberName(openWorkout)}
            onEdited={load}
            onRepeatStarted={() => {
              setOpenWorkout(null);
              onClose();
            }}
            onDeleted={() => {
              setFeed((list) => (list ?? []).filter((w) => w.id !== openWorkout.id));
              setOpenWorkout(null);
              load();
            }}
          />
        ) : (
          <>
            <View style={[styles.header, { borderBottomColor: c.border }]}>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={[styles.headerSide, { color: c.subtext }]}>Back</Text>
              </Pressable>
              <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
                {group.name}
              </Text>
              <Pressable onPress={openMenu} hitSlop={10} style={styles.headerRight}>
                <Text style={[styles.menuDots, { color: c.text }]}>•••</Text>
              </Pressable>
            </View>

            <View style={[styles.inviteCard, { backgroundColor: c.accentSoft }]}>
              <View style={styles.flex}>
                <Text style={[styles.inviteLabel, { color: c.subtext }]}>Invite code</Text>
                <Text style={[styles.inviteCode, { color: c.accent }]}>{group.invite_code.toUpperCase()}</Text>
              </View>
              <Pressable onPress={() => shareInvite(group)} style={[styles.shareButton, { backgroundColor: c.accent }]}>
                <Text style={styles.shareText}>Invite</Text>
              </Pressable>
            </View>

            <View style={[styles.tabs, { backgroundColor: c.inputBg }]}>
              {(['week', 'feed'] as Tab[]).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[styles.tab, tab === t && { backgroundColor: c.card }]}>
                  <Text style={{ color: tab === t ? c.text : c.subtext, fontWeight: '700' }}>
                    {t === 'week' ? 'This week' : 'Feed'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? (
              <View style={styles.centered}>
                <Text style={{ color: c.error, textAlign: 'center' }}>{error}</Text>
                <Pressable onPress={refresh} style={[styles.retry, { backgroundColor: c.accent }]}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : members === null || feed === null ? (
              <ActivityIndicator style={styles.loading} />
            ) : tab === 'week' ? (
              <ScrollView
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
                <View style={[styles.weekSummary, { backgroundColor: c.card }]}>
                  <Stat label="Workouts this week" value={String(groupWorkouts)} colors={c} />
                  <Stat label="Members active" value={`${activeCount}/${ranked.length}`} colors={c} />
                </View>

                {ranked.map((m, i) => (
                  <MemberRow
                    key={m.user_id}
                    member={m}
                    rank={i}
                    isMe={m.user_id === myId}
                    avatar={avatars[m.user_id]}
                    colors={c}
                  />
                ))}

                {ranked.length === 1 && (
                  <Text style={[styles.hint, { color: c.subtext }]}>
                    It&apos;s just you so far. Tap Invite to bring your training partners in.
                  </Text>
                )}
                <Text style={[styles.hint, { color: c.subtext }]}>
                  Only workouts shared to this group count. Streaks are weeks in a row with at least one.
                </Text>
              </ScrollView>
            ) : (
              <FlatList
                data={feed}
                keyExtractor={(w) => w.id}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
                renderItem={({ item }) => (
                  <FeedCard
                    item={item}
                    isMe={item.user_id === myId}
                    avatar={avatars[item.user_id]}
                    colors={c}
                    onPress={() => setOpenWorkout(item)}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.centered}>
                    <Text style={styles.emptyEmoji}>👥</Text>
                    <Text style={[styles.emptyText, { color: c.subtext }]}>
                      No workouts shared yet. When you finish a workout, choose 👥 Group to post it here.
                    </Text>
                  </View>
                }
                ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.loading} /> : undefined}
              />
            )}
          </>
        )}

        {infoFor && <ExerciseInfo name={infoFor} onClose={() => setInfoFor(null)} />}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function MemberRow({
  member: m,
  rank,
  isMe,
  avatar,
  colors: c,
}: {
  member: GroupMemberStats;
  rank: number;
  isMe: boolean;
  avatar: string | null | undefined;
  colors: RepzyColors;
}) {
  const active = m.week_workouts > 0;
  return (
    <View
      style={[
        styles.memberRow,
        { backgroundColor: c.card, borderColor: isMe ? c.accent : 'transparent', opacity: active ? 1 : 0.6 },
      ]}>
      <Text style={styles.rank}>{active && rank < 3 ? MEDALS[rank] : `${rank + 1}`}</Text>
      <Avatar url={avatar} name={m.display_name || m.username || '?'} size={40} />
      <View style={styles.flex}>
        <Text style={[styles.memberName, { color: c.text }]} numberOfLines={1}>
          {memberName(m)}
          {isMe ? ' (you)' : ''}
          {m.is_creator ? ' 👑' : ''}
        </Text>
        <Text style={[styles.memberMeta, { color: c.subtext }]}>
          {active
            ? `${m.week_workouts} workout${m.week_workouts === 1 ? '' : 's'} · ${formatKg(m.week_volume)}`
            : 'No workout yet this week'}
        </Text>
        <Text style={[styles.memberMeta, { color: c.subtext }]}>Last: {relativeTime(m.last_workout_at)}</Text>
      </View>
      {m.week_streak > 0 && (
        <View style={[styles.streak, { backgroundColor: c.accentSoft }]}>
          <Text style={[styles.streakText, { color: c.accent }]}>🔥 {m.week_streak}</Text>
          <Text style={[styles.streakLabel, { color: c.accent }]}>wk{m.week_streak === 1 ? '' : 's'}</Text>
        </View>
      )}
    </View>
  );
}

function FeedCard({
  item,
  isMe,
  avatar,
  colors: c,
  onPress,
}: {
  item: GroupFeedItem;
  isMe: boolean;
  avatar: string | null | undefined;
  colors: RepzyColors;
  onPress: () => void;
}) {
  const names = item.exercise_names;
  const shown = names.slice(0, 3).join(', ');
  const extra = names.length > 3 ? ` +${names.length - 3} more` : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.cardTop}>
        <Avatar url={avatar} name={item.display_name || item.username || '?'} size={24} />
        <Text style={[styles.cardAuthor, { color: c.accent }]} numberOfLines={1}>
          {isMe ? 'You' : memberName(item)}
        </Text>
        <Text style={[styles.cardTime, { color: c.subtext }]}>{relativeTime(item.started_at ?? item.created_at)}</Text>
      </View>
      <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>
        {item.title || 'Workout'}
      </Text>
      <View style={styles.cardStats}>
        <Text style={[styles.cardStat, { color: c.text }]}>⏱ {formatDuration(item.duration_minutes)}</Text>
        <Text style={[styles.cardStat, { color: c.text }]}>{item.set_count} sets</Text>
        <Text style={[styles.cardStat, { color: c.text }]}>{formatKg(item.volume)}</Text>
        {item.pr_count > 0 && (
          <Text style={[styles.cardStat, { color: c.gold }]}>
            🏆 {item.pr_count} PR{item.pr_count === 1 ? '' : 's'}
          </Text>
        )}
      </View>
      {names.length > 0 && (
        <Text style={[styles.cardExercises, { color: c.subtext }]} numberOfLines={2}>
          {shown}
          {extra}
        </Text>
      )}
      {item.photo_url ? (
        <Image source={{ uri: item.photo_url }} style={styles.feedPhoto} contentFit="cover" transition={150} />
      ) : null}
    </Pressable>
  );
}

function Stat({ label, value, colors }: { label: string; value: string; colors: RepzyColors }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.subtext }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerSide: { width: 56, fontSize: 16 },
  headerRight: { width: 56, alignItems: 'flex-end' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  menuDots: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 16,
    gap: 12,
  },
  inviteLabel: { fontSize: 12, fontWeight: '600' },
  inviteCode: { fontSize: 24, fontWeight: '900', letterSpacing: 3 },
  shareButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  shareText: { color: '#FFFFFF', fontWeight: '800' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 8, borderRadius: 12, padding: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  loading: { marginVertical: 24 },
  centered: { alignItems: 'center', padding: 32, gap: 12 },
  retry: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  list: { padding: 16, paddingTop: 8, paddingBottom: 48, gap: 10 },
  weekSummary: { flexDirection: 'row', borderRadius: 16, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 12 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  rank: { width: 28, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  memberName: { fontSize: 16, fontWeight: '800' },
  memberMeta: { fontSize: 13, marginTop: 2 },
  streak: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  streakText: { fontSize: 15, fontWeight: '900' },
  streakLabel: { fontSize: 10, fontWeight: '700' },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  card: { borderRadius: 16, padding: 14, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedPhoto: { width: '100%', aspectRatio: 4 / 5, borderRadius: 12, marginTop: 6 },
  cardAuthor: { flex: 1, fontSize: 14, fontWeight: '800' },
  cardTime: { fontSize: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 },
  cardStat: { fontSize: 13, fontWeight: '600' },
  cardExercises: { fontSize: 13 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { textAlign: 'center', fontSize: 15 },
});
