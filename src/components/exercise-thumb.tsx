import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  gif: string | null;
  size: number;
};

// Animated exercise demo (GIF), or a placeholder for custom exercises
export default function ExerciseThumb({ gif, size }: Props) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {gif ? (
        <Image
          source={{ uri: gif }}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
      ) : (
        <Text style={{ fontSize: size * 0.42 }}>🏋️</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
