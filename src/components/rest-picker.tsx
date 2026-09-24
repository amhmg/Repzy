import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useRepzyColors } from '@/constants/repzy-colors';

// Off, then 5 seconds up to 5 minutes in 5-second steps
export const REST_VALUES = Array.from({ length: 61 }, (_, i) => i * 5);

export function formatRest(seconds: number) {
  if (seconds <= 0) return 'Off';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}

const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;

type Props = {
  exerciseName: string;
  value: number;
  onSave: (seconds: number) => void;
  onClose: () => void;
};

export default function RestPicker({ exerciseName, value, onSave, onClose }: Props) {
  const c = useRepzyColors();
  const startIndex = Math.max(0, REST_VALUES.indexOf(value));
  const [index, setIndex] = useState(startIndex);

  function handleScroll(offsetY: number) {
    const next = Math.min(REST_VALUES.length - 1, Math.max(0, Math.round(offsetY / ITEM_HEIGHT)));
    if (next !== index) {
      setIndex(next);
      Haptics.selectionAsync();
    }
  }

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: c.card }]}>
        <Text style={[styles.title, { color: c.text }]}>Rest timer</Text>
        <Text style={[styles.subtitle, { color: c.subtext }]} numberOfLines={1}>
          {exerciseName}
        </Text>

        <View style={styles.wheelWrap}>
          <View pointerEvents="none" style={[styles.selectionBand, { backgroundColor: c.inputBg }]} />
          <FlatList
            data={REST_VALUES}
            keyExtractor={(v) => String(v)}
            extraData={index}
            getItemLayout={(_, i) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * i, index: i })}
            initialScrollIndex={startIndex}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.wheelContent}
            onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
            renderItem={({ item, index: i }) => {
              const selected = i === index;
              const distance = Math.abs(i - index);
              return (
                <View style={styles.item}>
                  <Text
                    style={{
                      color: selected ? c.accent : c.text,
                      fontSize: selected ? 26 : 18,
                      fontWeight: selected ? '800' : '500',
                      opacity: selected ? 1 : distance === 1 ? 0.5 : 0.25,
                    }}>
                    {formatRest(item)}
                  </Text>
                </View>
              );
            }}
          />
        </View>

        <View style={styles.buttonRow}>
          <Pressable onPress={onClose} style={[styles.button, { backgroundColor: c.inputBg }]}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onSave(REST_VALUES[index])}
            style={[styles.button, { backgroundColor: c.accent }]}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Save</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginTop: 2 },
  wheelWrap: { height: ITEM_HEIGHT * VISIBLE_ITEMS, marginVertical: 12 },
  wheelContent: { paddingVertical: ITEM_HEIGHT * 2 },
  selectionBand: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderRadius: 12,
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
});
