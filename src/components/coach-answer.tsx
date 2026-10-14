import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { RepzyColors } from '@/constants/repzy-colors';
import type { CoachReply } from '@/lib/coach/chat';
import type { Program, ProgramDay } from '@/lib/coach/program';
import { formatRest } from '@/components/rest-picker';
import RoutineEditor from '@/components/routine-editor';
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

// Remembers which days were added even if the chat list unmounts this card while scrolling
const addedDays = new WeakMap<Program, Set<string>>();

function ProgramView({ program, colors: c, onSaved }: { program: Program; colors: RepzyColors; onSaved: () => void }) {
  const [editing, setEditing] = useState<string | null>(null); // day being reviewed in the routine editor
  const [added, setAddedState] = useState<Set<string>>(() => addedDays.get(program) ?? new Set());
  const setAdded = (update: (s: Set<string>) => Set<string>) =>
    setAddedState((prev) => {
      const next = update(prev);
      addedDays.set(program, next);
      return next;
    });
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalLabel = program.goal === 'strength' ? 'Strength' : 'Hypertrophy';
  const notes = `Repzy Coach · ${program.name}\n${program.weekPlan.join('\n')}`.slice(0, 1000);
  const routineFor = (day: ProgramDay) => ({
    name: `${day.name} · ${program.weeks}-Wk ${goalLabel}`.slice(0, 60),
    notes,
    exercises: day.exercises.map((e) => ({
      exercise_name: e.name,
      target_sets: e.sets,
      rep_min: e.repMin,
      rep_max: e.repMax,
      rest_seconds: e.restSeconds,
      notes: e.start ? `Coach start: ${e.start}` : null,
    })),
  });

  async function addAll() {
    setSavingAll(true);
    setError(null);
    try {
      for (const day of program.days) {
        if (added.has(day.name)) continue;
        await saveRoutine(routineFor(day));
        setAdded((s) => new Set(s).add(day.name));
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Could not add the routines.');
    } finally {
      setSavingAll(false);
    }
  }

  const editingDay = program.days.find((d) => d.name === editing);
  const allAdded = program.days.every((d) => added.has(d.name));

  return (
    <View style={styles.program}>
      {program.days.map((day) => {
        const isAdded = added.has(day.name);
        return (
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
            <Pressable
              onPress={() => setEditing(day.name)}
              disabled={isAdded}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: isAdded ? c.successSoft : c.accent, opacity: pressed ? 0.8 : 1 },
              ]}>
              <Text style={[styles.addText, { color: isAdded ? c.success : '#FFFFFF' }]}>
                {isAdded ? '✓ Added to your routines' : '+ Add routine'}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <View style={[styles.day, { borderColor: c.border }]}>
        <Text style={[styles.dayName, { color: c.text }]}>Week by week</Text>
        {program.weekPlan.map((w) => (
          <Text key={w} style={[styles.small, { color: c.text }]}>
            {w}
          </Text>
        ))}
      </View>

      {!allAdded && program.days.length > 1 && (
        <Pressable
          onPress={addAll}
          disabled={savingAll}
          style={({ pressed }) => [styles.saveButton, { borderColor: c.accent, opacity: pressed || savingAll ? 0.7 : 1 }]}>
          {savingAll ? (
            <ActivityIndicator />
          ) : (
            <Text style={[styles.saveText, { color: c.accent }]}>Add all {program.days.length} routines</Text>
          )}
        </Pressable>
      )}
      {allAdded && (
        <Text style={[styles.small, { color: c.success, textAlign: 'center' }]}>
          All days are in Workouts › Routines. Tap one there to start it.
        </Text>
      )}
      {error && <Text style={{ color: c.error }}>{error}</Text>}

      {editingDay && (
        <RoutineEditor
          draft={routineFor(editingDay)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setAdded((s) => new Set(s).add(editingDay.name));
            setEditing(null);
            onSaved();
          }}
        />
      )}
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
  addButton: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  addText: { fontWeight: '800', fontSize: 14 },
  saveButton: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5 },
  saveText: { fontWeight: '800', fontSize: 15 },
});
