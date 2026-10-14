import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Avatar from '@/components/avatar';
import { useRepzyColors } from '@/constants/repzy-colors';
import { removeOldPhotos, uploadAvatarPhoto } from '@/lib/avatar-upload';
import { useProfile } from '@/lib/profile';

// Choose a profile picture from your photo library, or remove it to show your initials.
export default function AvatarPicker({ name, onClose }: { name: string; onClose: () => void }) {
  const c = useRepzyColors();
  const { profile, updateAvatar } = useProfile();
  const [busy, setBusy] = useState<string | null>(null); // what we're doing right now
  const [message, setMessage] = useState<string | null>(null);
  const current = profile?.avatar_url ?? null;

  async function removePicture() {
    if (!profile) return;
    setBusy('remove');
    setMessage(null);
    try {
      await updateAvatar(null);
      removeOldPhotos(profile.id, null);
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

          {current && (
            <Pressable onPress={removePicture} disabled={busy != null} style={styles.remove}>
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
  remove: { alignItems: 'center', paddingVertical: 12 },
});
