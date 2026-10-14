import { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import ExerciseThumb from '@/components/exercise-thumb';
import MuscleMap from '@/components/muscle-map';
import { useRepzyColors } from '@/constants/repzy-colors';
import { EXERCISE_LIBRARY, GROUP_BODY, MUSCLE_GROUPS, searchExercises } from '@/lib/exercise-library';
import { useFavorites } from '@/lib/favorites';

type Picked = { name: string; gif: string | null };

type Props = {
  addedNames?: string[];
  onPick?: (exercise: Picked) => void; // omit for browse-only mode (tapping opens the info page)
  onInfo: (name: string) => void;
  onCancel: () => void;
  title?: string;
  cancelLabel?: string;
};

const FAVOURITES = '★ Favourites';

export default function ExercisePicker({
  addedNames = [],
  onPick,
  onInfo,
  onCancel,
  title = 'Add exercise',
  cancelLabel = 'Cancel',
}: Props) {
  const c = useRepzyColors();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const { isFavorite, toggleFavorite, favorites } = useFavorites();

  const results =
    group === FAVOURITES
      ? searchExercises(query, 'All').filter((e) => favorites.has(e.name.toLowerCase()))
      : searchExercises(query, group);
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
        { text: 'Create', onPress: () => onPick?.({ name: trimmed, gif: null }) },
      ],
    );
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={[styles.headerSide, { color: c.subtext }]}>{cancelLabel}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.text }]}>{title}</Text>
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
        {[FAVOURITES, ...MUSCLE_GROUPS].map((g) => {
          const selected = g === group;
          const body = GROUP_BODY[g];
          const label = g === FAVOURITES ? 'Favourites' : g;
          return (
            <Pressable
              key={g}
              onPress={() => setGroup(g)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${label}`}
              style={styles.chip}>
              <View
                style={[
                  styles.chipPicture,
                  { backgroundColor: c.inputBg, borderColor: selected ? c.accent : 'transparent' },
                ]}>
                {body ? (
                  <MuscleMap primary={body.slugs} secondary={[]} height={46} side={body.side} />
                ) : (
                  <Text style={styles.chipEmoji}>{g === FAVOURITES ? '★' : '❤️'}</Text>
                )}
              </View>
              <Text
                style={[styles.chipLabel, { color: selected ? c.accent : c.text, fontWeight: selected ? '800' : '600' }]}
                numberOfLines={1}>
                {label}
              </Text>
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
                onPress={() => (onPick ? onPick({ name: item.name, gif: item.gif }) : onInfo(item.name))}
                disabled={isAdded}
                style={({ pressed }) => [styles.rowMain, { opacity: isAdded ? 0.45 : pressed ? 0.6 : 1 }]}>
                <ExerciseThumb gif={item.gif} size={64} />
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
                onPress={() => toggleFavorite(item.name)}
                hitSlop={8}
                accessibilityLabel={isFavorite(item.name) ? 'Remove from favourites' : 'Add to favourites'}>
                <Text style={[styles.star, { color: isFavorite(item.name) ? c.gold : c.subtext }]}>
                  {isFavorite(item.name) ? '★' : '☆'}
                </Text>
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
          <Text style={[styles.empty, { color: c.subtext }]}>
            {group === FAVOURITES
              ? 'No favourites yet. Tap ☆ next to an exercise to save it here.'
              : 'No exercises found. Try a different word.'}
          </Text>
        }
        ListFooterComponent={
          <>
            {canCreate && onPick ? (
              <Pressable onPress={createCustom} style={[styles.createButton, { borderColor: c.accent }]}>
                <Text style={{ color: c.accent, fontWeight: '700' }}>+ Create "{trimmed}" as a custom exercise</Text>
              </Pressable>
            ) : null}
            <Text style={[styles.credit, { color: c.subtext }]}>Exercise animations by ExerciseDB</Text>
          </>
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
  chipRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 10, alignItems: 'flex-start' },
  chip: { width: 64, alignItems: 'center', gap: 4 },
  chipPicture: {
    width: 60,
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipEmoji: { fontSize: 24, color: '#F5B301' },
  chipLabel: { fontSize: 11 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  star: { fontSize: 24, paddingHorizontal: 2 },
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
  credit: { textAlign: 'center', fontSize: 11, marginTop: 20 },
  createButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
});
