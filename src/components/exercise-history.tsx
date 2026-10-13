import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import {
  ExerciseRecord,
  ExerciseSession,
  fetchExerciseHistory,
  fetchExerciseRecords,
  formatDay,
  formatSet,
} from '@/lib/history';
import { estimateOneRepMax, formatKg, RECORD_LABELS, RECORD_TYPES } from '@/lib/workout';

// Best effort of a session: estimated 1RM for weighted sets, most reps otherwise
function sessionBest(session: ExerciseSession) {
  const weighted = session.sets.filter((s) => s.weight != null && s.weight > 0);
  if (weighted.length > 0) {
    return { value: Math.max(...weighted.map((s) => estimateOneRepMax(s.weight as number, s.reps))), weighted: true };
  }
  return { value: Math.max(0, ...session.sets.map((s) => s.reps)), weighted: false };
}

export default function ExerciseHistory({ name }: { name: string }) {
  const c = useRepzyColors();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ExerciseSession[]>([]);
  const [records, setRecords] = useState<ExerciseRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchExerciseHistory(name), fetchExerciseRecords(name)])
      .then(([s, r]) => {
        if (cancelled) return;
        setSessions(s);
        setRecords(r);
      })
      .catch((e) => !cancelled && setError(e.message ?? 'Could not load your history'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (loading) return <ActivityIndicator style={styles.loading} />;
  if (error) return <Text style={{ color: c.error }}>{error}</Text>;
  if (sessions.length === 0) {
    return (
      <Text style={{ color: c.subtext }}>
        You haven&apos;t logged this exercise yet. Your records and progress will show here.
      </Text>
    );
  }

  // Oldest to newest, last 10 sessions
  const chartSessions = [...sessions].slice(0, 10).reverse();
  const bests = chartSessions.map(sessionBest);
  const anyWeighted = bests.some((b) => b.weighted);
  const maxValue = Math.max(1, ...bests.map((b) => b.value));

  return (
    <View style={styles.wrap}>
      {records.length > 0 && (
        <View style={styles.recordRow}>
          {RECORD_TYPES.map((type) => {
            const r = records.find((x) => x.record_type === type);
            if (!r) return null;
            return (
              <View key={type} style={[styles.recordCard, { backgroundColor: c.card }]}>
                <Text style={[styles.recordValue, { color: c.gold }]}>🏆 {formatKg(r.value)}</Text>
                <Text style={[styles.recordLabel, { color: c.subtext }]}>{RECORD_LABELS[type]}</Text>
                {r.weight != null && r.reps != null && (
                  <Text style={[styles.recordLabel, { color: c.subtext }]}>
                    {r.weight} × {r.reps}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {chartSessions.length > 1 && (
        <View style={[styles.chartCard, { backgroundColor: c.card }]}>
          <Text style={[styles.chartTitle, { color: c.text }]}>
            {anyWeighted ? 'Best estimated 1RM per session' : 'Most reps per session'}
          </Text>
          <View style={styles.chart}>
            {bests.map((b, i) => (
              <View key={chartSessions[i].workout_id} style={styles.barCol}>
                {i === bests.length - 1 && (
                  <Text style={[styles.barValue, { color: c.accent }]}>
                    {anyWeighted ? Math.round(b.value) : b.value}
                  </Text>
                )}
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(6, (b.value / maxValue) * 100)}%`,
                      backgroundColor: i === bests.length - 1 ? c.accent : c.accentSoft,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        </View>
      )}

      <Text style={[styles.subTitle, { color: c.text }]}>Recent sessions</Text>
      {sessions.slice(0, 5).map((s) => (
        <SessionRow key={s.workout_id} session={s} colors={c} />
      ))}
    </View>
  );
}

function SessionRow({ session, colors }: { session: ExerciseSession; colors: RepzyColors }) {
  return (
    <View style={[styles.sessionRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.sessionDate, { color: colors.text }]}>{formatDay(new Date(session.t))}</Text>
      <Text style={[styles.sessionSets, { color: colors.subtext }]}>
        {session.sets.map(formatSet).join('  ·  ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: 16 },
  wrap: { gap: 12 },
  recordRow: { flexDirection: 'row', gap: 8 },
  recordCard: { flex: 1, borderRadius: 14, padding: 10, alignItems: 'center', gap: 2 },
  recordValue: { fontSize: 15, fontWeight: '800' },
  recordLabel: { fontSize: 11, textAlign: 'center' },
  chartCard: { borderRadius: 16, padding: 14, gap: 10 },
  chartTitle: { fontSize: 13, fontWeight: '700' },
  chart: { height: 110, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', borderRadius: 6 },
  barValue: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  subTitle: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  sessionRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  sessionDate: { fontSize: 14, fontWeight: '700' },
  sessionSets: { fontSize: 13 },
});
