// Coach chat: works out what you're asking and answers it from your own data.
// Rule-based (keyword matching + the analysis in ./analysis), not a language model:
// every answer comes with its reasons and the data it used.

import {
  type AnalysisContext,
  type CoachAnswer,
  type LibraryLite,
  analyzeAddDay,
  analyzeDrop,
  analyzeExerciseTarget,
  analyzeFatigue,
  analyzePlateau,
  analyzePrediction,
  analyzeProgress,
  analyzeReplace,
  analyzeSets,
  analyzeTrainToday,
  analyzeWeaker,
} from './analysis';
import type { CoachExercise } from './engine';
import { buildProgram, parseProgramRequest, type Program } from './program';

export type { CoachTarget } from './analysis';
export type CoachContext = AnalysisContext;
export type CoachReply = { answer: CoachAnswer; program?: Program };

export const QUICK_QUESTIONS = [
  'Should I train today?',
  'Why am I getting weaker?',
  'How many sets should I do?',
  'Am I overtraining?',
  'Build me a 4-day hypertrophy program',
  'How is my progress?',
];

const STOP = new Set(
  (
    'a an the i me my to do does did on for of in at is am are be with and or should what whats how much many can could will would next time today ' +
    'weight weights reps rep set sets it this that up get getting go lift lifting kg lb lbs predict prediction recommend strong stronger strength max 1rm ' +
    'one week weeks month months about you your coach give tell please now going why not progressing progress stuck plateau drop dropped weaker ' +
    'replace swap substitute alternative instead exercise exercises add another extra day days train training build program split hypertrophy ' +
    'improving improve doing enough so has have been was'
  ).split(' '),
);

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

const GROUP_WORDS: [RegExp, string][] = [
  [/\b(chest|pecs?)\b/, 'Chest'],
  [/\b(back|lats?)\b/, 'Back'],
  [/\b(shoulders?|delts?)\b/, 'Shoulders'],
  [/\b(arms?|biceps?|triceps?|bis|tris)\b/, 'Arms'],
  [/\b(legs?|quads?|hamstrings?|glutes?|calves|calf)\b/, 'Legs'],
  [/\b(core|abs)\b/, 'Core'],
];

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function matchGroup(question: string): string | null {
  const q = question.toLowerCase();
  for (const [re, g] of GROUP_WORDS) if (re.test(q)) return g;
  return null;
}

function stripGroupWords(question: string) {
  let q = question.toLowerCase();
  for (const [re] of GROUP_WORDS) q = q.replace(new RegExp(re.source, 'g'), ' ');
  return q;
}

function bestMatch<T extends { name: string }>(question: string, items: T[], extra: (t: T) => number): T | null {
  const q = words(question)
    .flatMap((w) => ALIASES[w] ?? [w])
    .filter((w) => !STOP.has(w) && w.length >= 2);
  if (q.length === 0) return null;
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const name = new Set(words(item.name.replace(/-/g, ' ')));
    const hits = q.filter((w) => name.has(w) || name.has(w.replace(/s$/, ''))).length;
    if (hits === 0) continue;
    const score = hits * 1000 + extra(item);
    if (!best || score > best.score) best = { item, score };
  }
  return best?.item ?? null;
}

// Which of your logged exercises the question is about, if any
export function matchExercise(question: string, exercises: CoachExercise[]): CoachExercise | null {
  return bestMatch(question, exercises, (e) => e.sessions.length);
}

function matchLibrary(question: string, library: LibraryLite[]): LibraryLite | null {
  return bestMatch(question, library, (l) => (l.popular ? 10 : 0) - l.name.length / 100);
}

function horizonDays(question: string) {
  const m = question.toLowerCase().match(/(\d+)\s*(day|week|wk|month)/);
  if (!m) return 28;
  const n = Math.min(26, Math.max(1, Number(m[1])));
  const days = m[2] === 'day' ? n : m[2] === 'month' ? n * 30 : n * 7;
  return Math.min(182, Math.max(7, days));
}

const has = (q: string, re: RegExp) => re.test(q.toLowerCase());

const simple = (intent: CoachAnswer['intent'], recommendation: string, why: string[] = []): CoachReply => ({
  answer: { intent, recommendation, why, evidence: [], missing: [] },
});

export function answerCoach(question: string, ctx: CoachContext): CoachReply {
  const q = question.trim();

  if (q === '' || has(q, /^(hi|hey|hello|yo|help|\?)\b|what can you do/)) {
    return simple('help', 'Ask me about your training. I answer from your own workouts and check-ins, and show the data behind every answer.', [
      'Why is my bench not progressing?',
      'Why did my squat drop?',
      'Should I add another chest day?',
      'Should I train today?',
      'How many sets should I do?',
      'Can I replace leg press?',
      'Build me a 4-day hypertrophy program',
    ]);
  }

  // Programs can be built without history
  if (
    has(q, /\b(program|programme|split)\b/) ||
    (has(q, /\b(build|make|create|design|write|generate|give me|plan me)\b/) && has(q, /\b(routine|plan|workout|workouts|schedule)\b/))
  ) {
    const { program, answer } = buildProgram(parseProgramRequest(q), {
      exercises: ctx.exercises,
      library: ctx.library ?? [],
      fatigue: ctx.fatigue,
    });
    return { answer, program };
  }

  if (has(q, /replace|swap|substitut|alternative|instead of/)) {
    const ex = matchExercise(q, ctx.exercises);
    const lib = ex ? null : matchLibrary(q, ctx.library ?? []);
    const name = ex?.name ?? lib?.name;
    if (!name) return simple('clarify', 'Which exercise do you want to replace? For example: "Replace barbell bench press".');
    return { answer: analyzeReplace(name, ctx) };
  }

  if (ctx.exercises.length === 0) {
    return simple(
      'no_data',
      "I haven't seen any workouts from you yet. Log your first one and I'll start tracking your strength, effort and recovery. You can already ask me to build you a program.",
    );
  }

  if (has(q, /should i (train|work ?out|go to the gym|lift|go)|train today|rest day|work ?out today|gym today|what should i (train|do today)/)) {
    return { answer: analyzeTrainToday(ctx) };
  }

  const group = matchGroup(q);
  const exInQuestion = matchExercise(stripGroupWords(q), ctx.exercises);

  if (has(q, /\bday\b|\bdays\b|more often|frequency/) && has(q, /add|another|extra|more|second|third/)) {
    const g = group ?? exInQuestion?.group ?? null;
    if (!g) return simple('clarify', 'Which muscle group? For example: "Should I add another chest day?"');
    return { answer: analyzeAddDay(g, ctx) };
  }

  if (has(q, /how many sets|sets should|number of sets|more sets|fewer sets|less sets|enough sets|enough volume|volume/)) {
    return { answer: analyzeSets(ctx, exInQuestion ? null : group, exInQuestion) };
  }

  if (!exInQuestion && has(q, /weaker|losing strength|lost strength|getting worse|strength .*(drop|down)/)) {
    return { answer: analyzeWeaker(ctx) };
  }

  const ex = exInQuestion;
  if (ex) {
    if (has(q, /drop|dropped|decreas|went down|go down|gone down|worse|weaker|lower|fell/)) return { answer: analyzeDrop(ex, ctx) };
    if (has(q, /stuck|plateau|stall|not (progress|improv|going up|moving|getting)|no progress|isn.?t (progress|improv|going up|moving)|why/)) {
      return { answer: analyzePlateau(ex, ctx) };
    }
    if (has(q, /predict|will|future|in \d+|by |1rm|max|how strong|forecast|expect/)) {
      return { answer: analyzePrediction(ex, ctx, horizonDays(q)) };
    }
    return { answer: analyzeExerciseTarget(ex, ctx) };
  }

  if (has(q, /tired|fatigue|overtrain|over-train|recover|sore|deload|readiness|ready|burn ?out|too much/)) {
    return { answer: analyzeFatigue(ctx) };
  }
  if (has(q, /enough|muscle|balanced|imbalance|neglect/)) return { answer: analyzeSets(ctx, group) };
  if (has(q, /progress|improv|stronger|how am i doing|results|gains/)) return { answer: analyzeProgress(ctx) };
  if (has(q, /train|today|workout|plan|week|focus|next/)) return { answer: analyzeTrainToday(ctx) };

  return simple(
    'unknown',
    "I didn't catch that. Name an exercise you've logged (like \"bench\" or \"squat\"), or ask about training today, sets, fatigue, progress, replacing an exercise or building a program.",
  );
}
