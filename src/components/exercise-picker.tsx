import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useRepzyColors } from '@/constants/repzy-colors';
import { EXERCISE_LIBRARY, exerciseImageUrl, MUSCLE_GROUPS, searchExercises } from '@/lib/exercise-library';

type Props = {
  addedNames: string[];
  onPick: (exercise: { name: string; image: string | null }) => void;
  onCancel: () => void;
};

export default function ExercisePicker({ addedNames, onPick, onCancel }: Props) {
  const c = useRepzyColors();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');

  const results = searchExercises(query, group);
  const added = new Set(addedNames.map((n) => n.toLowerCase()));

  const trimmed = query.trim();
  const exactMatch = EXERCISE_LIBRARY.some((e) => e.name.toLowerCase() === trimmed.toLowerCase());
  const canCreate = trimmed.length >= 3 && !exactMatch;

  function createCustom() {
    Alert.alert(
      'Create custom exercise?',
      `Add "${trimmed}" as your own exercise? Use the same name every time so your PRs and history match up.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create', onPress: () => onPick({ name: trimmed, image: null }) },
      ],
    );
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={[styles.headerSide, { color: c.subtext }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.text }]}>Add exercise</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={[styles.search, { backgroundColor: c.inputBg, color: c.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="🔍  Search exercises"
          placeholderTextColor={c.subtext}
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}>
        {MUSCLE_GROUPS.map((g) => {
          const selected = g === group;
          return (
            <Pressable
              key={g}
              onPress={() => setGroup(g)}
              style={[styles.chip, { backgroundColor: selected ? c.accent : c.inputBg }]}>
              <Text style={{ color: selected ? '#FFFFFF' : c.text, fontWeight: '600' }}>{g}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isAdded = added.has(item.name.toLowerCase());
          const uri = exerciseImageUrl(item.image);
          return (
            <Pressable
              onPress={() => onPick({ name: item.name, image: item.image })}
              disabled={isAdded}
              style={({ pressed }) => [styles.row, { opacity: isAdded ? 0.45 : pressed ? 0.6 : 1 }]}>
              <View style={[styles.thumb, { backgroundColor: c.inputBg }]}>
                {uri ? (
                  <Image source={{ uri }} style={styles.thumb} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                ) : (
                  <Text style={styles.thumbFallback}>🏋️</Text>
                )}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={[styles.meta, { color: c.subtext }]}>
                  {item.muscle} · {item.equipment}
                  {item.popular && !trimmed ? '  ·  ⭐ Popular' : ''}
                </Text>
              </View>
              {isAdded && <Text style={[styles.meta, { color: c.subtext }]}>Added</Text>}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.subtext }]}>No exercises found. Try a different word.</Text>
        }
        ListFooterComponent={
          canCreate ? (
            <Pressable onPress={createCustom} style={[styles.createButton, { borderColor: c.accent }]}>
              <Text style={{ color: c.accent, fontWeight: '700' }}>+ Create "{trimmed}" as a custom exercise</Text>
            </Pressable>
          ) : null
        }
      />
    </View>
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
  headerSide: { width: 64, fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  search: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  chipScroll: { flexGrow: 0 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFallback: { fontSize: 24 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 32 },
  createButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
});