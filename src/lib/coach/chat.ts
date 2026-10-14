// Coach chat: understands short questions and answers them from the coach engine.
// This is rule-based (keyword matching + your data), not a language model, so every
// answer is grounded in what you've logged.

import {
  adaptivePlan,
  type CoachExercise,
  type FatigueStatus,
  predictStrength,
  recommendNext,
  sessionBestE1rm,
  weeklyGroupVolume,
  WEEKLY_SET_TARGET,
} from './engine';

export type CoachTarget = { min: number | null; max: number | null; sets?: number };

export type CoachContext = {
  exercises: CoachExercise[];
  fatigue: FatigueStatus;
  targets?: Map<string, CoachTarget>; // routine targets by lower-case exercise name
  now?: Date;
};

export type CoachReply = {
  text: string;
  exercise?: string; // the exercise this answer is about (the app can show an info button)
  intent: 'help' | 'fatigue' | 'plan' | 'volume' | 'progress' | 'predict' | 'recommend' | 'plateau' | 'unknown' | 'no_data';
};

export const QUICK_QUESTIONS = [
  'What should I train today?',
  'Am I overtraining?',
  'Am I doing enough sets?',
  'How is my progress?',
];

const STOP = new Set(
  'a an the i me my to do does did on for of in at is am are be with and or should what whats how much many can could will would next time today weight weights reps rep set sets my it this that up get getting go lift lifting kg lb lbs predict prediction recommend strong stronger strength max 1rm one week weeks month months in about you your coach give tell please now going'.split(
    ' ',
  ),
);

// Common short names people type
const ALIASES: Record<string, string[]> = {
  bench: ['bench', 'press'],
  ohp: ['overhead', 'press'],
  rdl: ['romanian', 'deadlift'],
  dl: ['deadlift'],
  deadlifts: ['deadlift'],
  squats: ['squat'],
  curls: ['curl'],
  pullups: ['pull', 'up'],
  'pull-ups': ['pull', 'up'],
  pushups: ['push', 'up'],
  'push-ups': ['push', 'up'],
  rows: ['row'],
  dips: ['dip'],
};

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Finds which of your logged exercises the question is about, if any
export function matchExercise(question: string, exercises: CoachExercise[]): CoachExercise | null {
  const q = words(question).flatMap((w) => ALIASES[w] ?? [w]).filter((w) => !STOP.has(w) && w.length >= 2);
  if (q.length === 0) return null;
  let best: { ex: CoachExercise; score: number } | null = null;
  for (const ex of exercises) {
    const name = new Set(words(ex.name.replace(/-/g, ' ')));
    const hits = q.filter((w) => name.has(w) || name.has(w.replace(/s$/, ''))).length;
    if (hits === 0) continue;
    // more matching words first; then the exercise you do most
    const score = hits * 1000 + ex.sessions.length;
    if (!best || score > best.score) best = { ex, score };
  }
  return best?.ex ?? null;
}

function horizonDays(question: string) {
  const m = question.toLowerCase().match(/(\d+)\s*(day|week|wk|month)/);
  if (!m) return 28;
  const n = Math.min(26, Math.max(1, Number(m[1])));
  const unit = m[2];
  const days = unit === 'day' ? n : unit === 'month' ? n * 30 : n * 7;
  return Math.min(182, Math.max(7, days));
}

function has(question: string, pattern: RegExp) {
  return pattern.test(question.toLowerCase());
}

function weeksLabel(days: number) {
  const weeks = Math.round(days / 7);
  return weeks >= 8 ? `${Math.round(days / 30)} months` : `${weeks} week${weeks === 1 ? '' : 's'}`;
}

export function answerCoach(question: string, ctx: CoachContext): CoachReply {
  const now = ctx.now ?? new Date();
  const q = question.trim();

  if (ctx.exercises.length === 0) {
    return {
      intent: 'no_data',
      text: "I haven't seen any workouts from you yet. Log your first one and I'll start tracking your strength, recommending weights and reps, and watching your fatigue.",
    };
  }

  if (q === '' || has(q, /^(hi|hey|hello|yo|help|\?)\b|what can you do/)) {
    return {
      intent: 'help',
      text:
        'Ask me about your training. For example:\n• "What should I do on bench next time?"\n• "How strong will my squat be in 8 weeks?"\n• "Am I overtraining?"\n• "What should I train today?"\n• "Am I doing enough sets?"\n• "Why am I stuck on deadlift?"',
    };
  }

  const ex = matchExercise(q, ctx.exercises);
  const fatigue = ctx.fatigue;

  if (ex) {
    const target = ctx.targets?.get(ex.name.toLowerCase());
    const plateau = has(q, /stuck|plateau|stall|not (getting|improving)|no progress|why/);
    const predict = has(q, /predict|will|future|in \d+|by |1rm|max|how strong|forecast|expect/);

    if (plateau || predict) {
      const p = predictStrength(ex, now, horizonDays(q));
      const rec = recommendNext(ex, { target, fatigue: fatigue.level });
      if ('notEnoughData' in p) {
        return {
          intent: plateau ? 'plateau' : 'predict',
          exercise: ex.name,
          text: `${p.notEnoughData}\n\nFor now, next time aim for ${rec.headline}. ${rec.reason}`,
        };
      }
      if (plateau) {
        const tips =
          p.trend === 'up'
            ? `You're not actually stuck: your estimated 1RM is up about ${p.weeklyChangePct.toFixed(1)}% a week.`
            : p.trend === 'down'
              ? `Your estimated 1RM has dipped about ${Math.abs(p.weeklyChangePct).toFixed(1)}% a week. Usually that's fatigue, sleep or food, not your program.`
              : `Your estimated 1RM has been flat at about ${p.current} kg over ${p.sessionsUsed} sessions.`;
        const fix =
          fatigue.level === 'high' || fatigue.level === 'elevated'
            ? 'Your overall fatigue is up too, so a lighter week first is the best fix.'
            : 'Try a different rep range for 3–4 weeks, add one set, or add reps before adding weight.';
        return {
          intent: 'plateau',
          exercise: ex.name,
          text: `${tips} ${fix}\n\nNext time: ${rec.headline}. ${rec.reason}`,
        };
      }
      return {
        intent: 'predict',
        exercise: ex.name,
        text: `${ex.name}: estimated 1RM about ${p.current} kg now → about ${p.predicted} kg in ${weeksLabel(p.horizonDays)} (${p.confidence} confidence, from ${p.sessionsUsed} sessions).\n\n${p.explanation}\n\nThis is an estimate from your trend, not a promise.`,
      };
    }

    const rec = recommendNext(ex, { target, fatigue: fatigue.level });
    const best = ex.sessions.length ? sessionBestE1rm(ex.sessions[ex.sessions.length - 1]) : null;
    const last = best ? ` Your last session's best was about ${best} kg estimated 1RM.` : '';
    return {
      intent: 'recommend',
      exercise: ex.name,
      text: `${ex.name} next time: ${rec.headline} (${rec.repRange.min}–${rec.repRange.max} rep range).\n\n${rec.reason}${last}`,
    };
  }

  if (has(q, /tired|fatigue|overtrain|over-train|rest day|recover|sore|deload|ready|readiness|burn ?out|too much/)) {
    const extra =
      fatigue.daysSinceLastWorkout != null && fatigue.daysSinceLastWorkout >= 4
        ? ` It's been ${fatigue.daysSinceLastWorkout} days since your last workout.`
        : '';
    return { intent: 'fatigue', text: `${fatigue.headline}. ${fatigue.explanation}${extra}` };
  }

  if (has(q, /enough|volume|how many sets|sets per|muscle|balanced|imbalance|neglect/)) {
    const volume = weeklyGroupVolume(ctx.exercises, now);
    const lines = volume.map((v) => {
      const mark = v.status === 'in_range' ? '✓' : v.status === 'over' ? '⚠︎' : '•';
      const since = v.sets === 0 && v.lastTrainedDays != null ? ` (last trained ${v.lastTrainedDays} days ago)` : '';
      return `${mark} ${v.group}: ${v.sets} sets${since}`;
    });
    const under = volume.filter((v) => v.status === 'none' || v.status === 'under').map((v) => v.group);
    const over = volume.filter((v) => v.status === 'over').map((v) => v.group);
    const summary = [
      under.length ? `Under ${WEEKLY_SET_TARGET.min} sets: ${under.join(', ')}.` : 'Every group is at 10+ sets.',
      over.length ? `Over ${WEEKLY_SET_TARGET.max}: ${over.join(', ')}; more isn't always better.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return {
      intent: 'volume',
      text: `Hard sets in the last 7 days (warm-ups don't count). A common target for muscle growth is ${WEEKLY_SET_TARGET.min}–${WEEKLY_SET_TARGET.max} per group:\n${lines.join('\n')}\n\n${summary}`,
    };
  }

  if (has(q, /progress|improv|getting stronger|am i stronger|how am i doing|results|gains/)) {
    const trends = ctx.exercises
      .map((e) => ({ e, p: predictStrength(e, now) }))
      .filter((x): x is { e: CoachExercise; p: Exclude<ReturnType<typeof predictStrength>, { notEnoughData: string }> } => !('notEnoughData' in x.p))
      .sort((a, b) => b.p.weeklyChangePct - a.p.weeklyChangePct);
    if (trends.length === 0) {
      return {
        intent: 'progress',
        text: 'I need at least 3 weighted sessions of an exercise over 10+ days to measure progress. Keep logging and ask again soon.',
      };
    }
    const up = trends.filter((t) => t.p.trend === 'up');
    const down = trends.filter((t) => t.p.trend === 'down');
    const fmt = (t: (typeof trends)[number]) => `${t.e.name} (${t.p.weeklyChangePct > 0 ? '+' : ''}${t.p.weeklyChangePct.toFixed(1)}%/week)`;
    const parts = [
      `Measured ${trends.length} exercise${trends.length === 1 ? '' : 's'} by estimated 1RM.`,
      up.length ? `Going up: ${up.slice(0, 4).map(fmt).join(', ')}.` : 'Nothing is clearly going up yet.',
      down.length ? `Going down: ${down.slice(0, 3).map(fmt).join(', ')}.` : '',
      trends.length - up.length - down.length > 0 ? `${trends.length - up.length - down.length} holding steady.` : '',
    ];
    return { intent: 'progress', text: parts.filter(Boolean).join(' ') };
  }

  if (has(q, /train|today|workout|plan|program|routine|schedule|week|focus|next/)) {
    const plan = adaptivePlan(ctx.exercises, fatigue, now);
    const sugg = plan.suggestions.map((s) => `• ${s.exercise}: ${s.recommendation.headline}`).join('\n');
    const focus = plan.focusGroups.length ? `Focus on ${plan.focusGroups.join(' and ')} (least trained this week).` : '';
    return {
      intent: 'plan',
      text: `${fatigue.level === 'not_enough_data' ? '' : `${fatigue.headline}. `}${focus}\n\n${plan.weekAdvice}${sugg ? `\n\n${sugg}` : ''}`.trim(),
    };
  }

  return {
    intent: 'unknown',
    text: "I didn't catch that. Name an exercise you've logged (like \"bench\" or \"squat\"), or ask about fatigue, weekly sets, progress or what to train today.",
  };
}
