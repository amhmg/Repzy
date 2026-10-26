import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

// Opening screen: the native splash shows the logo while the app loads, then this takes over
// at the same spot, gives the logo a small pop, shows the name, and fades into the app.

const BACKGROUND = '#121213'; // matches the native splash in app.json

export default function RepzySplash() {
  const [visible, setVisible] = useState(true);
  const scale = useRef(new Animated.Value(1)).current;
  const word = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    Animated.sequence([
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.08, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
        ]),
        Animated.timing(word, { toValue: 1, duration: 420, delay: 180, useNativeDriver: true }),
      ]),
      Animated.delay(450),
      Animated.timing(fade, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }, [scale, word, fade]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: fade }]} pointerEvents="none" accessibilityLabel="Repzy">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
      </Animated.View>
      <Animated.Text
        style={[
          styles.word,
          { opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
        ]}>
        Repzy
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  logo: { width: 200, height: 200 },
  word: { color: '#FF6B35', fontSize: 40, fontWeight: '900', letterSpacing: -1, marginTop: 14 },
});
