// Repzy Coach engine.
//
// Pure functions over your logged workouts: no network, no app code, so every rule
// here can be unit-tested (see tests/coach-engine.test.ts). Everything returns plain
// data plus a short human explanation, and marks estimates as estimates.
//
// Rules in one place:
// - Warm-up sets never count toward strength, progression or fatigue.
// - "Working sets" are non-warm-up sets within 85% of the session's top weight.
// - Strength = best estimated 1RM per session (Epley: w × (1 + reps/30); 1 rep = actual).
// - Progression = double progression inside a rep range (routine target, or inferred).
// - Fatigue = acute:chronic training load (hard sets this week vs your weekly average
//   over the previous 4 weeks) plus whether your recent performances are dropping.

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure' | 'amrap' | 'backoff';

export type CoachSet = { weight: number | null; reps: number; type?: SetType; rpe?: number | null };

export type CoachSession = { date: string; sets: CoachSet[] }; // date = ISO string

export type CoachExercise = {
  name: string;
  group: string | null; // Chest, Back, Shoulders, Arms, Legs, Core, Cardio, Other
  equipment: string | null;
  sessions: CoachSession[]; // oldest first
};

export type RepRange = { min: number; max: number; source: 'routine' | 'inferred' };

export type FatigueLevel = 'not_enough_data' | 'low' | 'optimal' | 'elevated' | 'high';

const DAY = 24 * 60 * 60 * 1000;

// ---------- Basics ----------

export function epley(weight: number, reps: number) {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function isWarmup(s: CoachSet) {
  return s.type === 'warmup';
}

export function workingSets(sets: CoachSet[]): CoachSet[] {
  const real = sets.filter((s) => !isWarmup(s) && s.reps > 0);
  const top = Math.max(0, ...real.map((s) => s.weight ?? 0));
  if (top <= 0) return real; // bodyweight: every non-warm-up set counts
  return real.filter((s) => (s.weight ?? 0) >= top * 0.85);
}

export function sessionBestE1rm(session: CoachSession): number | null {
  const weighted = workingSets(session.sets).filter((s) => (s.weight ?? 0) > 0);
  if (weighted.length === 0) return null;
  return Math.max(...weighted.map((s) => epley(s.weight as number, s.reps)));
}

export function sessionBestReps(session: CoachSession): number {
  return Math.max(0, ...workingSets(session.sets).map((s) => s.reps));
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function roundTo(value: number, step: number) {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

// ---------- Strength prediction ----------

export type StrengthPrediction = {
  current: number; // estimated 1RM now (kg)
  predicted: number; // estimated 1RM after `horizonDays`
  horizonDays: number;
  weeklyChangePct: number; // trend, % per week
  trend: 'up' | 'flat' | 'down';
  confidence: 'low' | 'medium' | 'high';
  sessionsUsed: number;
  explanation: string;
};

// Weighted linear trend of your best e1RM per session (recent sessions count more),
// projected forward and capped to realistic rates (+2.5% / −5% per week).
export function predictStrength(
  exercise: CoachExercise,
  now: Date = new Date(),
  horizonDays = 28,
): StrengthPrediction | { notEnoughData: string } {
  const cutoff = now.getTime() - 120 * DAY;
  const points = exercise.sessions
    .filter((s) => new Date(s.date).getTime() >= cutoff)
    .map((s) => ({ t: new Date(s.date).getTime(), y: sessionBestE1rm(s) }))
    .filter((p): p is { t: number; y: number } => p.y != null)
    .slice(-10);

  if (points.length < 3) {
    return { notEnoughData: `Log ${exercise.name} with weight ${3 - points.length} more time${3 - points.length === 1 ? '' : 's'} to see a prediction.` };
  }
  const spanDays = (points[points.length - 1].t - points[0].t) / DAY;
  if (spanDays < 10) {
    return { notEnoughData: `Predictions need at least 10 days of ${exercise.name} history.` };
  }

  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / DAY);
  const ys = points.map((p) => p.y);
  const ws = points.map((_, i) => 1 + i / points.length); // newer points weigh more
  const sw = ws.reduce((a, b) => a + b, 0);
  const mx = xs.reduce((a, x, i) => a + ws[i] * x, 0) / sw;
  const my = ys.reduce((a, y, i) => a + ws[i] * y, 0) / sw;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += ws[i] * (xs[i] - mx) ** 2;
    sxy += ws[i] * (xs[i] - mx) * (ys[i] - my);
    syy += ws[i] * (ys[i] - my) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0; // kg per day
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;

  const lastX = xs[xs.length - 1];
  const fittedNow = my + slope * (lastX - mx);
  // anchor "now" between the fitted line and your actual latest result
  const current = Math.round(((fittedNow + ys[ys.length - 1]) / 2) * 10) / 10;

  const rawWeekly = current > 0 ? ((slope * 7) / current) * 100 : 0;
  const weeklyChangePct = Math.max(-5, Math.min(2.5, rawWeekly));
  const predicted = Math.round(current * (1 + (weeklyChangePct / 100) * (horizonDays / 7)) * 10) / 10;

  const trend: StrengthPrediction['trend'] = weeklyChangePct > 0.4 ? 'up' : weeklyChangePct < -0.4 ? 'down' : 'flat';
  const confidence: StrengthPrediction['confidence'] =
    points.length >= 6 && r2 >= 0.6 ? 'high' : r2 >= 0.3 && points.length >= 4 ? 'medium' : 'low';

  const capped = rawWeekly !== weeklyChangePct ? ' (capped to a realistic rate)' : '';
  const explanation =
    trend === 'up'
      ? `Your estimated 1RM is rising about ${weeklyChangePct.toFixed(1)}% a week across ${points.length} sessions${capped}. If that continues, you'd reach about ${predicted} kg in ${Math.round(horizonDays / 7)} weeks.`
      : trend === 'down'
        ? `Your estimated 1RM has dipped about ${Math.abs(weeklyChangePct).toFixed(1)}% a week recently${capped}. Rest, sleep and a lighter week usually turn this around.`
        : `Your strength on this lift has been steady over ${points.length} sessions. A small change (an extra set, or adding reps before weight) can restart progress.`;

  return { current, predicted, horizonDays, weeklyChangePct, trend, confidence, sessionsUsed: points.length, explanation };
}

// ---------- Recommendations (double progression) ----------

export function inferRepRange(exercise: CoachExercise, target?: { min: number | null; max: number | null }): RepRange {
  if (target?.min && target?.max) return { min: target.min, max: target.max, source: 'routine' };
  if (target?.min) return { min: target.min, max: target.min + 4, source: 'routine' };
  if (target?.max) return { min: Math.max(1, target.max - 4), max: target.max, source: 'routine' };

  const recent = exercise.sessions.slice(-3).flatMap((s) => workingSets(s.sets).map((x) => x.reps));
  const m = median(recent);
  if (m === 0) return { min: 8, max: 12, source: 'inferred' };
  if (m <= 5) return { min: 3, max: 6, source: 'inferred' };
  if (m <= 8) return { min: 6, max: 10, source: 'inferred' };
  if (m <= 12) return { min: 8, max: 12, source: 'inferred' };
  if (m <= 15) return { min: 12, max: 15, source: 'inferred' };
  return { min: 15, max: 20, source: 'inferred' };
}

// Smallest sensible jump for this kind of exercise (kg)
export function weightIncrement(exercise: Pick<CoachExercise, 'name' | 'equipment' | 'group'>): number {
  const name = exercise.name.toLowerCase();
  const eq = (exercise.equipment ?? '').toLowerCase();
  if (eq.includes('body') || eq.includes('assisted')) return 0;
  if (eq.includes('dumbbell') || eq.includes('kettlebell') || name.includes('dumbbell')) return 2;
  const bigLower =
    exercise.group === 'Legs' ||
    /deadlift|squat|leg press|hip thrust|rdl/.test(name);
  if ((eq.includes('barbell') || eq.includes('sled') || eq.includes('trap bar') || name.includes('barbell')) && bigLower) return 5;
  return 2.5;
}

export type Recommendation = {
  action: 'start' | 'increase_weight' | 'add_reps' | 'hold' | 'deload' | 'harder_variation';
  weight: number | null; // kg per set (null for bodyweight)
  reps: number[]; // target reps per set
  repRange: RepRange;
  headline: string; // e.g. "80 kg × 9, 9, 8"
  reason: string;
};

function formatTarget(weight: number | null, reps: number[]) {
  const r = reps.join(', ');
  return weight && weight > 0 ? `${weight} kg × ${r}` : `${r} reps`;
}

export function recommendNext(
  exercise: CoachExercise,
  options: { target?: { min: number | null; max: number | null; sets?: number }; fatigue?: FatigueLevel } = {},
): Recommendation {
  const range = inferRepRange(exercise, options.target);
  const sessions = exercise.sessions.filter((s) => workingSets(s.sets).length > 0);
  const last = sessions[sessions.length - 1];

  if (!last) {
    return {
      action: 'start',
      weight: null,
      reps: Array(options.target?.sets ?? 3).fill(range.min),
      repRange: range,
      headline: `${options.target?.sets ?? 3} sets of ${range.min}–${range.max}`,
      reason: `No history yet. Pick a weight you can lift for ${range.max} reps with good form, then let the coach take it from there.`,
    };
  }

  const work = workingSets(last.sets);
  const top = Math.max(0, ...work.map((s) => s.weight ?? 0));
  const atTop = top > 0 ? work.filter((s) => (s.weight ?? 0) === top) : work;
  const setCount = options.target?.sets ?? Math.max(1, atTop.length);
  const lastReps = atTop.map((s) => s.reps);
  const inc = weightIncrement(exercise);
  const label = range.source === 'routine' ? 'your routine’s' : 'your usual';

  // Pad or trim last session's reps to the number of sets planned
  const base = Array.from({ length: setCount }, (_, i) => lastReps[i] ?? lastReps[lastReps.length - 1] ?? range.min);

  // 1) Fatigued: hold steady
  if (options.fatigue === 'high') {
    const sets = Math.max(1, setCount - 1);
    return {
      action: 'hold',
      weight: top || null,
      reps: base.slice(0, sets).map((r) => Math.min(r, range.max)),
      repRange: range,
      headline: formatTarget(top || null, base.slice(0, sets).map((r) => Math.min(r, range.max))),
      reason: 'Your recent training load is high, so hold the weight and do one set fewer. Progress resumes once you recover.',
    };
  }

  // 2) Missed the bottom of the range two sessions running at this weight: deload
  const prev = sessions[sessions.length - 2];
  const missedNow = lastReps.some((r) => r < range.min);
  const prevAtSame =
    prev && workingSets(prev.sets).filter((s) => (s.weight ?? 0) === top && top > 0);
  const missedBefore = !!prevAtSame && prevAtSame.length > 0 && prevAtSame.some((s) => s.reps < range.min);
  if (top > 0 && missedNow && missedBefore) {
    const lighter = Math.max(inc || 2.5, roundTo(top * 0.9, inc || 2.5));
    const reps = Array(setCount).fill(range.min + 1);
    return {
      action: 'deload',
      weight: lighter,
      reps,
      repRange: range,
      headline: formatTarget(lighter, reps),
      reason: `You fell short of ${range.min} reps at ${top} kg two sessions in a row. Drop about 10% and build back up through the range.`,
    };
  }

  // 3) Every working set hit the top of the range: progress
  const allTop = lastReps.length > 0 && lastReps.every((r) => r >= range.max);
  if (allTop) {
    if (top > 0 && inc > 0) {
      const heavier = Math.round((top + inc) * 10) / 10;
      const reps = Array(setCount).fill(range.min);
      return {
        action: 'increase_weight',
        weight: heavier,
        reps,
        repRange: range,
        headline: formatTarget(heavier, reps),
        reason: `You hit ${range.max} reps on every set at ${top} kg, the top of ${label} ${range.min}–${range.max} range. Add ${inc} kg and work back up.`,
      };
    }
    const reps = Array(setCount).fill(range.max);
    return {
      action: 'harder_variation',
      weight: top || null,
      reps,
      repRange: range,
      headline: formatTarget(top || null, reps),
      reason: `You're at ${range.max} reps on every set. Add weight (a belt or dumbbell) or switch to a harder variation to keep progressing.`,
    };
  }

  // 4) Otherwise: same weight, one more rep on sets below the top
  const reps = base.map((r) => Math.min(range.max, Math.max(range.min, r + 1)));
  return {
    action: 'add_reps',
    weight: top || null,
    reps,
    repRange: range,
    headline: formatTarget(top || null, reps),
    reason:
      top > 0
        ? `Stay at ${top} kg and aim for one more rep where you can. When every set reaches ${range.max}, the coach will add weight.`
        : `Aim for one more rep per set. When every set reaches ${range.max}, add weight or a harder variation.`,
  };
}

// ---------- Fatigue / readiness ----------

export type WorkoutLoad = { date: string; hardSets: number; volume: number };

export type FatigueStatus = {
  level: FatigueLevel;
  acuteSets: number; // hard sets in the last 7 days
  chronicWeeklySets: number; // average hard sets per week over the 4 weeks before
  ratio: number | null;
  droppingExercises: string[];
  daysSinceLastWorkout: number | null;
  headline: string;
  explanation: string;
};

export function fatigueStatus(
  workouts: WorkoutLoad[],
  exercises: CoachExercise[],
  now: Date = new Date(),
): FatigueStatus {
  const t = now.getTime();
  const age = (w: WorkoutLoad) => (t - new Date(w.date).getTime()) / DAY;
  const acute = workouts.filter((w) => age(w) < 7).reduce((n, w) => n + w.hardSets, 0);
  const chronicWindow = workouts.filter((w) => age(w) >= 7 && age(w) < 35);
  const chronicWeeks = new Set(chronicWindow.map((w) => Math.floor((age(w) - 7) / 7))).size;
  const chronic = chronicWindow.reduce((n, w) => n + w.hardSets, 0) / 4;
  const last = workouts.length ? Math.min(...workouts.map(age)) : null;
  const daysSinceLastWorkout = last == null ? null : Math.floor(last);

  // Exercises trained in the last 14 days whose latest result is >5% below their recent best
  const dropping: string[] = [];
  let checked = 0;
  for (const ex of exercises) {
    const recent = ex.sessions.filter((s) => (t - new Date(s.date).getTime()) / DAY < 14);
    if (recent.length === 0) continue;
    const bests = ex.sessions.slice(-4).map(sessionBestE1rm).filter((v): v is number => v != null);
    if (bests.length < 3) continue;
    checked++;
    const latest = bests[bests.length - 1];
    const prior = Math.max(...bests.slice(0, -1));
    if (latest < prior * 0.95) dropping.push(ex.name);
  }
  const dropShare = checked >= 3 ? dropping.length / checked : 0;

  if (chronicWeeks < 2) {
    return {
      level: 'not_enough_data',
      acuteSets: acute,
      chronicWeeklySets: Math.round(chronic),
      ratio: null,
      droppingExercises: dropping,
      daysSinceLastWorkout,
      headline: 'Building your baseline',
      explanation:
        'Fatigue tracking compares this week with your usual weeks. Keep logging for 2–3 more weeks and it will switch on.',
    };
  }

  const ratio = chronic > 0 ? acute / chronic : acute > 0 ? 2 : 0;
  let level: FatigueLevel = 'optimal';
  if (ratio > 1.5 || dropShare >= 0.4) level = 'high';
  else if (ratio > 1.3 || dropShare >= 0.25) level = 'elevated';
  else if (ratio < 0.8) level = 'low';

  const loadText = `${acute} hard sets this week vs your usual ${Math.round(chronic)}`;
  const dropText = dropping.length ? ` Performance is down on ${dropping.slice(0, 3).join(', ')}.` : '';
  const copy: Record<Exclude<FatigueLevel, 'not_enough_data'>, [string, string]> = {
    high: ['High fatigue', `${loadText}.${dropText} Take a lighter session or a rest day before pushing again.`],
    elevated: ['Fatigue building', `${loadText}.${dropText} Train, but hold weights rather than chasing PRs.`],
    optimal: ['Ready to train', `${loadText}. Your load is in a healthy range, so it's a good day to push for progress.`],
    low: [
      daysSinceLastWorkout != null && daysSinceLastWorkout >= 7 ? 'Well rested' : 'Lighter week',
      `${loadText}. You're fresh, so it's a good time to go for a PR or add a set.`,
    ],
  };
  const [headline, explanation] = copy[level as Exclude<FatigueLevel, 'not_enough_data'>];

  return {
    level,
    acuteSets: acute,
    chronicWeeklySets: Math.round(chronic),
    ratio: Math.round(ratio * 100) / 100,
    droppingExercises: dropping,
    daysSinceLastWorkout,
    headline,
    explanation,
  };
}

// ---------- Weekly volume per muscle group ----------

export const TRACKED_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'];
// General guidance for building muscle: roughly 10–20 hard sets per muscle group per week
export const WEEKLY_SET_TARGET = { min: 10, max: 20 };

export type GroupVolume = { group: string; sets: number; status: 'none' | 'under' | 'in_range' | 'over'; lastTrainedDays: number | null };

export function weeklyGroupVolume(exercises: CoachExercise[], now: Date = new Date()): GroupVolume[] {
  const t = now.getTime();
  return TRACKED_GROUPS.map((group) => {
    let sets = 0;
    let last: number | null = null;
    for (const ex of exercises) {
      if (ex.group !== group) continue;
      for (const s of ex.sessions) {
        const age = (t - new Date(s.date).getTime()) / DAY;
        last = last == null ? age : Math.min(last, age);
        if (age < 7) sets += s.sets.filter((x) => !isWarmup(x)).length;
      }
    }
    const status: GroupVolume['status'] =
      sets === 0 ? 'none' : sets < WEEKLY_SET_TARGET.min ? 'under' : sets > WEEKLY_SET_TARGET.max ? 'over' : 'in_range';
    return { group, sets, status, lastTrainedDays: last == null ? null : Math.floor(last) };
  });
}

// ---------- Adaptive plan ----------

export type CoachPlan = {
  focusGroups: string[];
  weekAdvice: string;
  suggestions: { exercise: string; recommendation: Recommendation }[];
};

// What to train next and how hard, adapting to fatigue and weekly volume.
export function adaptivePlan(exercises: CoachExercise[], fatigue: FatigueStatus, now: Date = new Date()): CoachPlan {
  const volume = weeklyGroupVolume(exercises, now);
  const trainedGroups = new Set(exercises.map((e) => e.group));
  const candidates = volume.filter((v) => trainedGroups.has(v.group));

  // Least-trained first: under the weekly target, then longest since trained
  const ranked = [...candidates].sort((a, b) => {
    const under = (v: GroupVolume) => (v.status === 'none' || v.status === 'under' ? 0 : 1);
    if (under(a) !== under(b)) return under(a) - under(b);
    return (b.lastTrainedDays ?? 999) - (a.lastTrainedDays ?? 999);
  });
  const focusGroups = ranked.slice(0, 2).map((v) => v.group);

  let weekAdvice: string;
  if (fatigue.level === 'high') {
    weekAdvice = 'Deload: do about half your usual sets at roughly 90% of your normal weights for a few days, then build back up.';
  } else if (fatigue.level === 'elevated') {
    weekAdvice = 'Hold steady: keep your sets and weights, skip extra volume, and let recovery catch up.';
  } else if (fatigue.level === 'low') {
    weekAdvice = 'You have room to push: add a set to the exercises for muscle groups under 10 sets this week.';
  } else if (fatigue.level === 'optimal') {
    weekAdvice = 'Keep progressing: follow the targets below and aim for 10–20 hard sets per muscle group this week.';
  } else {
    weekAdvice = 'Keep logging. Once there are a few weeks of data, the coach will tune your weekly volume.';
  }

  // Up to 2 of your most-done exercises in each focus group, most recent first
  const suggestions = focusGroups.flatMap((group) =>
    exercises
      .filter((e) => e.group === group && e.sessions.length > 0)
      .sort((a, b) => b.sessions.length - a.sessions.length)
      .slice(0, 2)
      .map((e) => ({ exercise: e.name, recommendation: recommendNext(e, { fatigue: fatigue.level }) })),
  );

  return { focusGroups, weekAdvice, suggestions };
}
