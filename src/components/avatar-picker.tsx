import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Avatar, { AVATAR_PRESETS, PresetAvatar } from '@/components/avatar';
import { useRepzyColors } from '@/constants/repzy-colors';
import { removeOldPhotos, uploadAvatarPhoto } from '@/lib/avatar-upload';
import { useProfile } from '@/lib/profile';

// Choose a profile picture: a photo from your library, a drawn avatar, or none (initials).
export default function AvatarPicker({ name, onClose }: { name: string; onClose: () => void }) {
  const c = useRepzyColors();
  const { profile, updateAvatar } = useProfile();
  const [busy, setBusy] = useState<string | null>(null); // what we're doing right now
  const [message, setMessage] = useState<string | null>(null);
  const current = profile?.avatar_url ?? null;

  async function choose(value: string | null) {
    if (!profile) return;
    setBusy(value ?? 'remove');
    setMessage(null);
    try {
      await updateAvatar(value);
      // an uploaded photo is no longer used once you switch away from it
      if (!value?.startsWith('https://')) removeOldPhotos(profile.id, null);
      onClose();
    } catch (e: any) {
      setMessage(e?.message ?? 'Could not save. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function pickPhoto() {
    if (!profile) return;
    setMessage(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('Could not read that photo. Please try another one.');
      setBusy('photo');
      const url = await uploadAvatarPhoto(profile.id, asset.base64);
      await updateAvatar(url);
      onClose();
    } catch (e: any) {
      setMessage(e?.message ?? 'Could not upload that photo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.side}>
            <Text style={{ color: c.accent, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: c.text }]}>Profile picture</Text>
          <View style={styles.side} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.preview}>
            <Avatar url={current} name={name} size={96} />
          </View>

          <Pressable
            onPress={pickPhoto}
            disabled={busy != null}
            style={({ pressed }) => [styles.button, { backgroundColor: c.accent, opacity: pressed || busy ? 0.7 : 1 }]}>
            {busy === 'photo' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>📷 Choose from your photos</Text>
            )}
          </Pressable>

          {message && <Text style={{ color: c.error, textAlign: 'center' }}>{message}</Text>}

          <Text style={[styles.section, { color: c.subtext }]}>OR PICK AN AVATAR</Text>
          <View style={styles.grid}>
            {AVATAR_PRESETS.map((p) => {
              const value = `preset:${p.id}`;
              const selected = current === value;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => choose(value)}
                  disabled={busy != null}
                  accessibilityRole="button"
                  accessibilityLabel={`Avatar ${p.id}`}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.cell,
                    { borderColor: selected ? c.accent : 'transparent', opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <PresetAvatar preset={p} size={64} />
                  {busy === value && <ActivityIndicator style={StyleSheet.absoluteFill} />}
                </Pressable>
              );
            })}
          </View>

          {current && (
            <Pressable onPress={() => choose(null)} disabled={busy != null} style={styles.remove}>
              <Text style={{ color: c.error, fontWeight: '700' }}>Remove picture (use initials)</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { width: 70 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  preview: { alignItems: 'center', marginVertical: 6 },
  button: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  cell: { borderWidth: 3, borderRadius: 40, padding: 2 },
  remove: { alignItems: 'center', paddingVertical: 12 },
});
