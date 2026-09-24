import { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import MuscleMap from '@/components/muscle-map';
import { useRepzyColors } from '@/constants/repzy-colors';
import { EXERCISE_LIBRARY, MUSCLE_GROUPS, searchExercises } from '@/lib/exercise-library';

type Picked = { name: string; primary: string[]; secondary: string[] };

type Props = {
  addedNames: string[];
  onPick: (exercise: Picked) => void;
  onInfo: (name: string) => void;
  onCancel: () => void;
};

export default function ExercisePicker({ addedNames, onPick, onInfo, onCancel }: Props) {
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
        { text: 'Create', onPress: () => onPick({ name: trimmed, primary: [], secondary: [] }) },
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
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isAdded = added.has(item.name.toLowerCase());
          return (
            <View style={styles.row}>
              <Pressable
                onPress={() => onPick({ name: item.name, primary: item.primary, secondary: item.secondary })}
                disabled={isAdded}
                style={({ pressed }) => [styles.rowMain, { opacity: isAdded ? 0.45 : pressed ? 0.6 : 1 }]}>
                <View style={[styles.thumb, { backgroundColor: c.inputBg }]}>
                  <MuscleMap primary={item.primary} secondary={item.secondary} height={56} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={[styles.meta, { color: c.subtext }]}>
                    {isAdded ? 'Added · ' : ''}
                    {item.muscle} · {item.equipment}
                    {item.popular && !trimmed ? '  ·  ⭐ Popular' : ''}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => onInfo(item.name)}
                hitSlop={10}
                style={[styles.infoButton, { borderColor: c.border }]}>
                <Text style={[styles.infoText, { color: c.subtext }]}>i</Text>
              </Pressable>
            </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: {
    width: 68,
    height: 64,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  infoButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { fontSize: 15, fontWeight: '800', fontStyle: 'italic' },
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
