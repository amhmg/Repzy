import * as ImagePicker from 'expo-image-picker';

import { base64ToBytes } from '@/lib/avatar-upload-bytes';
import { supabase } from '@/lib/supabase';

// Workout photos: picked from the library, stored in the "workout-photos" bucket under
// <your user id>/..., linked from workouts.photo_url.

const BUCKET = 'workout-photos';
const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket limit

export type PickedPhoto = { uri: string; base64: string };

export async function pickWorkoutPhoto(): Promise<PickedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 5],
    quality: 0.6,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  if (!a.base64) throw new Error('Could not read that photo. Please try another one.');
  return { uri: a.uri, base64: a.base64 };
}

export async function uploadWorkoutPhoto(base64: string): Promise<string> {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new Error('Please log in again.');
  const bytes = base64ToBytes(base64);
  if (bytes.length > MAX_BYTES) throw new Error('That photo is too large. Please pick a smaller one.');
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${png ? 'png' : 'jpg'}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: png ? 'image/png' : 'image/jpeg', upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error('Workout photos need the latest database update. Save without a photo for now.');
    }
    throw error;
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Deletes a photo you no longer use (ignores anything that isn't one of your workout photos)
export async function removeWorkoutPhoto(url: string | null | undefined) {
  if (!url) return;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return;
  try {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]);
  } catch {
    // a leftover file is harmless
  }
}
