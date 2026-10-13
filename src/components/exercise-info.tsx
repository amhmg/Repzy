import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';

import ExerciseHistory from '@/components/exercise-history';
import MuscleMap from '@/components/muscle-map';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { findLibraryExercise } from '@/lib/exercise-library';

type Props = {
  name: string;
  onClose: () => void;
};

export default function ExerciseInfo({ name, onClose }: Props) {
  const c = useRepzyColors();
  const dark = useColorScheme() === 'dark';
  const secondaryColor = dark ? '#9C4A28' : '#FFB08F';
  const ex = findLibraryExercise(name);

  return (
    <View style={[styles.overlay, { backgroundColor: c.background }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
          {name}
        </Text>
        <Pressable onPress={onClose} hitSlop={12} style={[styles.close, { backgroundColor: c.inputBg }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {ex ? (
          <>
            {ex.gif ? (
              <View style={styles.gifCard}>
                <Image
                  source={{ uri: ex.gif }}
                  style={styles.gif}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={150}
                />
              </View>
            ) : null}

            <View style={[styles.mapCard, { backgroundColor: c.card }]}>
              <MuscleMap primary={ex.primary} secondary={ex.secondary} height={220} />
              <View style={styles.legend}>
                <LegendDot color={c.accent} label="Main muscles" colors={c} />
                {ex.secondary.length > 0 && <LegendDot color={secondaryColor} label="Supporting" colors={c} />}
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: c.text }]}>Main muscles</Text>
            <View style={styles.chipRow}>
              {ex.primaryNames.map((m) => (
                <View key={m} style={[styles.chip, { backgroundColor: c.accent }]}>
                  <Text style={styles.chipTextStrong}>{m}</Text>
                </View>
              ))}
            </View>

            {ex.secondaryNames.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: c.text }]}>Also works</Text>
                <View style={styles.chipRow}>
                  {ex.secondaryNames.map((m) => (
                    <View key={m} style={[styles.chip, { backgroundColor: c.accentSoft }]}>
                      <Text style={[styles.chipText, { color: c.accent }]}>{m}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={[styles.factsCard, { backgroundColor: c.card }]}>
              <Fact label="Muscle group" value={ex.group} colors={c} />
              <Fact label="Equipment" value={ex.equipment} colors={c} />
              {ex.level ? <Fact label="Level" value={ex.level} colors={c} /> : null}
              {ex.mechanic ? <Fact label="Type" value={ex.mechanic} colors={c} /> : null}
            </View>

            <Text style={[styles.sectionTitle, { color: c.text }]}>How to do it</Text>
            {ex.instructions.length > 0 ? (
              ex.instructions.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepNumber, { backgroundColor: c.accentSoft }]}>
                    <Text style={{ color: c.accent, fontWeight: '800' }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: c.text }]}>{step}</Text>
                </View>
              ))
            ) : (
              <Text style={{ color: c.subtext }}>No instructions available for this exercise yet.</Text>
            )}
          </>
        ) : (
          <View style={styles.custom}>
            <Text style={{ fontSize: 40 }}>🏋️</Text>
            <Text style={[styles.customText, { color: c.subtext }]}>
              This is a custom exercise, so there&apos;s no guide for it yet.
            </Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: c.text }]}>Your history</Text>
        <ExerciseHistory name={name} />

        {ex ? (
          <Text style={[styles.credit, { color: c.subtext }]}>
            Exercise animation and instructions by ExerciseDB (exercisedb.dev)
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function LegendDot({ color, label, colors }: { color: string; label: string; colors: RepzyColors }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={{ color: colors.subtext, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function Fact({ label, value, colors }: { label: string; value: string; colors: RepzyColors }) {
  return (
    <View style={styles.fact}>
      <Text style={{ color: colors.subtext, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{value}</Text>
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
    zIndex: 10,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: 19, fontWeight: '800' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  gifCard: { backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden', alignItems: 'center' },
  gif: { width: '100%', aspectRatio: 1, maxHeight: 320 },
  mapCard: { borderRadius: 20, paddingVertical: 20, alignItems: 'center', gap: 14 },
  legend: { flexDirection: 'row', gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  chipTextStrong: { color: '#FFFFFF', fontWeight: '700' },
  chipText: { fontWeight: '700' },
  factsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginTop: 8,
    rowGap: 12,
  },
  fact: { width: '50%', paddingHorizontal: 8, gap: 2 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22 },
  custom: { alignItems: 'center', padding: 24, gap: 12 },
  customText: { textAlign: 'center', fontSize: 15 },
  credit: { fontSize: 11, textAlign: 'center', marginTop: 16 },
});
