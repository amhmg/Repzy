import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Avatar from '@/components/avatar';
import AvatarPicker from '@/components/avatar-picker';
import RestPicker, { formatRest } from '@/components/rest-picker';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { useSettings } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { useWorkoutSession } from '@/lib/workout-session';

export default function ProfileSettings({ onClose }: { onClose: () => void }) {
  const c = useRepzyColors();
  const { session } = useAuth();
  const { profile, updateDisplayName } = useProfile();
  const { settings, updateSettings } = useSettings();
  const { draft } = useWorkoutSession();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [pickingRest, setPickingRest] = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState(false);

  const nameChanged = name.trim() !== (profile?.display_name ?? '').trim();

  async function saveName() {
    setSavingName(true);
    setNameMessage(null);
    try {
      await updateDisplayName(name);
      setNameMessage('Saved');
    } catch (e: any) {
      setNameMessage(e.message ?? 'Could not save your name');
    } finally {
      setSavingName(false);
    }
  }

  function logOut() {
    Alert.alert(
      'Log out?',
      draft
        ? 'Your workout in progress stays saved on this phone and will be here when you log back in.'
        : 'Your workouts are saved to your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => supabase.auth.signOut() },
      ],
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={styles.headerSide} />
          <Text style={[styles.headerTitle, { color: c.text }]}>Profile & settings</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.headerSide}>
            <Text style={[styles.done, { color: c.accent }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.identity}>
            <Pressable
              onPress={() => setPickingAvatar(true)}
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
              style={({ pressed }) => [styles.avatarButton, { opacity: pressed ? 0.7 : 1 }]}>
              <Avatar url={profile?.avatar_url} name={profile?.display_name || profile?.username || '?'} size={88} />
              <Text style={{ color: c.accent, fontWeight: '700' }}>Change picture</Text>
            </Pressable>
            <Text style={[styles.username, { color: c.text }]}>@{profile?.username ?? '...'}</Text>
            <Text style={{ color: c.subtext }}>{session?.user.email}</Text>
          </View>

          <Section title="Profile" colors={c}>
            <Text style={[styles.label, { color: c.subtext }]}>Display name</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, { backgroundColor: c.inputBg, color: c.text }]}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setNameMessage(null);
                }}
                placeholder={profile?.username ?? 'Your name'}
                placeholderTextColor={c.subtext}
                maxLength={40}
                autoCapitalize="words"
              />
              <Pressable
                onPress={saveName}
                disabled={!nameChanged || savingName}
                style={[styles.saveButton, { backgroundColor: c.accent, opacity: !nameChanged || savingName ? 0.4 : 1 }]}>
                {savingName ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save</Text>}
              </Pressable>
            </View>
            {nameMessage && <Text style={{ color: nameMessage === 'Saved' ? c.success : c.error }}>{nameMessage}</Text>}
            <Text style={[styles.hint, { color: c.subtext }]}>Shown in your greeting and to your groups.</Text>
          </Section>

          <Section title="Workouts" colors={c}>
            <Row
              label="Default rest timer"
              detail="Used when you add an exercise outside a routine"
              colors={c}
              right={<Text style={[styles.value, { color: c.accent }]}>{formatRest(settings.defaultRestSeconds)}</Text>}
              onPress={() => setPickingRest(true)}
            />
            <Row
              label="Vibration"
              detail="Set ticks, PRs and rest timer"
              colors={c}
              right={
                <Switch value={settings.haptics} onValueChange={(v) => updateSettings({ haptics: v })} />
              }
            />
            <Row
              label="Coach suggestions"
              detail="Show next-session targets while you log"
              colors={c}
              right={
                <Switch
                  value={settings.coachSuggestions}
                  onValueChange={(v) => updateSettings({ coachSuggestions: v })}
                />
              }
            />
            <Row
              label="Lock-screen notifications"
              detail="Rest-over alerts and “Workout in progress”"
              colors={c}
              right={
                <Switch
                  value={settings.notifications}
                  onValueChange={(v) => updateSettings({ notifications: v })}
                />
              }
            />
          </Section>

          <Pressable onPress={logOut} style={[styles.logout, { borderColor: c.error }]}>
            <Text style={{ color: c.error, fontWeight: '800', fontSize: 16 }}>Log out</Text>
          </Pressable>
        </ScrollView>

        {pickingAvatar && (
          <AvatarPicker
            name={profile?.display_name || profile?.username || '?'}
            onClose={() => setPickingAvatar(false)}
          />
        )}
        {pickingRest && (
          <RestPicker
            exerciseName="Default for new exercises"
            value={settings.defaultRestSeconds}
            onSave={(seconds) => {
              updateSettings({ defaultRestSeconds: seconds });
              setPickingRest(false);
            }}
            onClose={() => setPickingRest(false)}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, colors, children }: { title: string; colors: RepzyColors; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.subtext }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

function Row({
  label,
  detail,
  right,
  onPress,
  colors,
}: {
  label: string;
  detail?: string;
  right: ReactNode;
  onPress?: () => void;
  colors: RepzyColors;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {detail ? <Text style={[styles.rowDetail, { color: colors.subtext }]}>{detail}</Text> : null}
      </View>
      {right}
    </Pressable>
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
  },
  headerSide: { width: 64, alignItems: 'flex-end' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  done: { fontSize: 16, fontWeight: '800' },
  content: { padding: 16, gap: 18, paddingBottom: 48 },
  identity: { alignItems: 'center', gap: 4, marginTop: 8 },
  avatarButton: { alignItems: 'center', gap: 6, marginBottom: 6 },
  username: { fontSize: 20, fontWeight: '800' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginLeft: 4 },
  card: { borderRadius: 16, padding: 14, gap: 12 },
  label: { fontSize: 13, fontWeight: '600' },
  nameRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  saveButton: { borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  rowLabel: { fontSize: 16, fontWeight: '700' },
  rowDetail: { fontSize: 12, marginTop: 2 },
  value: { fontSize: 16, fontWeight: '800' },
  logout: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
});
