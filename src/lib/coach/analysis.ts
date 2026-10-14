// Repzy Coach: data analysis behind every answer.
//
// Every function reads only what you logged and returns:
//   recommendation  - what to do
//   why             - the reasons, each with the numbers behind it
//   evidence        - the exact data used (dates, sets, check-ins), shown under "Data used"
//   missing         - data that would make the answer better but isn't logged
// Nothing is estimated unless it's labelled as an estimate, and nothing is made up:
// if there's no data for something, the answer says so.

import {
  type CoachExercise,
  type CoachSession,
  type FatigueStatus,
  type WorkoutLoad,
  isWarmup,
  predictStrength,
  recommendNext,
  sessionBestE1rm,
  sessionBestReps,
  TRACKED_GROUPS,
  WEEKLY_SET_TARGET,
  workingSets,
} from './engine';

export type DailyLog = {
  date: string; // YYYY-MM-DD
  bodyweight: number | null; // kg
  calories: number | null;
  protein: number | null; // g
  sleep: number | null; // hours
  soreness: number | null; // 1 none … 5 very sore
  energy: number | null; // 1 exhausted … 5 great
};

export type CoachTarget = { min: number | null; max: number | null; sets?: number };

export type LibraryLite = { name: string; group: string; muscle: string; equipment: string; popular?: boolean };

export type AnalysisContext = {
  exercises: CoachExercise[];
  loads: WorkoutLoad[];
  fatigue: FatigueStatus;
  daily: DailyLog[]; // oldest first
  dailyAvailable: boolean;
  targets?: Map<string, CoachTarget>;
  library?: LibraryLite[];
  now: Date;
};

export type Evidence = { label: string; value: string };

export type Intent =
  | 'help'
  | 'no_data'
  | 'unknown'
  | 'clarify'
  | 'plateau'
  | 'drop'
  | 'weaker'
  | 'add_day'
  | 'train_today'
  | 'sets'
  | 'replace'
  | 'program'
  | 'recommend'
  | 'predict'
  | 'fatigue'
  | 'volume'
  | 'progress'
  | 'plan';

export type CoachAnswer = {
  intent: Intent;
  recommendation: string;
  why: string[];
  evidence: Evidence[];
  missing: string[];
  exercise?: string;
};

type Finding = { why: string; evidence: Evidence[] };

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- formatting ----------

export function shortDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const r1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);
export const signedPct = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}%`;

// RPE 8 → "≈2 RIR", RPE 8.5 → "≈1–2 RIR"
export function rirText(rpe: number) {
  const rir = Math.max(0, 10 - Math.round(rpe * 2) / 2);
  return Number.isInteger(rir) ? `≈${rir} RIR` : `≈${Math.floor(rir)}–${Math.ceil(rir)} RIR`;
}

export function effortText(rpe: number) {
  return `RPE ${r1(rpe)} (${rirText(rpe)})`;
}

// "80 kg × 8, 8, 7 @RPE 8.5"
export function sessionLine(s: CoachSession) {
  const sets = s.sets.filter((x) => !isWarmup(x) && x.reps > 0);
  const parts: string[] = [];
  let i = 0;
  while (i < sets.length) {
    const w = sets[i].weight;
    const reps: number[] = [];
    while (i < sets.length && sets[i].weight === w) reps.push(sets[i++].reps);
    parts.push(w && w > 0 ? `${w} kg × ${reps.join(', ')}` : `${reps.join(', ')} reps`);
  }
  const e = sessionEffort(s);
  return `${parts.join(' · ') || 'no working sets'}${e != null ? ` @RPE ${r1(e)}` : ''}`;
}

const ageDays = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / DAY;

// ---------- per-session numbers ----------

export function sessionEffort(s: CoachSession): number | null {
  const rpes = s.sets.filter((x) => !isWarmup(x) && x.rpe != null).map((x) => x.rpe as number);
  return avg(rpes);
}

// The number used for trends: estimated 1RM, or best reps for bodyweight exercises
function metric(s: CoachSession): { value: number; unit: 'kg' | 'reps' } | null {
  const e = sessionBestE1rm(s);
  if (e != null) return { value: e, unit: 'kg' };
  const reps = sessionBestReps(s);
  return reps > 0 ? { value: reps, unit: 'reps' } : null;
}

// ---------- exercise statistics ----------

export type ExerciseStats = {
  name: string;
  sessions: CoachSession[]; // with working sets, oldest first
  unit: 'kg' | 'reps';
  recentAvg: number | null; // average of the last 3 sessions
  priorAvg: number | null; // average of the 3 before that
  trendPct: number | null; // recent vs prior
  last4WeeksSessions: number;
  setsLastSession: number;
  effortRecent: number | null;
  effortPrior: number | null;
  repeated: boolean; // last 3 sessions identical
  lastGapDays: number | null;
  daysSinceLast: number | null;
};

export function exerciseStats(ex: CoachExercise, now: Date): ExerciseStats {
  const sessions = ex.sessions.filter((s) => workingSets(s.sets).length > 0);
  const metrics = sessions.map(metric).filter((m): m is NonNullable<ReturnType<typeof metric>> => m != null);
  const unit = metrics.some((m) => m.unit === 'kg') ? 'kg' : 'reps';
  const values = metrics.filter((m) => m.unit === unit).map((m) => m.value);
  const recent = values.slice(-3);
  const prior = values.slice(-6, -3);
  const recentAvg = recent.length ? (avg(recent) as number) : null;
  const priorAvg = prior.length ? (avg(prior) as number) : null;
  const trendPct = recentAvg != null && priorAvg != null && values.length >= 4 ? pct(recentAvg, priorAvg) : null;

  const efforts = sessions.map(sessionEffort);
  const effortRecent = avg(efforts.slice(-3).filter((e): e is number => e != null));
  const effortPrior = avg(efforts.slice(-6, -3).filter((e): e is number => e != null));

  const key = (s: CoachSession) =>
    workingSets(s.sets)
      .map((x) => `${x.weight ?? 0}x${x.reps}`)
      .join('|');
  const last3 = sessions.slice(-3);
  const repeated = last3.length === 3 && last3.every((s) => key(s) === key(last3[0]));

  const last = sessions[sessions.length - 1];
  const prev = sessions[sessions.length - 2];
  return {
    name: ex.name,
    sessions,
    unit,
    recentAvg,
    priorAvg,
    trendPct,
    last4WeeksSessions: sessions.filter((s) => ageDays(s.date, now) < 28).length,
    setsLastSession: last ? workingSets(last.sets).length : 0,
    effortRecent,
    effortPrior,
    repeated,
    lastGapDays: last && prev ? Math.round((new Date(last.date).getTime() - new Date(prev.date).getTime()) / DAY) : null,
    daysSinceLast: last ? Math.floor(ageDays(last.date, now)) : null,
  };
}

function recentSessionsEvidence(stats: ExerciseStats, count = 4): Evidence[] {
  return stats.sessions.slice(-count).map((s) => {
    const m = metric(s);
    const est = m && m.unit === 'kg' ? ` → est. 1RM ${r1(m.value)} kg` : '';
    return { label: shortDate(s.date), value: `${sessionLine(s)}${est}` };
  });
}

function trendEvidence(stats: ExerciseStats): Evidence[] {
  if (stats.trendPct == null || stats.recentAvg == null || stats.priorAvg == null) return [];
  const what = stats.unit === 'kg' ? 'Avg est. 1RM' : 'Avg best reps';
  const unit = stats.unit === 'kg' ? ' kg' : '';
  return [
    {
      label: `${what}, last 3 vs 3 before`,
      value: `${r1(stats.recentAvg)}${unit} vs ${r1(stats.priorAvg)}${unit} (${signedPct(stats.trendPct)})`,
    },
  ];
}

// ---------- muscle-group statistics ----------

export type GroupStats = {
  group: string;
  weeklySetsAvg: number; // hard sets per week, last 4 weeks
  thisWeekSets: number; // last 7 days
  daysPerWeek: number; // distinct training days with this group, last 4 weeks
  exercises: ExerciseStats[];
  trendPct: number | null; // average trend of its exercises
  lastTrainedDays: number | null;
};

export function groupStats(group: string, ctx: AnalysisContext): GroupStats {
  const exs = ctx.exercises.filter((e) => e.group === group);
  let sets28 = 0;
  let sets7 = 0;
  const days = new Set<string>();
  let last: number | null = null;
  for (const ex of exs) {
    for (const s of ex.sessions) {
      const age = ageDays(s.date, ctx.now);
      last = last == null ? age : Math.min(last, age);
      const hard = s.sets.filter((x) => !isWarmup(x) && x.reps > 0).length;
      if (age < 28) {
        sets28 += hard;
        days.add(s.date.slice(0, 10));
      }
      if (age < 7) sets7 += hard;
    }
  }
  const stats = exs.map((e) => exerciseStats(e, ctx.now));
  const trends = stats.map((s) => s.trendPct).filter((t): t is number => t != null);
  return {
    group,
    weeklySetsAvg: r1(sets28 / 4),
    thisWeekSets: sets7,
    daysPerWeek: r1(days.size / 4),
    exercises: stats,
    trendPct: trends.length ? r1(avg(trends) as number) : null,
    lastTrainedDays: last == null ? null : Math.floor(last),
  };
}

// ---------- recovery, bodyweight and nutrition ----------

export type RecoveryStats = {
  checkins14: number;
  sleepRecent: number | null; // average of the last 7 days' check-ins
  sleepUsual: number | null; // average of the 4 weeks before
  sorenessRecent: number | null; // last 3 check-ins within 7 days
  energyRecent: number | null;
  today: DailyLog | null;
  bodyweight: { first: DailyLog; last: DailyLog; changePct: number } | null; // last 30 days
  latestBodyweight: number | null;
  caloriesRecent: number | null;
  caloriesUsual: number | null;
  proteinRecent: number | null;
  proteinPerKg: number | null;
};

function todayKey(now: Date) {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function recoveryStats(ctx: AnalysisContext): RecoveryStats {
  const within = (days: number, from = 0) =>
    ctx.daily.filter((l) => {
      const a = ageDays(`${l.date}T12:00:00`, ctx.now);
      return a < days && a >= from - 0.5;
    });
  const vals = (logs: DailyLog[], k: keyof Omit<DailyLog, 'date'>) =>
    logs.map((l) => l[k]).filter((v): v is number => v != null);
  const last7 = within(7.5);
  const usual = within(35.5, 7.5);
  const sleepRecent = vals(last7, 'sleep');
  const sleepUsual = vals(usual, 'sleep');
  const recentChecks = last7.filter((l) => l.soreness != null || l.energy != null).slice(-3);

  const bwLogs = within(30.5).filter((l) => l.bodyweight != null);
  let bodyweight: RecoveryStats['bodyweight'] = null;
  if (bwLogs.length >= 2) {
    const first = bwLogs[0];
    const last = bwLogs[bwLogs.length - 1];
    const span = (new Date(last.date).getTime() - new Date(first.date).getTime()) / DAY;
    if (span >= 7) bodyweight = { first, last, changePct: r1(pct(last.bodyweight as number, first.bodyweight as number)) };
  }
  const allBw = ctx.daily.filter((l) => l.bodyweight != null);
  const latestBodyweight = allBw.length ? (allBw[allBw.length - 1].bodyweight as number) : null;

  const kcalRecent = vals(last7, 'calories');
  const kcalUsual = vals(usual, 'calories');
  const protein = vals(last7, 'protein');
  const proteinRecent = protein.length >= 2 ? r1(avg(protein) as number) : null;

  return {
    checkins14: within(14.5).length,
    sleepRecent: sleepRecent.length >= 2 ? r1(avg(sleepRecent) as number) : null,
    sleepUsual: sleepUsual.length >= 3 ? r1(avg(sleepUsual) as number) : null,
    sorenessRecent: recentChecks.some((l) => l.soreness != null) ? r1(avg(vals(recentChecks, 'soreness')) as number) : null,
    energyRecent: recentChecks.some((l) => l.energy != null) ? r1(avg(vals(recentChecks, 'energy')) as number) : null,
    today: ctx.daily.find((l) => l.date === todayKey(ctx.now)) ?? null,
    bodyweight,
    latestBodyweight,
    caloriesRecent: kcalRecent.length >= 3 ? Math.round(avg(kcalRecent) as number) : null,
    caloriesUsual: kcalUsual.length >= 3 ? Math.round(avg(kcalUsual) as number) : null,
    proteinRecent,
    proteinPerKg: proteinRecent != null && latestBodyweight ? r1(proteinRecent / latestBodyweight) : null,
  };
}

function recoveryFindings(rec: RecoveryStats): Finding[] {
  const out: Finding[] = [];
  if (rec.sleepRecent != null && (rec.sleepRecent < 7 || (rec.sleepUsual != null && rec.sleepRecent <= rec.sleepUsual - 1))) {
    const vs = rec.sleepUsual != null ? `, compared with ${rec.sleepUsual} h before that` : '';
    out.push({
      why: `You've slept ${rec.sleepRecent} h a night on average over the last week${vs}. Most lifters recover best on 7–9 h.`,
      evidence: [
        { label: 'Sleep, last 7 days', value: `${rec.sleepRecent} h average` },
        ...(rec.sleepUsual != null ? [{ label: 'Sleep, 4 weeks before', value: `${rec.sleepUsual} h average` }] : []),
      ],
    });
  }
  if (rec.sorenessRecent != null && rec.sorenessRecent >= 4) {
    out.push({
      why: `Your recent soreness check-ins average ${rec.sorenessRecent}/5, which means you're still recovering.`,
      evidence: [{ label: 'Soreness, last check-ins', value: `${rec.sorenessRecent} / 5` }],
    });
  }
  if (rec.energyRecent != null && rec.energyRecent <= 2) {
    out.push({
      why: `Your energy check-ins average ${rec.energyRecent}/5 lately.`,
      evidence: [{ label: 'Energy, last check-ins', value: `${rec.energyRecent} / 5` }],
    });
  }
  if (rec.bodyweight && rec.bodyweight.changePct <= -1) {
    const { first, last, changePct } = rec.bodyweight;
    out.push({
      why: `Your bodyweight went from ${first.bodyweight} kg to ${last.bodyweight} kg (${signedPct(changePct)}) between ${shortDate(first.date)} and ${shortDate(last.date)}. Losing weight usually slows strength gains.`,
      evidence: [
        { label: `Bodyweight ${shortDate(first.date)}`, value: `${first.bodyweight} kg` },
        { label: `Bodyweight ${shortDate(last.date)}`, value: `${last.bodyweight} kg` },
      ],
    });
  }
  if (rec.caloriesRecent != null && rec.caloriesUsual != null && rec.caloriesRecent <= rec.caloriesUsual * 0.9) {
    out.push({
      why: `You've eaten about ${rec.caloriesRecent} kcal a day this week, down ${Math.round(-pct(rec.caloriesRecent, rec.caloriesUsual))}% from your usual ${rec.caloriesUsual} kcal.`,
      evidence: [
        { label: 'Calories, last 7 days', value: `${rec.caloriesRecent} kcal/day` },
        { label: 'Calories, 4 weeks before', value: `${rec.caloriesUsual} kcal/day` },
      ],
    });
  }
  if (rec.proteinPerKg != null && rec.proteinPerKg < 1.6) {
    out.push({
      why: `Your protein is about ${rec.proteinRecent} g a day (${rec.proteinPerKg} g per kg). A common target for building muscle is 1.6–2.2 g per kg.`,
      evidence: [
        { label: 'Protein, last 7 days', value: `${rec.proteinRecent} g/day` },
        { label: 'Latest bodyweight', value: `${rec.latestBodyweight} kg` },
      ],
    });
  }
  return out;
}

function missingData(ctx: AnalysisContext, rec: RecoveryStats, opts: { effort?: boolean } = {}): string[] {
  const out: string[] = [];
  if (!ctx.dailyAvailable) {
    out.push('Bodyweight, food and recovery: the daily check-in needs the latest database update.');
    return out;
  }
  if (rec.sleepRecent == null && rec.sorenessRecent == null && rec.energyRecent == null) {
    out.push('Sleep, soreness and energy: log a daily check-in on the Coach tab.');
  }
  if (rec.latestBodyweight == null) out.push('Bodyweight: add it in the daily check-in.');
  if (rec.caloriesRecent == null && rec.proteinRecent == null) out.push('Calories and protein: add them in the daily check-in.');
  if (opts.effort) out.push('Effort: tap a set number while logging to add RPE (how many reps you had left).');
  return out;
}

function fatigueFinding(f: FatigueStatus): Finding | null {
  if (f.level !== 'high' && f.level !== 'elevated') return null;
  return {
    why: `Your training load is ${f.level === 'high' ? 'high' : 'building'}: ${f.acuteSets} hard sets in the last 7 days vs your usual ${f.chronicWeeklySets} a week${f.droppingExercises.length ? `, and ${f.droppingExercises.length} lift${f.droppingExercises.length === 1 ? ' is' : 's are'} down more than 5%` : ''}.`,
    evidence: [
      { label: 'Hard sets, last 7 days', value: String(f.acuteSets) },
      { label: 'Usual week (4-week average)', value: String(f.chronicWeeklySets) },
    ],
  };
}

function effortFindings(st: ExerciseStats): Finding[] {
  const out: Finding[] = [];
  if (st.effortRecent != null && st.effortPrior != null && st.effortRecent - st.effortPrior >= 1) {
    out.push({
      why: `Your average effort on ${st.name} rose from ${rirText(st.effortPrior)} to ${rirText(st.effortRecent)}${st.trendPct != null && st.trendPct <= 0 ? ' while performance did not improve' : ''}. Sets are getting harder for the same or less output.`,
      evidence: [
        { label: 'Avg effort, 3 sessions before', value: effortText(st.effortPrior) },
        { label: 'Avg effort, last 3 sessions', value: effortText(st.effortRecent) },
      ],
    });
  } else if (st.effortRecent != null && st.effortRecent >= 9.5) {
    out.push({
      why: `You're finishing ${st.name} sets at ${effortText(st.effortRecent)}, leaving almost nothing in reserve, which makes recovery between sessions harder.`,
      evidence: [{ label: 'Avg effort, last 3 sessions', value: effortText(st.effortRecent) }],
    });
  } else if (st.effortRecent != null && st.effortRecent <= 7) {
    out.push({
      why: `Your ${st.name} sets average ${effortText(st.effortRecent)}. Stopping 3+ reps short of failure may not be hard enough to keep progressing.`,
      evidence: [{ label: 'Avg effort, last 3 sessions', value: effortText(st.effortRecent) }],
    });
  }
  return out;
}

function frequencyFindings(st: ExerciseStats, gs: GroupStats | null): Finding[] {
  const out: Finding[] = [];
  if (st.repeated) {
    out.push({
      why: `Your last 3 ${st.name} sessions were identical (${sessionLine(st.sessions[st.sessions.length - 1])}). There's been no attempt at an extra rep or more weight.`,
      evidence: [],
    });
  }
  if (st.last4WeeksSessions < 4) {
    out.push({
      why: `You've done ${st.name} ${st.last4WeeksSessions} time${st.last4WeeksSessions === 1 ? '' : 's'} in the last 4 weeks. Less than once a week makes steady progress hard.`,
      evidence: [{ label: 'Sessions, last 4 weeks', value: String(st.last4WeeksSessions) }],
    });
  }
  if (st.lastGapDays != null && st.lastGapDays >= 14) {
    out.push({
      why: `There were ${st.lastGapDays} days between your last two ${st.name} sessions. Strength dips after a break and comes back quickly.`,
      evidence: [{ label: 'Gap between last two sessions', value: `${st.lastGapDays} days` }],
    });
  }
  if (gs && gs.weeklySetsAvg < WEEKLY_SET_TARGET.min) {
    out.push({
      why: `${gs.group} gets about ${gs.weeklySetsAvg} hard sets a week. A common range for growth is ${WEEKLY_SET_TARGET.min}–${WEEKLY_SET_TARGET.max}.`,
      evidence: [{ label: `${gs.group} hard sets / week (4-week avg)`, value: String(gs.weeklySetsAvg) }],
    });
  } else if (gs && gs.weeklySetsAvg > WEEKLY_SET_TARGET.max) {
    out.push({
      why: `${gs.group} gets about ${gs.weeklySetsAvg} hard sets a week, above the usual ${WEEKLY_SET_TARGET.min}–${WEEKLY_SET_TARGET.max}. More may be more than you can recover from.`,
      evidence: [{ label: `${gs.group} hard sets / week (4-week avg)`, value: String(gs.weeklySetsAvg) }],
    });
  }
  return out;
}

function merge(findings: Finding[]) {
  const why = findings.map((f) => f.why);
  const evidence: Evidence[] = [];
  for (const f of findings) for (const e of f.evidence) if (!evidence.some((x) => x.label === e.label)) evidence.push(e);
  return { why, evidence };
}

function noHistory(ex: CoachExercise, intent: Intent): CoachAnswer {
  return {
    intent,
    exercise: ex.name,
    recommendation: `I need more ${ex.name} history to answer that.`,
    why: [`You've logged ${ex.name} ${ex.sessions.length} time${ex.sessions.length === 1 ? '' : 's'}. Trends need at least 4 sessions.`],
    evidence: ex.sessions.slice(-3).map((s) => ({ label: shortDate(s.date), value: sessionLine(s) })),
    missing: [],
  };
}

// ---------- "Why is my bench not progressing?" ----------

export function analyzePlateau(ex: CoachExercise, ctx: AnalysisContext): CoachAnswer {
  const st = exerciseStats(ex, ctx.now);
  if (st.trendPct == null) return noHistory(ex, 'plateau');
  const gs = ex.group ? groupStats(ex.group, ctx) : null;
  const rec = recoveryStats(ctx);
  const fat = fatigueFinding(ctx.fatigue);
  const effort = effortFindings(st);
  const freq = frequencyFindings(st, gs);
  const recovery = recoveryFindings(rec);
  const findings = [...effort, ...(fat ? [fat] : []), ...recovery, ...freq];
  const { why, evidence } = merge(findings);
  const target = ctx.targets?.get(ex.name.toLowerCase());
  const next = recommendNext(ex, { target, fatigue: ctx.fatigue.level });

  const progressing = st.trendPct >= 2;
  const effortUp = st.effortRecent != null && st.effortPrior != null && st.effortRecent - st.effortPrior >= 1;
  let recommendation: string;
  if (progressing) {
    recommendation = `${ex.name} is progressing: up ${signedPct(st.trendPct)} over your last sessions. Keep going: ${next.headline} next time.`;
  } else if ((effortUp || (st.effortRecent ?? 0) >= 9.5) && st.trendPct <= 0 && st.setsLastSession >= 3) {
    recommendation = `Reduce ${ex.name} from ${st.setsLastSession} sets to ${st.setsLastSession - 1} for 1–2 weeks, and stop each set with about 2 reps left.`;
  } else if (fat || recovery.length) {
    recommendation = `Recover first: hold ${ex.name} at ${next.headline} for a week and fix the recovery issues below before pushing again.`;
  } else if (st.effortRecent != null && st.effortRecent <= 7) {
    recommendation = `Push ${ex.name} sets closer to failure: aim for 1–2 reps left (RPE 8–9) instead of ${rirText(st.effortRecent)}.`;
  } else if (st.last4WeeksSessions < 4 || (gs && gs.weeklySetsAvg < WEEKLY_SET_TARGET.min)) {
    recommendation = `Train ${ex.name} more often: aim for twice a week, or add 2 more hard ${ex.group ?? ''} sets each week.`.replace('  ', ' ');
  } else if (st.repeated) {
    recommendation = `Next time, try for one extra rep on your first set: ${next.headline}.`;
  } else {
    recommendation = `Change the stimulus for 4 weeks: switch to a different rep range or a close variation, then come back to ${ex.name}.`;
  }

  if (!progressing && why.length === 0) {
    why.push(
      `Your ${st.unit === 'kg' ? 'estimated 1RM' : 'best reps'} changed ${signedPct(st.trendPct)} from your previous 3 sessions to your last 3, and nothing in your logged effort, load or recovery explains it.`,
    );
  } else if (!progressing) {
    why.unshift(`Your ${st.unit === 'kg' ? 'estimated 1RM' : 'best reps'} changed ${signedPct(st.trendPct)} from your previous 3 sessions to your last 3.`);
  } else {
    why.unshift(`Your ${st.unit === 'kg' ? 'estimated 1RM' : 'best reps'} is up ${signedPct(st.trendPct)} on your previous 3 sessions.`);
  }

  return {
    intent: 'plateau',
    exercise: ex.name,
    recommendation,
    why,
    evidence: [...trendEvidence(st), ...recentSessionsEvidence(st), ...evidence],
    missing: missingData(ctx, rec, { effort: st.effortRecent == null }),
  };
}

// ---------- "Why did my squat drop?" ----------

export function analyzeDrop(ex: CoachExercise, ctx: AnalysisContext): CoachAnswer {
  const st = exerciseStats(ex, ctx.now);
  const weighted = st.sessions.filter((s) => sessionBestE1rm(s) != null);
  if (weighted.length < 2) return noHistory(ex, 'drop');
  const last = weighted[weighted.length - 1];
  const prev = weighted[weighted.length - 2];
  const lastE = sessionBestE1rm(last) as number;
  const prevE = sessionBestE1rm(prev) as number;
  const bestBefore = Math.max(...weighted.slice(0, -1).map((s) => sessionBestE1rm(s) as number));
  const change = pct(lastE, prevE);
  const fromBest = pct(lastE, bestBefore);
  const evidence: Evidence[] = [
    { label: `${shortDate(prev.date)} (before)`, value: `${sessionLine(prev)} → est. 1RM ${prevE} kg` },
    { label: `${shortDate(last.date)} (latest)`, value: `${sessionLine(last)} → est. 1RM ${lastE} kg` },
    { label: 'Best before that', value: `est. 1RM ${bestBefore} kg` },
  ];
  const rec = recoveryStats(ctx);

  if (change > -2 && fromBest > -3) {
    return {
      intent: 'drop',
      exercise: ex.name,
      recommendation: `Your ${ex.name} hasn't really dropped. Your latest session was ${signedPct(change)} vs the one before.`,
      why: [`A change under 2–3% is normal day-to-day variation, not a real drop.`],
      evidence,
      missing: missingData(ctx, rec),
    };
  }

  const findings: Finding[] = [];
  // Rep range changed: estimates from high reps read lower
  const reps = (s: CoachSession) => avg(workingSets(s.sets).map((x) => x.reps)) ?? 0;
  if (Math.abs(reps(last) - reps(prev)) >= 4) {
    findings.push({
      why: `You did about ${Math.round(reps(last))} reps per set last time vs ${Math.round(reps(prev))} before. 1RM estimates from different rep ranges don't compare perfectly, so part of this "drop" is the rep range.`,
      evidence: [],
    });
  }
  const gap = Math.round((new Date(last.date).getTime() - new Date(prev.date).getTime()) / DAY);
  if (gap >= 14) {
    findings.push({
      why: `It had been ${gap} days since your previous ${ex.name} session. Strength dips after a break and returns within a couple of sessions.`,
      evidence: [{ label: 'Days between sessions', value: String(gap) }],
    });
  }
  // Load in the week before the drop vs usual
  const t = new Date(last.date).getTime();
  const weekBefore = ctx.loads.filter((l) => {
    const d = (t - new Date(l.date).getTime()) / DAY;
    return d > 0.01 && d <= 7;
  });
  const before4 = ctx.loads.filter((l) => {
    const d = (t - new Date(l.date).getTime()) / DAY;
    return d > 7 && d <= 35;
  });
  const setsWeek = weekBefore.reduce((n, l) => n + l.hardSets, 0);
  const usual = before4.reduce((n, l) => n + l.hardSets, 0) / 4;
  if (usual > 0 && setsWeek > usual * 1.3) {
    findings.push({
      why: `In the 7 days before that session you did ${setsWeek} hard sets, vs your usual ${Math.round(usual)} a week. You likely went in tired.`,
      evidence: [
        { label: 'Hard sets, 7 days before', value: String(setsWeek) },
        { label: 'Usual week before that', value: String(Math.round(usual)) },
      ],
    });
  }
  const lastEffort = sessionEffort(last);
  const prevEffort = sessionEffort(prev);
  if (lastEffort != null && prevEffort != null && lastEffort >= prevEffort + 1) {
    findings.push({
      why: `That session also felt harder: ${effortText(lastEffort)} vs ${effortText(prevEffort)} the time before.`,
      evidence: [],
    });
  }
  // Recovery around the drop (3 days before it)
  const dropDay = last.date.slice(0, 10);
  const around = ctx.daily.filter((l) => {
    const d = (t - new Date(`${l.date}T12:00:00`).getTime()) / DAY;
    return d >= -0.6 && d <= 3;
  });
  const sleepAround = avg(around.map((l) => l.sleep).filter((v): v is number => v != null));
  if (sleepAround != null && sleepAround < 7) {
    findings.push({
      why: `You averaged ${r1(sleepAround)} h of sleep in the days before ${shortDate(dropDay)}.`,
      evidence: [{ label: `Sleep before ${shortDate(dropDay)}`, value: `${r1(sleepAround)} h average` }],
    });
  }
  const sore = around.map((l) => l.soreness).filter((v): v is number => v != null);
  if (sore.length && Math.max(...sore) >= 4) {
    findings.push({ why: `You logged soreness of ${Math.max(...sore)}/5 around that session.`, evidence: [] });
  }
  findings.push(...recoveryFindings(rec).filter((f) => !/slept/.test(f.why) || sleepAround == null));
  const fat = fatigueFinding(ctx.fatigue);
  if (fat) findings.push(fat);

  const { why, evidence: more } = merge(findings);
  why.unshift(`Your estimated 1RM went from ${prevE} kg to ${lastE} kg (${signedPct(change)}) on ${shortDate(last.date)}.`);
  if (findings.length === 0) {
    why.push('None of your logged load, effort, sleep, bodyweight or food data explains it. A single off day is common; judge it over the next 2 sessions.');
  }
  const next = recommendNext(ex, { target: ctx.targets?.get(ex.name.toLowerCase()), fatigue: ctx.fatigue.level });
  return {
    intent: 'drop',
    exercise: ex.name,
    recommendation:
      findings.length > 0
        ? `Don't chase it next session. Repeat a manageable target (${next.headline}) and address the causes below.`
        : `Treat it as one off day. Next time aim for ${next.headline}.`,
    why,
    evidence: [...evidence, ...more],
    missing: missingData(ctx, rec, { effort: lastEffort == null }),
  };
}

// ---------- "Why am I getting weaker?" ----------

export function analyzeWeaker(ctx: AnalysisContext): CoachAnswer {
  const all = ctx.exercises.map((e) => exerciseStats(e, ctx.now)).filter((s) => s.trendPct != null && s.unit === 'kg');
  const rec = recoveryStats(ctx);
  if (all.length === 0) {
    return {
      intent: 'weaker',
      recommendation: 'Not enough history to measure your strength yet.',
      why: ['Trends need at least 4 weighted sessions of an exercise.'],
      evidence: [],
      missing: missingData(ctx, rec),
    };
  }
  const down = all.filter((s) => (s.trendPct as number) <= -3);
  const up = all.filter((s) => (s.trendPct as number) >= 2);
  const evidence: Evidence[] = all
    .sort((a, b) => (a.trendPct as number) - (b.trendPct as number))
    .slice(0, 6)
    .map((s) => ({ label: s.name, value: `${signedPct(s.trendPct as number)} (avg est. 1RM ${r1(s.recentAvg as number)} vs ${r1(s.priorAvg as number)} kg)` }));

  if (down.length === 0) {
    return {
      intent: 'weaker',
      recommendation: `Your data doesn't show you getting weaker: ${up.length} of ${all.length} measured lifts are up and none are down 3% or more.`,
      why: ['Compared your last 3 sessions with the 3 before for every lift with enough history.'],
      evidence,
      missing: missingData(ctx, rec),
    };
  }
  const findings: Finding[] = [...recoveryFindings(rec)];
  const fat = fatigueFinding(ctx.fatigue);
  if (fat) findings.push(fat);
  for (const s of down) findings.push(...effortFindings(s).slice(0, 1));
  const gaps = down.filter((s) => s.lastGapDays != null && s.lastGapDays >= 14);
  if (gaps.length) {
    findings.push({
      why: `${gaps.map((g) => g.name).join(', ')} had a break of 2+ weeks before the latest session.`,
      evidence: [],
    });
  }
  const { why, evidence: more } = merge(findings);
  why.unshift(`${down.length} of ${all.length} measured lifts are down 3% or more: ${down.map((d) => `${d.name} (${signedPct(d.trendPct as number)})`).join(', ')}.`);
  if (findings.length === 0) why.push('Your logged load, effort, sleep, bodyweight and food don\'t explain it.');
  return {
    intent: 'weaker',
    recommendation:
      ctx.fatigue.level === 'high' || ctx.fatigue.level === 'elevated'
        ? 'Take a lighter week: about half your usual sets at roughly 90% of your weights, then build back up.'
        : findings.length
          ? 'Fix the causes below first, and hold your weights for a week instead of pushing.'
          : 'Run a lighter week, then re-test. If lifts are still down, change rep ranges for 4 weeks.',
    why,
    evidence: [...evidence, ...more],
    missing: missingData(ctx, rec, { effort: down.every((d) => d.effortRecent == null) }),
  };
}

// ---------- "Should I add another chest day?" ----------

export function analyzeAddDay(group: string, ctx: AnalysisContext): CoachAnswer {
  const gs = groupStats(group, ctx);
  const rec = recoveryStats(ctx);
  const evidence: Evidence[] = [
    { label: `${group} training days / week`, value: `${gs.daysPerWeek} (last 4 weeks)` },
    { label: `${group} hard sets / week`, value: `${gs.weeklySetsAvg} (last 4 weeks)` },
    { label: `${group} sets in the last 7 days`, value: String(gs.thisWeekSets) },
    ...(gs.trendPct != null ? [{ label: `${group} lifts trend`, value: `${signedPct(gs.trendPct)} (avg of last 3 vs 3 before)` }] : []),
    { label: 'Training load', value: `${ctx.fatigue.acuteSets} sets this week vs usual ${ctx.fatigue.chronicWeeklySets}` },
  ];
  if (gs.exercises.length === 0) {
    return {
      intent: 'add_day',
      recommendation: `You haven't logged any ${group.toLowerCase()} exercises in the last 4 months, so start with one ${group.toLowerCase()} session a week.`,
      why: [`No ${group.toLowerCase()} sets found in your workouts.`],
      evidence: [],
      missing: [],
    };
  }
  const why: string[] = [];
  let recommendation: string;
  const perDay = gs.daysPerWeek > 0 ? r1(gs.weeklySetsAvg / gs.daysPerWeek) : 0;
  if (ctx.fatigue.level === 'high') {
    recommendation = `No. Recover first, then reconsider.`;
    why.push(`Your overall training load is high (${ctx.fatigue.acuteSets} sets this week vs usual ${ctx.fatigue.chronicWeeklySets}). Adding a day now adds fatigue, not progress.`);
  } else if (gs.trendPct != null && gs.trendPct >= 2) {
    recommendation = `Not needed. Your ${group.toLowerCase()} lifts are progressing at your current ${gs.daysPerWeek} day${gs.daysPerWeek === 1 ? '' : 's'} a week.`;
    why.push(`${group} lifts are up ${signedPct(gs.trendPct)}. Change things when progress stalls, not before.`);
  } else if (gs.weeklySetsAvg > WEEKLY_SET_TARGET.max) {
    recommendation = gs.daysPerWeek < 2
      ? `Not another day of extra sets. Instead, split your current ${gs.weeklySetsAvg} weekly sets across 2 days.`
      : `No. You already do ${gs.weeklySetsAvg} ${group.toLowerCase()} sets a week, above the usual 10–20.`;
    why.push(`More than ${WEEKLY_SET_TARGET.max} hard sets a week rarely adds growth and costs recovery.`);
  } else if (gs.daysPerWeek < 1.5) {
    recommendation = `Yes. Add a second ${group.toLowerCase()} day: move part of your sets to it and add 2–4 new ones, for about ${Math.min(WEEKLY_SET_TARGET.max, Math.max(10, Math.round(gs.weeklySetsAvg + 3)))} sets a week in total.`;
    why.push(`You train ${group.toLowerCase()} about ${gs.daysPerWeek} time${gs.daysPerWeek === 1 ? '' : 's'} a week with ~${perDay} sets per session. Splitting volume over 2 days usually means better quality sets.`);
    if (gs.trendPct != null) why.push(`Your ${group.toLowerCase()} lifts changed ${signedPct(gs.trendPct)} recently, so the current setup isn't moving them much.`);
  } else if (gs.weeklySetsAvg < WEEKLY_SET_TARGET.min) {
    recommendation = `Add sets, not a day: you already train ${group.toLowerCase()} ${gs.daysPerWeek} times a week. Add 1–2 sets each session to reach 10+ a week.`;
    why.push(`You get ${gs.weeklySetsAvg} hard sets a week, below the common 10–20 range.`);
  } else {
    recommendation = `Probably not yet. Add 2–3 sets across your existing ${group.toLowerCase()} days first and see if your lifts move over 3–4 weeks.`;
    why.push(`You already train ${group.toLowerCase()} ${gs.daysPerWeek} times a week with ${gs.weeklySetsAvg} sets, inside the usual range.`);
  }
  const recov = recoveryFindings(rec);
  if (recov.length && ctx.fatigue.level !== 'high') why.push(...recov.map((f) => f.why));
  return { intent: 'add_day', recommendation, why, evidence, missing: missingData(ctx, rec) };
}

// ---------- "Should I train today?" ----------

export function analyzeTrainToday(ctx: AnalysisContext): CoachAnswer {
  const rec = recoveryStats(ctx);
  const f = ctx.fatigue;
  const evidence: Evidence[] = [];
  const why: string[] = [];
  const today = rec.today;
  if (today?.sleep != null) evidence.push({ label: 'Sleep last night', value: `${today.sleep} h` });
  if (today?.soreness != null) evidence.push({ label: 'Soreness today', value: `${today.soreness} / 5` });
  if (today?.energy != null) evidence.push({ label: 'Energy today', value: `${today.energy} / 5` });
  if (f.daysSinceLastWorkout != null) evidence.push({ label: 'Days since last workout', value: String(f.daysSinceLastWorkout) });
  if (f.level !== 'not_enough_data') evidence.push({ label: 'Hard sets, last 7 days', value: `${f.acuteSets} (usual ${f.chronicWeeklySets})` });

  const groups = TRACKED_GROUPS.map((g) => groupStats(g, ctx)).filter((g) => g.exercises.length > 0);
  const ready = groups
    .filter((g) => g.lastTrainedDays == null || g.lastTrainedDays >= 2)
    .sort((a, b) => a.thisWeekSets - b.thisWeekSets || (b.lastTrainedDays ?? 99) - (a.lastTrainedDays ?? 99));
  const recovering = groups.filter((g) => g.lastTrainedDays != null && g.lastTrainedDays < 2).map((g) => g.group);
  for (const g of groups) {
    evidence.push({
      label: `${g.group}`,
      value: `last trained ${g.lastTrainedDays == null ? 'never' : g.lastTrainedDays === 0 ? 'today' : `${g.lastTrainedDays} day${g.lastTrainedDays === 1 ? '' : 's'} ago`}, ${g.thisWeekSets} sets this week`,
    });
  }
  const pick = ready.slice(0, 2).map((g) => g.group);

  let recommendation: string;
  const poorSleep = today?.sleep != null && today.sleep < 5;
  const wrecked = today?.soreness != null && today.soreness >= 4 && today?.energy != null && today.energy <= 2;
  if (f.daysSinceLastWorkout === 0) {
    recommendation = "You've already trained today. Rest and recover.";
    why.push('You logged a workout today.');
  } else if (f.level === 'high' || poorSleep || wrecked) {
    recommendation = 'Take a rest day, or do light cardio and mobility.';
    if (f.level === 'high') why.push(`Your load is high: ${f.acuteSets} hard sets in 7 days vs your usual ${f.chronicWeeklySets}.`);
    if (poorSleep) why.push(`You slept ${today?.sleep} h last night; heavy training on that little sleep is low quality and higher risk.`);
    if (wrecked) why.push(`You rated soreness ${today?.soreness}/5 and energy ${today?.energy}/5 today.`);
  } else if (f.level === 'elevated' || (today?.sleep != null && today.sleep < 6) || (today?.soreness != null && today.soreness >= 4)) {
    recommendation = `Train, but keep it light: hold your weights and do one set fewer${pick.length ? `. Best options: ${pick.join(' and ')}` : ''}.`;
    if (f.level === 'elevated') why.push(`Fatigue is building: ${f.acuteSets} sets this week vs your usual ${f.chronicWeeklySets}.`);
    if (today?.sleep != null && today.sleep < 6) why.push(`You slept ${today.sleep} h last night.`);
    if (today?.soreness != null && today.soreness >= 4) why.push(`You rated soreness ${today.soreness}/5.`);
  } else {
    recommendation = pick.length ? `Yes, train today. Best options: ${pick.join(' and ')}.` : 'Yes, train today.';
    if (f.level === 'optimal' || f.level === 'low') why.push(`Your training load is in a good range (${f.acuteSets} sets this week vs usual ${f.chronicWeeklySets}).`);
    if (f.daysSinceLastWorkout != null && f.daysSinceLastWorkout >= 1) why.push(`It's been ${f.daysSinceLastWorkout} day${f.daysSinceLastWorkout === 1 ? '' : 's'} since your last workout.`);
    if (today?.energy != null && today.energy >= 4) why.push(`You rated your energy ${today.energy}/5 today.`);
  }
  if (pick.length) why.push(`${pick.join(' and ')} ${pick.length === 1 ? 'has' : 'have'} had the fewest sets this week and at least 48 h of rest.`);
  if (recovering.length) why.push(`${recovering.join(', ')} ${recovering.length === 1 ? 'was' : 'were'} trained in the last 48 h; give ${recovering.length === 1 ? 'it' : 'them'} another day.`);
  const missing = missingData(ctx, rec);
  if (ctx.dailyAvailable && !today) missing.unshift("Today's check-in (sleep, soreness, energy) would make this answer more accurate.");
  return { intent: 'train_today', recommendation, why, evidence, missing };
}

// ---------- "How many sets should I do?" ----------

function setsAdviceFor(gs: GroupStats, fatigue: FatigueStatus): { advice: string; why: string } {
  const s = gs.weeklySetsAvg;
  if (fatigue.level === 'high') return { advice: `Hold at ${Math.max(6, Math.round(s * 0.6))}–${Math.round(s)} a week until you recover`, why: 'your overall load is high' };
  if (s < WEEKLY_SET_TARGET.min) return { advice: `Build up to 10–12 a week (add 2 a week)`, why: `you're at ${s}, below the common 10–20` };
  if (s > WEEKLY_SET_TARGET.max) return { advice: `Bring it down to 16–20 a week`, why: `you're at ${s}, above 20, where extra sets rarely help` };
  if (gs.trendPct != null && gs.trendPct >= 2) return { advice: `Keep ${Math.round(s)} a week`, why: `your lifts are up ${signedPct(gs.trendPct)} at this volume` };
  if (gs.trendPct != null) return { advice: `Try ${Math.min(20, Math.round(s) + 2)} a week for the next 4 weeks`, why: `your lifts changed ${signedPct(gs.trendPct)}, so a little more volume is worth testing` };
  return { advice: `Keep ${Math.round(s)} a week`, why: "you're inside the common 10–20 range" };
}

export function analyzeSets(ctx: AnalysisContext, group?: string | null, ex?: CoachExercise | null): CoachAnswer {
  const rec = recoveryStats(ctx);
  if (ex) {
    const st = exerciseStats(ex, ctx.now);
    const gs = ex.group ? groupStats(ex.group, ctx) : null;
    const target = ctx.targets?.get(ex.name.toLowerCase());
    const sets = target?.sets ?? st.setsLastSession;
    const why: string[] = [];
    let recommendation = `${ex.name}: ${sets >= 2 && sets <= 4 ? `stay at ${sets}` : sets < 2 ? 'do 3' : 'do 3–4'} working sets per session.`;
    if (st.trendPct != null && st.trendPct < 0 && st.effortRecent != null && st.effortRecent >= 9 && sets >= 3) {
      recommendation = `${ex.name}: drop to ${sets - 1} sets for 1–2 weeks.`;
      why.push(`Performance is ${signedPct(st.trendPct)} while effort is ${effortText(st.effortRecent)}, so fewer, better sets should help recovery.`);
    } else {
      why.push('2–4 hard sets per exercise per session is a common, effective range; past that, set quality usually drops.');
    }
    if (gs) {
      const a = setsAdviceFor(gs, ctx.fatigue);
      why.push(`For ${gs.group.toLowerCase()} overall: ${a.advice}, because ${a.why}.`);
    }
    return {
      intent: 'sets',
      exercise: ex.name,
      recommendation,
      why,
      evidence: [
        { label: 'Sets last session', value: String(st.setsLastSession) },
        ...(target?.sets ? [{ label: 'Routine target', value: `${target.sets} sets` }] : []),
        ...trendEvidence(st),
        ...(gs ? [{ label: `${gs.group} hard sets / week`, value: `${gs.weeklySetsAvg} (last 4 weeks)` }] : []),
      ],
      missing: missingData(ctx, rec, { effort: st.effortRecent == null }),
    };
  }
  const groups = (group ? [group] : TRACKED_GROUPS).map((g) => groupStats(g, ctx)).filter((g) => group || g.exercises.length > 0);
  const lines = groups.map((g) => {
    const a = setsAdviceFor(g, ctx.fatigue);
    return { g, a };
  });
  return {
    intent: 'sets',
    recommendation: group
      ? `${group}: ${lines[0].a.advice}.`
      : `Aim for ${WEEKLY_SET_TARGET.min}–${WEEKLY_SET_TARGET.max} hard sets per muscle group each week. Your adjustments are below.`,
    why: lines.map(({ g, a }) => `${g.group}: ${a.advice}, because ${a.why}.`),
    evidence: groups.map((g) => ({
      label: `${g.group} hard sets / week`,
      value: `${g.weeklySetsAvg} avg, ${g.thisWeekSets} in the last 7 days${g.trendPct != null ? `, lifts ${signedPct(g.trendPct)}` : ''}`,
    })),
    missing: missingData(ctx, rec),
  };
}

// ---------- "Can I replace this exercise?" ----------

export function analyzeReplace(name: string, ctx: AnalysisContext): CoachAnswer {
  const lib = ctx.library ?? [];
  const self = lib.find((l) => l.name.toLowerCase() === name.toLowerCase());
  const mine = ctx.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
  const group = self?.group ?? mine?.group ?? null;
  if (!group) {
    return {
      intent: 'replace',
      recommendation: `I can't find ${name} in the exercise library, so I don't know which muscle it trains.`,
      why: [],
      evidence: [],
      missing: [],
    };
  }
  const muscle = self?.muscle ?? null;
  const history = new Map(ctx.exercises.map((e) => [e.name.toLowerCase(), e]));
  const candidates = lib
    .filter((l) => l.name.toLowerCase() !== name.toLowerCase() && l.group === group && (!muscle || l.muscle === muscle))
    .map((l) => {
      const h = history.get(l.name.toLowerCase());
      const score = (h ? 100 + h.sessions.length : 0) + (l.popular ? 20 : 0) + (self && l.equipment !== self.equipment ? 5 : 0);
      return { l, h, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (candidates.length === 0) {
    return { intent: 'replace', recommendation: `I couldn't find a close replacement for ${name}.`, why: [], evidence: [], missing: [] };
  }
  const why: string[] = [];
  const st = mine ? exerciseStats(mine, ctx.now) : null;
  if (st?.trendPct != null && st.trendPct >= 2) {
    why.push(`You're still progressing on ${name} (${signedPct(st.trendPct)}), so only swap it if it's uncomfortable or the equipment isn't available.`);
  } else if (st?.trendPct != null) {
    why.push(`${name} has changed ${signedPct(st.trendPct)} recently, so a 4–6 week swap is a reasonable way to restart progress.`);
  }
  why.push(`These train the same ${muscle ? `main muscle (${muscle})` : `muscle group (${group})`}. Ones you've already logged come first, so the coach can suggest weights straight away.`);
  const evidence: Evidence[] = candidates.map(({ l, h }) => {
    if (h) {
      const r = recommendNext(h, { target: ctx.targets?.get(l.name.toLowerCase()) });
      return { label: l.name, value: `${l.equipment} · you've done it ${h.sessions.length}× · next: ${r.headline}` };
    }
    return { label: l.name, value: `${l.equipment} · not logged yet` };
  });
  return {
    intent: 'replace',
    exercise: name,
    recommendation: `Yes. The best swap for ${name} is ${candidates[0].l.name}.`,
    why,
    evidence,
    missing: [],
  };
}

// ---------- Short answers reused from the engine ----------

export function analyzeExerciseTarget(ex: CoachExercise, ctx: AnalysisContext): CoachAnswer {
  const st = exerciseStats(ex, ctx.now);
  const rec = recommendNext(ex, { target: ctx.targets?.get(ex.name.toLowerCase()), fatigue: ctx.fatigue.level });
  return {
    intent: 'recommend',
    exercise: ex.name,
    recommendation: `${ex.name} next time: ${rec.headline}`,
    why: [rec.reason, `Rep range ${rec.repRange.min}–${rec.repRange.max} (${rec.repRange.source === 'routine' ? 'from your routine' : 'based on what you usually do'}).`],
    evidence: recentSessionsEvidence(st, 3),
    missing: [],
  };
}

export function analyzePrediction(ex: CoachExercise, ctx: AnalysisContext, horizonDays: number): CoachAnswer {
  const p = predictStrength(ex, ctx.now, horizonDays);
  const st = exerciseStats(ex, ctx.now);
  if ('notEnoughData' in p) {
    return { intent: 'predict', exercise: ex.name, recommendation: p.notEnoughData, why: [], evidence: recentSessionsEvidence(st, 3), missing: [] };
  }
  const weeks = Math.round(p.horizonDays / 7);
  return {
    intent: 'predict',
    exercise: ex.name,
    recommendation: `Estimate: ${ex.name} 1RM about ${p.current} kg now → about ${p.predicted} kg in ${weeks} week${weeks === 1 ? '' : 's'} (${p.confidence} confidence).`,
    why: [p.explanation, 'This is a projection of your recent trend, not a promise. It is capped at +2.5% a week.'],
    evidence: [{ label: 'Trend', value: `${signedPct(p.weeklyChangePct)} per week over ${p.sessionsUsed} sessions` }, ...recentSessionsEvidence(st, 4)],
    missing: [],
  };
}

// ---------- "Am I overtraining?" ----------

export function analyzeFatigue(ctx: AnalysisContext): CoachAnswer {
  const f = ctx.fatigue;
  const rec = recoveryStats(ctx);
  const recov = recoveryFindings(rec);
  const advice: Record<string, string> = {
    high: 'Take a lighter week: about half your usual sets at ~90% of your weights.',
    elevated: 'Hold your weights and skip extra sets until recovery catches up.',
    optimal: "You're not overtraining. Keep following your targets.",
    low: "You're fresh. This is a good week to push for PRs or add a set.",
    not_enough_data: 'Keep logging. Fatigue tracking needs 2–3 weeks of history to compare against.',
  };
  const why = [f.explanation, ...recov.map((r) => r.why)];
  const evidence: Evidence[] =
    f.level === 'not_enough_data'
      ? []
      : [
          { label: 'Hard sets, last 7 days', value: String(f.acuteSets) },
          { label: 'Usual week (4-week average)', value: String(f.chronicWeeklySets) },
          ...(f.ratio != null ? [{ label: 'This week ÷ usual', value: String(f.ratio) }] : []),
          ...(f.droppingExercises.length ? [{ label: 'Lifts down >5%', value: f.droppingExercises.join(', ') }] : []),
        ];
  for (const r of recov) for (const e of r.evidence) evidence.push(e);
  const worse = f.level !== 'high' && recov.length >= 2;
  return {
    intent: 'fatigue',
    recommendation: `${f.headline}. ${worse ? 'Your training load looks fine, but your recovery data is poor, so hold your weights this week.' : advice[f.level]}`,
    why,
    evidence,
    missing: missingData(ctx, rec),
  };
}

// ---------- "How is my progress?" ----------

export function analyzeProgress(ctx: AnalysisContext): CoachAnswer {
  const all = ctx.exercises.map((e) => exerciseStats(e, ctx.now)).filter((s) => s.trendPct != null);
  const rec = recoveryStats(ctx);
  if (all.length === 0) {
    return {
      intent: 'progress',
      recommendation: 'Not enough history yet. I need at least 4 sessions of an exercise to measure a trend.',
      why: [],
      evidence: [],
      missing: [],
    };
  }
  const up = all.filter((s) => (s.trendPct as number) >= 2);
  const down = all.filter((s) => (s.trendPct as number) <= -3);
  const evidence = [...all]
    .sort((a, b) => (b.trendPct as number) - (a.trendPct as number))
    .slice(0, 8)
    .map((s) => ({
      label: s.name,
      value: `${signedPct(s.trendPct as number)} (${s.unit === 'kg' ? 'avg est. 1RM' : 'avg best reps'} ${r1(s.recentAvg as number)} vs ${r1(s.priorAvg as number)})`,
    }));
  const why = ['Compared your last 3 sessions with the 3 before them, for every exercise with at least 4 sessions.'];
  if (rec.bodyweight) {
    why.push(`Bodyweight: ${rec.bodyweight.first.bodyweight} → ${rec.bodyweight.last.bodyweight} kg (${signedPct(rec.bodyweight.changePct)}) over the last 30 days.`);
  }
  return {
    intent: 'progress',
    recommendation: `${up.length} of ${all.length} exercises are going up${down.length ? `, ${down.length} going down` : ''}${all.length - up.length - down.length > 0 ? `, ${all.length - up.length - down.length} holding steady` : ''}.`,
    why,
    evidence,
    missing: missingData(ctx, rec),
  };
}
