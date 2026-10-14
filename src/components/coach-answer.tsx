import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { RepzyColors } from '@/constants/repzy-colors';
import type { CoachReply } from '@/lib/coach/chat';
import type { Program } from '@/lib/coach/program';
import { formatRest } from '@/components/rest-picker';
import { saveRoutine } from '@/lib/routines';

// A coach answer: RECOMMENDATION, WHY, the data it used, and what data is missing.

export default function CoachAnswerCard({
  reply,
  colors: c,
  onInfo,
  onRoutinesSaved,
}: {
  reply: CoachReply;
  colors: RepzyColors;
  onInfo: (name: string) => void;
  onRoutinesSaved: () => void;
}) {
  const { answer, program } = reply;
  const [showData, setShowData] = useState(false);
  const structured = answer.why.length > 0 || answer.evidence.length > 0;

  if (!structured && !program) {
    return <Text style={[styles.plain, { color: c.text }]}>{answer.recommendation}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: c.accent }]}>
        {answer.intent === 'help' ? 'COACH' : 'RECOMMENDATION'}
      </Text>
      <Text style={[styles.recommendation, { color: c.text }]}>{answer.recommendation}</Text>

      {answer.why.length > 0 && (
        <>
          <Text style={[styles.label, { color: c.subtext }]}>{answer.intent === 'help' ? 'TRY ASKING' : 'WHY'}</Text>
          {answer.why.map((w, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: c.subtext }]}>•</Text>
              <Text style={[styles.body, { color: c.text }]}>{w}</Text>
            </View>
          ))}
        </>
      )}

      {program && <ProgramView program={program} colors={c} onSaved={onRoutinesSaved} />}

      {answer.evidence.length > 0 && (
        <>
          <Pressable onPress={() => setShowData((v) => !v)} hitSlop={6} accessibilityRole="button">
            <Text style={[styles.toggle, { color: c.accent }]}>
              {showData ? '▾' : '▸'} Data used ({answer.evidence.length})
            </Text>
          </Pressable>
          {showData && (
            <View style={[styles.evidence, { borderColor: c.border }]}>
              {answer.evidence.map((e, i) => (
                <View key={i} style={styles.evidenceRow}>
                  <Text style={[styles.evidenceLabel, { color: c.subtext }]}>{e.label}</Text>
                  <Text style={[styles.evidenceValue, { color: c.text }]}>{e.value}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {answer.missing.length > 0 && (
        <View style={[styles.missing, { backgroundColor: c.inputBg }]}>
          <Text style={[styles.small, { color: c.subtext, fontWeight: '700' }]}>Not in your data yet</Text>
          {answer.missing.map((m, i) => (
            <Text key={i} style={[styles.small, { color: c.subtext }]}>
              {m}
            </Text>
          ))}
        </View>
      )}

      {answer.exercise ? (
        <Pressable onPress={() => onInfo(answer.exercise as string)} hitSlop={6}>
          <Text style={[styles.toggle, { color: c.accent }]}>View {answer.exercise} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProgramView({ program, colors: c, onSaved }: { program: Program; colors: RepzyColors; onSaved: () => void }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState('saving');
    setError(null);
    let saved = 0;
    try {
      for (const day of program.days) {
        await saveRoutine({
          name: `${day.name} · ${program.daysPerWeek}-Day ${program.goal === 'strength' ? 'Strength' : 'Hypertrophy'}`,
          notes: `Built by Repzy Coach: ${program.name}.`,
          exercises: day.exercises.map((e) => ({
            exercise_name: e.name,
            target_sets: e.sets,
            rep_min: e.repMin,
            rep_max: e.repMax,
            rest_seconds: e.restSeconds,
            notes: null,
          })),
        });
        saved++;
      }
      setState('saved');
      onSaved();
    } catch (e: any) {
      setState('idle');
      setError(`${saved > 0 ? `Saved ${saved} of ${program.days.length} days. ` : ''}${e?.message ?? 'Could not save.'}`);
    }
  }

  return (
    <View style={styles.program}>
      {program.days.map((day) => (
        <View key={day.name} style={[styles.day, { borderColor: c.border }]}>
          <Text style={[styles.dayName, { color: c.text }]}>{day.name}</Text>
          {day.exercises.map((e) => (
            <View key={e.name} style={styles.dayRow}>
              <Text style={[styles.body, { color: c.text, flex: 1 }]} numberOfLines={2}>
                {e.name}
              </Text>
              <View style={styles.dayRight}>
                <Text style={[styles.small, { color: c.text, fontWeight: '700' }]}>
                  {e.sets} × {e.repMin}–{e.repMax}
                </Text>
                <Text style={[styles.small, { color: c.subtext }]}>
                  {e.start ? `start ${e.start}` : `rest ${formatRest(e.restSeconds)}`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
      <Pressable
        onPress={save}
        disabled={state !== 'idle'}
        style={({ pressed }) => [
          styles.saveButton,
          { backgroundColor: state === 'saved' ? c.success : c.accent, opacity: pressed || state === 'saving' ? 0.7 : 1 },
        ]}>
        {state === 'saving' ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveText}>
            {state === 'saved' ? '✓ Saved to Workouts › Routines' : `Save as ${program.days.length} routines`}
          </Text>
        )}
      </Pressable>
      {error && <Text style={{ color: c.error }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  plain: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginTop: 4 },
  recommendation: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  bulletRow: { flexDirection: 'row', gap: 6 },
  bullet: { fontSize: 15, lineHeight: 20 },
  body: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  small: { fontSize: 12, lineHeight: 17 },
  toggle: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  evidence: { borderLeftWidth: 2, paddingLeft: 10, gap: 6 },
  evidenceRow: { gap: 1 },
  evidenceLabel: { fontSize: 12, fontWeight: '700' },
  evidenceValue: { fontSize: 13, lineHeight: 18 },
  missing: { borderRadius: 10, padding: 10, gap: 3, marginTop: 4 },
  program: { gap: 8, marginTop: 6 },
  day: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  dayName: { fontSize: 15, fontWeight: '800' },
  dayRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dayRight: { alignItems: 'flex-end' },
  saveButton: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
