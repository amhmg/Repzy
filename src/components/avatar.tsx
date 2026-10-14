import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { useRepzyColors } from '@/constants/repzy-colors';

// Profile picture: the photo you uploaded (profiles.avatar_url), otherwise your initials.

function initialsOf(name: string) {
  const parts = name.split(/[\s_]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function Avatar({ url, name, size }: { url: string | null | undefined; name: string; size: number }) {
  const c = useRepzyColors();

  if (url?.startsWith('https://')) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.inputBg }}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.accent }]}>
      <Text style={[styles.initialsText, { fontSize: size * 0.38 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initials: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: '#FFFFFF', fontWeight: '900' },
});
