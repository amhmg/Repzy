// Program builder: "Build me a 4-day hypertrophy program."
// Picks a split for the number of days, fills each slot with an exercise you already do
// when there is one (so the coach can suggest weights), and explains every choice.

import type { CoachAnswer, Evidence, LibraryLite } from './analysis';
import { recommendNext, type CoachExercise, type FatigueStatus, WEEKLY_SET_TARGET } from './engine';

export type Goal = 'hypertrophy' | 'strength';
export type Equipment = 'gym' | 'dumbbells' | 'bodyweight';
export type ProgramRequest = { days: number; goal: Goal; weeks: number; equipment: Equipment };

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  gym: 'Full gym',
  dumbbells: 'Dumbbells only',
  bodyweight: 'Bodyweight only',
};

export type ProgramExercise = {
  name: string;
  group: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
  start: string | null; // suggested starting target from your history
};

export type ProgramDay = { name: string; exercises: ProgramExercise[] };

export type Program = {
  name: string;
  goal: Goal;
  daysPerWeek: number;
  weeks: number;
  equipment: Equipment;
  days: ProgramDay[];
  weeklySets: { group: string; sets: number }[];
  weekPlan: string[]; // one line per week
};

type Slot = { pattern: Pattern; kind: 'main' | 'compound' | 'isolation' };

type Pattern =
  | 'press'
  | 'incline'
  | 'fly'
  | 'ohp'
  | 'lateral'
  | 'rear'
  | 'vpull'
  | 'hpull'
  | 'squat'
  | 'legpress'
  | 'hinge'
  | 'lunge'
  | 'legext'
  | 'legcurl'
  | 'calf'
  | 'biceps'
  | 'triceps'
  | 'core';

// Library names (checked against the exercise library in the tests). Earlier = preferred.
// Each slot only uses exercises that match the equipment you have.
export const PATTERN_CHOICES: Record<Pattern, string[]> = {
  press: ['Barbell Bench Press', 'Dumbbell Bench Press', 'Lever Chest Press', 'Push-Up'],
  incline: ['Dumbbell Incline Bench Press', 'Barbell Incline Bench Press', 'Decline Push-Up'],
  fly: ['Dumbbell Fly', 'Chest Dip', 'Archer Push Up'],
  ohp: ['Barbell Seated Overhead Press', 'Dumbbell Seated Shoulder Press', 'Dumbbell Arnold Press'],
  lateral: ['Dumbbell Lateral Raise', 'Cable Lateral Raise'],
  rear: ['Dumbbell Rear Fly'],
  vpull: ['Cable Pulldown', 'Pull-Up', 'Chin-Up'],
  hpull: ['Barbell Bent Over Row', 'Cable Seated Row', 'Dumbbell Bent Over Row', 'Inverted Row'],
  squat: ['Barbell Full Squat', 'Sled Hack Squat', 'Dumbbell Goblet Squat', 'One Leg Squat'],
  legpress: ['Sled 45° Leg Press', 'Dumbbell Single Leg Split Squat', 'Split Squats'],
  hinge: ['Barbell Romanian Deadlift', 'Barbell Deadlift', 'Trap Bar Deadlift', 'Dumbbell Romanian Deadlift', 'Glute Bridge Two Legs On Bench (Male)'],
  lunge: ['Dumbbell Lunge', 'Walking Lunge'],
  legext: ['Lever Leg Extension', 'Dumbbell Step-Up', 'Split Squats'],
  legcurl: ['Lever Lying Leg Curl', 'Lever Seated Leg Curl', 'Inverse Leg Curl (Bench Support)'],
  calf: ['Lever Seated Calf Raise', 'Barbell Standing Calf Raise', 'Dumbbell Standing Calf Raise', 'Bodyweight Standing Calf Raise'],
  biceps: ['Barbell Curl', 'Dumbbell Biceps Curl', 'Dumbbell Hammer Curl', 'Chin-Up'],
  triceps: ['Cable Pushdown', 'Barbell Lying Triceps Extension Skull Crusher', 'Dumbbell Seated Triceps Extension', 'Dumbbell Kickback', 'Bench Dip (Knees Bent)', 'Close-Grip Push-Up'],
  core: ['Hanging Leg Raise', 'Crunch Floor'],
};

const ALLOWED: Record<Equipment, (eq: string) => boolean> = {
  gym: () => true,
  dumbbells: (eq) => eq === 'Dumbbell' || eq === 'Body Weight',
  bodyweight: (eq) => eq === 'Body Weight',
};

const s = (pattern: Pattern, kind: Slot['kind'] = 'isolation'): Slot => ({ pattern, kind });

const UPPER_A = [s('press', 'main'), s('hpull', 'compound'), s('ohp', 'compound'), s('vpull', 'compound'), s('lateral'), s('triceps'), s('biceps')];
const UPPER_B = [s('incline', 'main'), s('vpull', 'compound'), s('hpull', 'compound'), s('fly'), s('rear'), s('biceps'), s('triceps')];
const LOWER_A = [s('squat', 'main'), s('hinge', 'compound'), s('legpress', 'compound'), s('legcurl'), s('calf'), s('core')];
const LOWER_B = [s('hinge', 'main'), s('squat', 'compound'), s('lunge', 'compound'), s('legext'), s('legcurl'), s('calf')];
const PUSH = [s('press', 'main'), s('ohp', 'compound'), s('incline', 'compound'), s('lateral'), s('fly'), s('triceps')];
const PULL = [s('vpull', 'main'), s('hpull', 'compound'), s('rear'), s('biceps'), s('biceps'), s('core')];
const LEGS = [s('squat', 'main'), s('hinge', 'compound'), s('legpress', 'compound'), s('legext'), s('legcurl'), s('calf')];
const FULL_A = [s('squat', 'main'), s('press', 'compound'), s('hpull', 'compound'), s('legcurl'), s('lateral'), s('biceps')];
const FULL_B = [s('hinge', 'main'), s('ohp', 'compound'), s('vpull', 'compound'), s('legext'), s('triceps'), s('core')];
const FULL_C = [s('legpress', 'main'), s('incline', 'compound'), s('hpull', 'compound'), s('lunge', 'compound'), s('rear'), s('calf')];

const SPLITS: Record<number, { name: string; days: [string, Slot[]][]; why: string }> = {
  2: { name: 'Full body', days: [['Full Body A', FULL_A], ['Full Body B', FULL_B]], why: 'With 2 days, full-body sessions hit every muscle twice a week.' },
  3: { name: 'Full body', days: [['Full Body A', FULL_A], ['Full Body B', FULL_B], ['Full Body C', FULL_C]], why: 'With 3 days, full-body sessions train each muscle about 3 times a week with manageable sessions.' },
  4: { name: 'Upper / Lower', days: [['Upper A', UPPER_A], ['Lower A', LOWER_A], ['Upper B', UPPER_B], ['Lower B', LOWER_B]], why: 'With 4 days, an upper/lower split trains every muscle twice a week, which works well for most lifters.' },
  5: { name: 'Upper / Lower + Push / Pull / Legs', days: [['Upper', UPPER_A], ['Lower', LOWER_A], ['Push', PUSH], ['Pull', PULL], ['Legs', LOWER_B]], why: 'With 5 days, upper/lower plus push/pull/legs gives each muscle about 2 sessions a week.' },
  6: { name: 'Push / Pull / Legs', days: [['Push A', PUSH], ['Pull A', PULL], ['Legs A', LEGS], ['Push B', UPPER_B], ['Pull B', PULL], ['Legs B', LOWER_B]], why: 'With 6 days, push/pull/legs twice through hits every muscle twice a week.' },
};

function prescription(kind: Slot['kind'], goal: Goal) {
  if (goal === 'strength') {
    if (kind === 'main') return { sets: 4, repMin: 3, repMax: 6, rest: 180 };
    if (kind === 'compound') return { sets: 3, repMin: 6, repMax: 8, rest: 150 };
    return { sets: 3, repMin: 8, repMax: 12, rest: 90 };
  }
  if (kind === 'main') return { sets: 3, repMin: 6, repMax: 10, rest: 150 };
  if (kind === 'compound') return { sets: 3, repMin: 8, repMax: 12, rest: 120 };
  return { sets: 3, repMin: 10, repMax: 15, rest: 75 };
}

function weeklySetsNote(weekly: { group: string; sets: number }[]) {
  const main = weekly.filter((w) => w.group !== 'Core');
  const inRange = main.filter((w) => w.sets >= WEEKLY_SET_TARGET.min - 1 && w.sets <= WEEKLY_SET_TARGET.max);
  const parts: string[] = [];
  if (inRange.length) {
    parts.push(`Weekly hard sets: ${inRange.map((w) => `${w.group} ${w.sets}`).join(', ')}, close to the common ${WEEKLY_SET_TARGET.min}–${WEEKLY_SET_TARGET.max} range.`);
  }
  const legs = main.find((w) => w.group === 'Legs');
  if (legs && legs.sets > WEEKLY_SET_TARGET.max) {
    parts.push(`Legs shows ${legs.sets} because it covers quads, hamstrings, glutes and calves together; each of those gets about 6–12.`);
  }
  const low = main.filter((w) => w.sets < WEEKLY_SET_TARGET.min - 1 && w.group !== 'Legs');
  if (low.length) parts.push(`${low.map((w) => w.group).join(', ')} also get indirect work from presses and rows.`);
  return parts.join(' ');
}

export function parseProgramRequest(q: string): ProgramRequest {
  const text = q.toLowerCase();
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10, twelve: 12 };
  const num = (v: string) => words[v] ?? Number(v);
  const d = text.match(/\b([2-6]|two|three|four|five|six)[\s-]*(day|days|x)\b/);
  const w = text.match(/\b(\d{1,2}|one|two|three|four|five|six|eight|ten|twelve)[\s-]*(week|weeks|wk|wks)\b/);
  const m = text.match(/\b(\d{1,2}|one|two|three)[\s-]*(month|months)\b/);
  const days = d ? num(d[1]) : 4;
  const weeks = w ? num(w[1]) : m ? num(m[1]) * 4 : 4;
  const goal: Goal = /strength|powerlift|stronger|heavy/.test(text) ? 'strength' : 'hypertrophy';
  const equipment: Equipment = /body ?weight|no equipment|calisthenics|at home without/.test(text)
    ? 'bodyweight'
    : /dumbbell/.test(text)
      ? 'dumbbells'
      : 'gym';
  return { days: Math.min(6, Math.max(2, days)), goal, weeks: Math.min(12, Math.max(1, weeks)), equipment };
}

// What to do each week: build up effort, add reps/weight, and a lighter last week on longer blocks
export function weekByWeek(weeks: number, goal: Goal): string[] {
  const plan: string[] = [];
  const deload = weeks >= 5;
  for (let i = 1; i <= weeks; i++) {
    if (i === 1) {
      plan.push(`Week 1: find your working weights. Stop each set with 2–3 reps left (RPE 7–8).`);
    } else if (deload && i === weeks) {
      plan.push(`Week ${i}: lighter week. Same exercises, one set fewer, about 10% less weight, then start a new block heavier.`);
    } else if (goal === 'strength') {
      plan.push(`Week ${i}: add the smallest weight jump to your main lifts if last week's reps were all hit; RPE 8–9.`);
    } else {
      plan.push(`Week ${i}: beat last week: add a rep to each set, or add weight once you reach the top of the range (RPE 8–9).`);
    }
  }
  return plan;
}

export function buildProgram(
  input0: Partial<ProgramRequest> & { days: number; goal: Goal },
  input: { exercises: CoachExercise[]; library: LibraryLite[]; fatigue: FatigueStatus },
): { program: Program; answer: CoachAnswer } {
  const request: ProgramRequest = { weeks: 4, equipment: 'gym', ...input0 };
  const days = Math.min(6, Math.max(2, request.days));
  const allowed = ALLOWED[request.equipment];
  const split = SPLITS[days];
  const lib = new Map(input.library.map((l) => [l.name.toLowerCase(), l]));
  const mine = new Map(input.exercises.map((e) => [e.name.toLowerCase(), e]));
  const used = new Map<Pattern, string[]>(); // pattern -> names already used, for variety
  const picksFromHistory = new Set<string>();
  const tired = input.fatigue.level === 'high';
  let skipped = 0;

  // The choice for a pattern: the one you've done most, else the first in the list.
  // A second appearance in the week takes the next option for variety.
  function choose(pattern: Pattern, dayNames: Set<string>): string | null {
    const options = PATTERN_CHOICES[pattern].filter(
      (n) => lib.has(n.toLowerCase()) && !dayNames.has(n) && allowed(lib.get(n.toLowerCase())?.equipment ?? ''),
    );
    if (options.length === 0) return null;
    const ranked = [...options].sort((a, b) => (mine.get(b.toLowerCase())?.sessions.length ?? 0) - (mine.get(a.toLowerCase())?.sessions.length ?? 0));
    const before = used.get(pattern) ?? [];
    const fresh = ranked.filter((n) => !before.includes(n));
    const pick = before.length > 0 && fresh.length > 0 ? fresh[0] : ranked[0];
    used.set(pattern, [...before, pick]);
    return pick;
  }

  const programDays: ProgramDay[] = split.days.map(([dayName, slots]) => {
    const names = new Set<string>();
    const exercises: ProgramExercise[] = [];
    for (const slot of slots) {
      const name = choose(slot.pattern, names);
      if (!name) {
        skipped++;
        continue;
      }
      names.add(name);
      const p = prescription(slot.kind, request.goal);
      const sets = tired && slot.kind !== 'isolation' ? p.sets - 1 : p.sets;
      const history = mine.get(name.toLowerCase());
      let start: string | null = null;
      if (history && history.sessions.length > 0) {
        picksFromHistory.add(name);
        const r = recommendNext(history, { target: { min: p.repMin, max: p.repMax, sets } });
        start = r.action === 'start' ? null : r.headline;
      }
      exercises.push({
        name,
        group: lib.get(name.toLowerCase())?.group ?? 'Other',
        sets,
        repMin: p.repMin,
        repMax: p.repMax,
        restSeconds: p.rest,
        start,
      });
    }
    return { name: dayName, exercises };
  });

  const totals = new Map<string, number>();
  for (const d of programDays) for (const e of d.exercises) totals.set(e.group, (totals.get(e.group) ?? 0) + e.sets);
  const weeklySets = [...totals.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets);

  const goalLabel = request.goal === 'strength' ? 'Strength' : 'Hypertrophy';
  const weekPlan = weekByWeek(request.weeks, request.goal);
  const program: Program = {
    name: `${request.weeks}-Week ${goalLabel} · ${days} days a week (${split.name})`,
    goal: request.goal,
    daysPerWeek: days,
    weeks: request.weeks,
    equipment: request.equipment,
    days: programDays,
    weeklySets,
    weekPlan,
  };

  const why = [
    split.why,
    request.goal === 'strength'
      ? 'Strength focus: main lifts in the 3–6 rep range with longer rest, accessories at 6–12 reps.'
      : 'Hypertrophy focus: main lifts at 6–10 reps, other exercises at 8–15, about 2 reps short of failure (RPE 8).',
    weeklySetsNote(weeklySets),
    picksFromHistory.size > 0
      ? `I used ${picksFromHistory.size} exercise${picksFromHistory.size === 1 ? '' : 's'} you already do (${[...picksFromHistory].slice(0, 4).join(', ')}${picksFromHistory.size > 4 ? '…' : ''}), with starting targets from your history.`
      : "You haven't logged these exercises yet, so start light and let the coach adjust after your first sessions.",
    'Progression: when you hit the top of the rep range on every set, add weight next time (the coach shows this in each workout).',
  ];
  if (tired) why.push('Your current training load is high, so compound lifts start with one set fewer for the first week.');
  if (request.equipment !== 'gym') {
    why.push(
      `${EQUIPMENT_LABEL[request.equipment]}: every exercise uses ${request.equipment === 'dumbbells' ? 'dumbbells or your bodyweight' : 'your bodyweight only'}${skipped ? `; ${skipped} slot${skipped === 1 ? ' was' : 's were'} left out because no suitable exercise needs only that equipment` : ''}. Pull-ups and chin-ups need a bar.`,
    );
  }
  why.push(`${request.weeks} week${request.weeks === 1 ? '' : 's'}: repeat the same ${days} days each week and follow the week-by-week plan.`);

  const evidence: Evidence[] = weeklySets.map((w) => ({ label: `${w.group} sets / week`, value: String(w.sets) }));
  return {
    program,
    answer: {
      intent: 'program',
      recommendation: `${program.name}: ${programDays.map((d) => d.name).join(' · ')}. Tap "Add routine" on each day to review it and add it to your routines.`,
      why,
      evidence,
      missing: [],
    },
  };
}
