import { base64ToBytes } from '@/lib/avatar-upload-bytes';
import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024; // matches the bucket limit

// Uploads a new profile photo into your own folder, removes your old ones, returns its public URL.
export async function uploadAvatarPhoto(userId: string, base64: string): Promise<string> {
  const bytes = base64ToBytes(base64);
  if (bytes.length > MAX_BYTES) throw new Error('That photo is too large. Please pick a smaller one.');
  // detect the format from the file itself
  const mimeType =
    bytes[0] === 0x89 && bytes[1] === 0x50
      ? 'image/png'
      : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57
        ? 'image/webp'
        : 'image/jpeg';
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mimeType, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error('Photo uploads need the latest database update (avatars). Please try again once it is installed.');
    }
    throw error;
  }
  await removeOldPhotos(userId, path);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Deletes your uploaded photos except `keep` (pass null to delete all of them)
export async function removeOldPhotos(userId: string, keep: string | null) {
  try {
    const { data } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
    const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
    if (old.length) await supabase.storage.from(BUCKET).remove(old);
  } catch {
    // leftovers are harmless; they're replaced next time
  }
}
