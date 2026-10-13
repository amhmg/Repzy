import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import GroupDetail, { shareInvite } from '@/components/group-detail';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { createGroup, fetchMyGroups, GroupSummary, joinGroup, relativeTime } from '@/lib/groups';

type Sheet = 'create' | 'join' | null;

export default function GroupsScreen() {
  const c = useRepzyColors();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [created, setCreated] = useState<GroupSummary | null>(null);
  const [openGroup, setOpenGroup] = useState<GroupSummary | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setGroups(await fetchMyGroups());
    } catch (e: any) {
      setError(e.message ?? 'Could not load your groups');
    }
  }, []);

  // Reload whenever you come back to this tab
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openById(id: string) {
    const list = await fetchMyGroups().catch(() => null);
    if (list) {
      setGroups(list);
      const g = list.find((x) => x.id === id);
      if (g) setOpenGroup(g);
    }
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.top}>
        <Text style={[styles.title, { color: c.text }]}>Groups</Text>
        <Text style={{ color: c.subtext }}>Train together. Stay accountable.</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => setSheet('create')}
          style={({ pressed }) => [styles.action, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={styles.actionTextLight}>+ Create group</Text>
        </Pressable>
        <Pressable
          onPress={() => setSheet('join')}
          style={({ pressed }) => [styles.action, { backgroundColor: c.accentSoft, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={[styles.actionText, { color: c.accent }]}>Join with code</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={{ color: c.error, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={refresh} style={[styles.retry, { backgroundColor: c.accent }]}>
            <Text style={styles.actionTextLight}>Try again</Text>
          </Pressable>
        </View>
      ) : groups === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          renderItem={({ item }) => <GroupCard group={item} colors={c} onPress={() => setOpenGroup(item)} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={[styles.emptyTitle, { color: c.text }]}>No groups yet</Text>
              <Text style={[styles.emptyText, { color: c.subtext }]}>
                Create a group for your gym friends, or join one with an invite code. Share workouts, compare
                weeks and keep each other on track.
              </Text>
            </View>
          }
        />
      )}

      {sheet === 'create' && (
        <InputSheet
          title="Create a group"
          placeholder="Group name, e.g. Morning Lifters"
          button="Create"
          maxLength={40}
          colors={c}
          onClose={() => setSheet(null)}
          onSubmit={async (name) => {
            const g = await createGroup(name);
            setSheet(null);
            setCreated(g);
            load();
          }}
        />
      )}

      {sheet === 'join' && (
        <InputSheet
          title="Join a group"
          placeholder="6-character invite code"
          button="Join"
          maxLength={6}
          code
          colors={c}
          onClose={() => setSheet(null)}
          onSubmit={async (code) => {
            const id = await joinGroup(code);
            setSheet(null);
            await openById(id);
          }}
        />
      )}

      {created && (
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setCreated(null)} />
          <View style={[styles.sheet, { backgroundColor: c.card }]}>
            <Text style={styles.bigEmoji}>🎉</Text>
            <Text style={[styles.sheetTitle, { color: c.text }]}>{created.name} is ready</Text>
            <Text style={[styles.sheetText, { color: c.subtext }]}>Send your friends this invite code:</Text>
            <Text style={[styles.code, { color: c.accent }]}>{created.invite_code.toUpperCase()}</Text>
            <Pressable
              onPress={() => shareInvite(created)}
              style={[styles.sheetButton, { backgroundColor: c.accent }]}>
              <Text style={styles.actionTextLight}>Share invite</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setOpenGroup(created);
                setCreated(null);
              }}
              style={[styles.sheetButton, { backgroundColor: c.inputBg }]}>
              <Text style={[styles.actionText, { color: c.text }]}>Open group</Text>
            </Pressable>
          </View>
        </View>
      )}

      {openGroup && (
        <GroupDetail
          group={openGroup}
          onClose={() => {
            setOpenGroup(null);
            load();
          }}
          onLeft={() => {
            setOpenGroup(null);
            load();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function GroupCard({ group, colors: c, onPress }: { group: GroupSummary; colors: RepzyColors; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.avatar, { backgroundColor: c.accentSoft }]}>
        <Text style={[styles.avatarText, { color: c.accent }]}>{group.name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={[styles.cardMeta, { color: c.subtext }]}>
          {group.member_count} member{group.member_count === 1 ? '' : 's'} · Last workout{' '}
          {group.last_activity ? relativeTime(group.last_activity) : 'none yet'}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: c.subtext }]}>›</Text>
    </Pressable>
  );
}

function InputSheet({
  title,
  placeholder,
  button,
  maxLength,
  code,
  colors: c,
  onClose,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  button: string;
  maxLength: number;
  code?: boolean;
  colors: RepzyColors;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <View style={[styles.sheet, { backgroundColor: c.card }]}>
        <Text style={[styles.sheetTitle, { color: c.text }]}>{title}</Text>
        <TextInput
          style={[
            styles.input,
            code && styles.codeInput,
            { backgroundColor: c.inputBg, color: c.text },
          ]}
          value={value}
          onChangeText={(t) => setValue(code ? t.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : t)}
          placeholder={placeholder}
          placeholderTextColor={c.subtext}
          autoFocus
          autoCapitalize={code ? 'none' : 'words'}
          autoCorrect={false}
          maxLength={maxLength}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {error && <Text style={[styles.error, { color: c.error }]}>{error}</Text>}
        <View style={styles.sheetRow}>
          <Pressable
            onPress={onClose}
            disabled={busy}
            style={[styles.sheetButton, styles.flex, { backgroundColor: c.inputBg }]}>
            <Text style={[styles.actionText, { color: c.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={busy || !value.trim()}
            style={[
              styles.sheetButton,
              styles.flex,
              { backgroundColor: c.accent, opacity: busy || !value.trim() ? 0.5 : 1 },
            ]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionTextLight}>{button}</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { paddingHorizontal: 20, paddingTop: 16, gap: 2 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  action: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  actionText: { fontWeight: '800', fontSize: 15 },
  actionTextLight: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  loading: { marginVertical: 24 },
  centered: { alignItems: 'center', padding: 32, gap: 10 },
  retry: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  list: { padding: 16, paddingBottom: 120, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 19, fontWeight: '800' },
  emptyText: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '900' },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardMeta: { fontSize: 13, marginTop: 2 },
  chevron: { fontSize: 26, fontWeight: '300' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 20,
    elevation: 20,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  sheetText: { fontSize: 15, textAlign: 'center' },
  sheetRow: { flexDirection: 'row', gap: 10 },
  sheetButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  bigEmoji: { fontSize: 44, textAlign: 'center' },
  code: { fontSize: 36, fontWeight: '900', letterSpacing: 6, textAlign: 'center' },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 17 },
  codeInput: { fontSize: 24, fontWeight: '800', letterSpacing: 6, textAlign: 'center' },
  error: { textAlign: 'center', fontSize: 14 },
});
