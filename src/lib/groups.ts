import { supabase } from '@/lib/supabase';

export type GroupSummary = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  member_count: number;
  last_activity: string | null;
};

export type GroupMemberStats = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  is_creator: boolean;
  joined_at: string;
  week_workouts: number;
  week_volume: number;
  week_streak: number; // weeks in a row with at least one workout shared to this group
  last_workout_at: string | null;
};

export type GroupFeedItem = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  title: string | null;
  started_at: string | null;
  created_at: string;
  duration_minutes: number | null;
  set_count: number;
  volume: number;
  exercise_names: string[];
  pr_count: number;
};

const FEED_PAGE = 20;
const NAME_MAX = 40;

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function memberName(m: { username: string | null; display_name: string | null }) {
  return m.username ? `@${m.username}` : (m.display_name ?? 'Someone');
}

export async function fetchMyGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase.rpc('get_my_groups');
  if (error) throw error;
  return (data ?? []) as GroupSummary[];
}

export async function createGroup(name: string): Promise<GroupSummary> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Give your group a name.');
  if (clean.length > NAME_MAX) throw new Error(`Group names can be up to ${NAME_MAX} characters.`);

  const { data, error } = await supabase.rpc('create_group', { p_name: clean });
  if (error) throw error;
  return data as GroupSummary;
}

export async function joinGroup(code: string): Promise<string> {
  const clean = code.trim().toLowerCase();
  if (!/^[a-z0-9]{6}$/.test(clean)) throw new Error('Invite codes are 6 letters and numbers.');
  const { data, error } = await supabase.rpc('join_group_by_code', { code: clean });
  if (error) throw new Error(friendlyGroupError(error.message));
  return data as string;
}

export async function leaveGroup(groupId: string) {
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
  if (error) throw new Error(friendlyGroupError(error.message));
}

export async function deleteGroup(groupId: string) {
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}

export async function fetchGroupLeaderboard(groupId: string): Promise<GroupMemberStats[]> {
  const { data, error } = await supabase.rpc('get_group_leaderboard', {
    p_group_id: groupId,
    p_tz: timeZone(),
  });
  if (error) throw error;
  return ((data ?? []) as GroupMemberStats[]).map((m) => ({ ...m, week_volume: Number(m.week_volume) }));
}

export async function fetchGroupFeed(groupId: string, before?: string) {
  const { data, error } = await supabase.rpc('get_group_feed', {
    p_group_id: groupId,
    p_limit: FEED_PAGE,
    p_before: before ?? null,
  });
  if (error) throw error;
  const rows = ((data ?? []) as GroupFeedItem[]).map((w) => ({ ...w, volume: Number(w.volume) }));
  return { rows, hasMore: rows.length === FEED_PAGE };
}

function friendlyGroupError(message: string) {
  if (message.includes('Invalid invite code')) return 'No group has that invite code. Check it and try again.';
  if (message.includes('group is full')) return 'That group is full.';
  if (message.includes('creator')) return message;
  return message;
}

export function relativeTime(iso: string | null) {
  if (!iso) return 'No workouts yet';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
