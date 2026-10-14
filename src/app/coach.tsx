import { useFocusEffect } from 'expo-router';
import { Dispatch, SetStateAction, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader, { ActiveWorkoutBanner } from '@/components/app-header';
import CoachAnswerCard from '@/components/coach-answer';
import DailyCheckIn from '@/components/daily-checkin';
import ExerciseInfo from '@/components/exercise-info';
import ExerciseThumb from '@/components/exercise-thumb';
import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import { recoveryStats, signedPct } from '@/lib/coach/analysis';
import { answerCoach, CoachContext, CoachReply, QUICK_QUESTIONS } from '@/lib/coach/chat';
import { CoachData, fetchCoachData } from '@/lib/coach/data';
import {
  adaptivePlan,
  CoachExercise,
  FatigueLevel,
  fatigueStatus,
  predictStrength,
  recommendNext,
  weeklyGroupVolume,
  WEEKLY_SET_TARGET,
} from '@/lib/coach/engine';
import { EXERCISE_LIBRARY, findLibraryExercise } from '@/lib/exercise-library';
import { useWorkoutSession } from '@/lib/workout-session';

type Section = 'overview' | 'chat';
type Message = { id: string; from: 'me'; text: string } | { id: string; from: 'coach'; reply: CoachReply };

const DAY = 24 * 60 * 60 * 1000;

function contextFor(data: CoachData, fatigue: ReturnType<typeof fatigueStatus>, now: Date): CoachContext {
  return {
    exercises: data.exercises,
    loads: data.loads,
    fatigue,
    daily: data.daily,
    dailyAvailable: data.dailyAvailable,
    targets: data.targets,
    library: EXERCISE_LIBRARY,
    now,
  };
}

function levelColor(level: FatigueLevel, c: RepzyColors) {
  if (level === 'high') return c.error;
  if (level === 'elevated') return c.gold;
  if (level === 'optimal') return c.success;
  if (level === 'low') return c.accent;
  return c.subtext;
}

// The exercises worth showing targets for: done in the last 30 days, most-done first
function topExercises(exercises: CoachExercise[], now: Date) {
  return exercises
    .filter((e) => e.sessions.some((s) => now.getTime() - new Date(s.date).getTime() < 30 * DAY))
    .sort((a, b) => {
      const recent = (e: CoachExercise) =>
        e.sessions.filter((s) => now.getTime() - new Date(s.date).getTime() < 30 * DAY).length;
      return recent(b) - recent(a) || b.sessions.length - a.sessions.length;
    })
    .slice(0, 6);
}

export default function CoachScreen() {
  const c = useRepzyColors();
  const { savedVersion } = useWorkoutSession();
  const [section, setSection] = useState<Section>('overview');
  const [data, setData] = useState<CoachData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  // kept here so the conversation survives switching to Overview and back
  const [messages, setMessages] = useState<Message[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const loaded = await fetchCoachData();
      setNow(new Date());
      setData(loaded);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your workouts');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, savedVersion]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const fatigue = useMemo(() => (data ? fatigueStatus(data.loads, data.exercises, now) : null), [data, now]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]} edges={['top']}>
      <AppHeader title="Coach" subtitle="Answers from your own data" />
      <ActiveWorkoutBanner />

      <View style={[styles.tabs, { backgroundColor: c.inputBg }]}>
        {(['overview', 'chat'] as Section[]).map((s) => (
          <Pressable
            key={s}
            onPress={() => setSection(s)}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === s }}
            style={[styles.tab, section === s && { backgroundColor: c.card }]}>
            <Text style={{ color: section === s ? c.text : c.subtext, fontWeight: '700', fontSize: 13 }}>
              {s === 'overview' ? 'Overview' : 'Ask the coach'}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <Text style={{ color: c.error, textAlign: 'center' }}>{error}</Text>
          <Text style={{ color: c.subtext, textAlign: 'center' }}>Pull down to try again.</Text>
        </ScrollView>
      ) : !data || !fatigue ? (
        <ActivityIndicator style={styles.loading} />
      ) : section === 'overview' ? (
        <Overview
          data={data}
          fatigue={fatigue}
          now={now}
          colors={c}
          refreshing={refreshing}
          onRefresh={refresh}
          onInfo={setInfoFor}
          onAsk={() => setSection('chat')}
          onReload={load}
        />
      ) : (
        <Chat
          data={data}
          fatigue={fatigue}
          now={now}
          colors={c}
          onInfo={setInfoFor}
          messages={messages}
          setMessages={setMessages}
          onReload={load}
        />
      )}

      {infoFor && <ExerciseInfo name={infoFor} onClose={() => setInfoFor(null)} />}
    </SafeAreaView>
  );
}

// ---------- Overview ----------

function Overview({
  data,
  fatigue,
  now,
  colors: c,
  refreshing,
  onRefresh,
  onInfo,
  onAsk,
  onReload,
}: {
  data: CoachData;
  fatigue: ReturnType<typeof fatigueStatus>;
  now: Date;
  colors: RepzyColors;
  refreshing: boolean;
  onRefresh: () => void;
  onInfo: (name: string) => void;
  onAsk: () => void;
  onReload: () => void;
}) {
  const [checkingIn, setCheckingIn] = useState(false);
  const recovery = useMemo(() => recoveryStats(contextFor(data, fatigue, now)), [data, fatigue, now]);
  const checkInCard = (
    <CheckInCard
      available={data.dailyAvailable}
      recovery={recovery}
      colors={c}
      onPress={() => setCheckingIn(true)}
    />
  );
  const checkInModal = checkingIn ? (
    <DailyCheckIn today={recovery.today} onClose={() => setCheckingIn(false)} onSaved={onReload} />
  ) : null;
  const plan = useMemo(() => adaptivePlan(data.exercises, fatigue, now), [data, fatigue, now]);
  const volume = useMemo(() => weeklyGroupVolume(data.exercises, now), [data, now]);
  const top = useMemo(() => topExercises(data.exercises, now), [data, now]);
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />;

  if (data.exercises.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
        <View style={styles.centerBlock}>
          <Text style={styles.bigEmoji}>🧠</Text>
          <Text style={[styles.emptyText, { color: c.text }]}>
            Log a workout and your coach will start tracking your strength, recommending weights and reps, predicting
            your progress and watching your fatigue.
          </Text>
        </View>
        {checkInCard}
        <Pressable
          onPress={onAsk}
          style={({ pressed }) => [styles.askButton, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={styles.askText}>💬 Ask the coach for a program</Text>
        </Pressable>
        {checkInModal}
      </ScrollView>
    );
  }

  const levelC = levelColor(fatigue.level, c);
  const maxSets = Math.max(WEEKLY_SET_TARGET.max, ...volume.map((v) => v.sets));

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
      {checkInCard}
      {checkInModal}

      {/* Readiness */}
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.cardLabel, { color: c.subtext }]}>READINESS</Text>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: levelC }]} />
          <Text style={[styles.cardTitle, { color: c.text }]}>{fatigue.headline}</Text>
        </View>
        <Text style={[styles.body, { color: c.subtext }]}>{fatigue.explanation}</Text>
        {fatigue.level !== 'not_enough_data' && (
          <View style={styles.stats}>
            <Stat value={String(fatigue.acuteSets)} label="Hard sets, 7 days" colors={c} />
            <Stat value={String(fatigue.chronicWeeklySets)} label="Your usual week" colors={c} />
            <Stat
              value={fatigue.daysSinceLastWorkout == null ? '–' : String(fatigue.daysSinceLastWorkout)}
              label="Days since workout"
              colors={c}
            />
          </View>
        )}
      </View>

      {/* This week */}
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.cardLabel, { color: c.subtext }]}>THIS WEEK</Text>
        {plan.focusGroups.length > 0 && (
          <Text style={[styles.cardTitle, { color: c.text }]}>Focus: {plan.focusGroups.join(' & ')}</Text>
        )}
        <Text style={[styles.body, { color: c.subtext }]}>{plan.weekAdvice}</Text>
      </View>

      {/* Next session targets */}
      {top.length > 0 && (
        <View style={[styles.card, { backgroundColor: c.card }]}>
          <Text style={[styles.cardLabel, { color: c.subtext }]}>NEXT SESSION TARGETS</Text>
          {top.map((ex) => {
            const rec = recommendNext(ex, { target: data.targets.get(ex.name.toLowerCase()), fatigue: fatigue.level });
            const p = predictStrength(ex, now);
            return (
              <Pressable
                key={ex.name}
                onPress={() => onInfo(ex.name)}
                accessibilityRole="button"
                accessibilityLabel={`${ex.name}: ${rec.headline}. Open exercise info`}
                style={({ pressed }) => [styles.target, { borderTopColor: c.border, opacity: pressed ? 0.7 : 1 }]}>
                <ExerciseThumb gif={findLibraryExercise(ex.name)?.gif ?? null} size={44} />
                <View style={styles.flex}>
                  <Text style={[styles.exName, { color: c.text }]} numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <Text style={[styles.headline, { color: c.accent }]}>{rec.headline}</Text>
                  <Text style={[styles.small, { color: c.subtext }]} numberOfLines={3}>
                    {rec.reason}
                  </Text>
                  {!('notEnoughData' in p) && (
                    <Text style={[styles.small, { color: c.text }]}>
                      {p.trend === 'up' ? '📈' : p.trend === 'down' ? '📉' : '➖'} Est. 1RM {p.current} → {p.predicted} kg in 4
                      weeks · {p.confidence} confidence
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Weekly sets per muscle group */}
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.cardLabel, { color: c.subtext }]}>HARD SETS PER MUSCLE · LAST 7 DAYS</Text>
        <Text style={[styles.small, { color: c.subtext }]}>
          Shaded band = {WEEKLY_SET_TARGET.min}–{WEEKLY_SET_TARGET.max} sets, a common target for growth. Warm-ups
          don&apos;t count.
        </Text>
        {volume.map((v) => (
          <View key={v.group} style={styles.volRow} accessibilityLabel={`${v.group}: ${v.sets} sets`}>
            <Text style={[styles.volLabel, { color: c.text }]}>{v.group}</Text>
            <View style={[styles.volTrack, { backgroundColor: c.inputBg }]}>
              <View
                style={[
                  styles.volBand,
                  {
                    left: `${(WEEKLY_SET_TARGET.min / maxSets) * 100}%`,
                    width: `${((WEEKLY_SET_TARGET.max - WEEKLY_SET_TARGET.min) / maxSets) * 100}%`,
                    backgroundColor: c.successSoft,
                  },
                ]}
              />
              <View
                style={[
                  styles.volFill,
                  {
                    width: `${(v.sets / maxSets) * 100}%`,
                    backgroundColor: v.status === 'in_range' ? c.success : v.status === 'over' ? c.gold : c.accent,
                  },
                ]}
              />
            </View>
            <Text style={[styles.volValue, { color: c.text }]}>{v.sets}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={onAsk}
        style={({ pressed }) => [styles.askButton, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={styles.askText}>💬 Ask the coach</Text>
      </Pressable>

      <Text style={[styles.disclaimer, { color: c.subtext }]}>
        Based on {data.workoutCount} workout{data.workoutCount === 1 ? '' : 's'} and {data.daily.length} check-in
        {data.daily.length === 1 ? '' : 's'} from the last 120 days. The coach applies standard training rules (double
        progression, estimated 1RM, effort, training load) to your data and shows the numbers behind every answer.
        Predictions are estimates. Listen to your body; this isn&apos;t medical advice.
      </Text>
    </ScrollView>
  );
}

function Stat({ value, label, colors: c }: { value: string; label: string; colors: RepzyColors }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.subtext }]}>{label}</Text>
    </View>
  );
}

function CheckInCard({
  available,
  recovery: r,
  colors: c,
  onPress,
}: {
  available: boolean;
  recovery: ReturnType<typeof recoveryStats>;
  colors: RepzyColors;
  onPress: () => void;
}) {
  if (!available) {
    return (
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.cardLabel, { color: c.subtext }]}>DAILY CHECK-IN</Text>
        <Text style={[styles.body, { color: c.subtext }]}>
          Bodyweight, food and recovery tracking needs the latest database update. Run the SQL from the update notes,
          then pull to refresh.
        </Text>
      </View>
    );
  }
  const t = r.today;
  const parts = t
    ? [
        t.sleep != null ? `😴 ${t.sleep} h` : null,
        t.soreness != null ? `💢 sore ${t.soreness}/5` : null,
        t.energy != null ? `⚡ energy ${t.energy}/5` : null,
        t.bodyweight != null ? `⚖️ ${t.bodyweight} kg` : null,
        t.calories != null ? `🍽 ${t.calories} kcal` : null,
        t.protein != null ? `🥩 ${t.protein} g protein` : null,
      ].filter(Boolean)
    : [];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { backgroundColor: c.card, opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.cardLabel, { color: c.subtext }]}>TODAY&apos;S CHECK-IN</Text>
        <Text style={{ color: c.accent, fontWeight: '800' }}>{t ? 'Edit' : 'Check in ›'}</Text>
      </View>
      {parts.length > 0 ? (
        <Text style={[styles.body, { color: c.text }]}>{parts.join('   ')}</Text>
      ) : (
        <Text style={[styles.body, { color: c.subtext }]}>
          Log sleep, soreness, energy, bodyweight and food so the coach can explain your progress, not just measure it.
        </Text>
      )}
      {(r.bodyweight || r.sleepRecent != null) && (
        <Text style={[styles.small, { color: c.subtext }]}>
          {[
            r.bodyweight
              ? `Bodyweight ${signedPct(r.bodyweight.changePct)} over 30 days (${r.bodyweight.first.bodyweight} → ${r.bodyweight.last.bodyweight} kg)`
              : null,
            r.sleepRecent != null ? `Sleep this week: ${r.sleepRecent} h avg` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}
    </Pressable>
  );
}

// ---------- Chat ----------

let messageId = 0;
const nextId = () => String(++messageId);

function Chat({
  data,
  fatigue,
  now,
  colors: c,
  onInfo,
  messages: history,
  setMessages,
  onReload,
}: {
  data: CoachData;
  fatigue: ReturnType<typeof fatigueStatus>;
  now: Date;
  colors: RepzyColors;
  onInfo: (name: string) => void;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  onReload: () => void;
}) {
  const greeting: Message = {
    id: 'hello',
    from: 'coach',
    reply: answerCoach('help', contextFor(data, fatigue, now)),
  };
  const messages = [greeting, ...history];
  const [text, setText] = useState('');
  const list = useRef<FlatList<Message>>(null);

  function ask(question: string) {
    const q = question.trim();
    if (!q) return;
    const reply = answerCoach(q, contextFor(data, fatigue, now));
    setMessages((m) => [...m, { id: nextId(), from: 'me', text: q }, { id: nextId(), from: 'coach', reply }]);
    setText('');
    // show your question at the top, so a long answer reads from its start
    const index = messages.length; // greeting + history; the new question lands here
    setTimeout(() => list.current?.scrollToIndex({ index, viewPosition: 0, animated: true }), 120);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={() => list.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) =>
          item.from === 'me' ? (
            <View style={[styles.bubble, styles.mine, { backgroundColor: c.accent }]}>
              <Text style={{ color: '#fff', fontSize: 15, lineHeight: 21 }}>{item.text}</Text>
            </View>
          ) : (
            <View style={[styles.bubble, styles.theirs, styles.coachBubble, { backgroundColor: c.card }]}>
              <CoachAnswerCard reply={item.reply} colors={c} onInfo={onInfo} onRoutinesSaved={onReload} />
            </View>
          )
        }
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}>
        {QUICK_QUESTIONS.map((q) => (
          <Pressable
            key={q}
            onPress={() => ask(q)}
            style={({ pressed }) => [styles.chip, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}>
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>{q}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.inputRow, { borderTopColor: c.border }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message your coach…"
          placeholderTextColor={c.subtext}
          style={[styles.input, { backgroundColor: c.inputBg, color: c.text }]}
          returnKeyType="send"
          onSubmitEditing={() => ask(text)}
          maxLength={300}
        />
        <Pressable
          onPress={() => ask(text)}
          disabled={!text.trim()}
          accessibilityLabel="Send"
          style={[styles.send, { backgroundColor: c.accent, opacity: text.trim() ? 1 : 0.4 }]}>
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: 40 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  bigEmoji: { fontSize: 48 },
  centerBlock: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coachBubble: { maxWidth: '94%' },
  emptyText: { fontSize: 16, textAlign: 'center', lineHeight: 23 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 3 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 18, padding: 16, gap: 8 },
  cardLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  stats: { flexDirection: 'row', marginTop: 4 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, textAlign: 'center' },
  target: { flexDirection: 'row', gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  exName: { fontSize: 15, fontWeight: '700' },
  headline: { fontSize: 16, fontWeight: '800' },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volLabel: { width: 74, fontSize: 13, fontWeight: '600' },
  volTrack: { flex: 1, height: 12, borderRadius: 6, overflow: 'hidden' },
  volBand: { position: 'absolute', top: 0, bottom: 0 },
  volFill: { height: 12, borderRadius: 6 },
  volValue: { width: 26, textAlign: 'right', fontWeight: '700' },
  askButton: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  askText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disclaimer: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
  messages: { padding: 16, gap: 10 },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: 12, gap: 8, paddingVertical: 6 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
