// Tests for the coach's analysis: every answer must come from the data, with reasons and sources.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  analyzeAddDay,
  analyzeDrop,
  analyzePlateau,
  analyzeReplace,
  analyzeSets,
  analyzeTrainToday,
  analyzeWeaker,
  rirText,
  sessionLine,
} from '../src/lib/coach/analysis.ts';
import type { AnalysisContext, DailyLog, LibraryLite } from '../src/lib/coach/analysis.ts';
import { fatigueStatus } from '../src/lib/coach/engine.ts';
import type { CoachExercise, CoachSet, WorkoutLoad } from '../src/lib/coach/engine.ts';
import { buildProgram, parseProgramRequest, PATTERN_CHOICES } from '../src/lib/coach/program.ts';

const NOW = new Date('2026-10-14T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
const day = (d: number) => daysAgo(d).slice(0, 10);
const sets = (w: number, reps: number[], rpe?: number): CoachSet[] => reps.map((r) => ({ weight: w, reps: r, rpe: rpe ?? null }));

const LIBRARY: LibraryLite[] = JSON.parse(readFileSync(new URL('../src/data/exercise-library.json', import.meta.url), 'utf8'));

function ctxWith(exercises: CoachExercise[], extra: Partial<AnalysisContext> = {}): AnalysisContext {
  const loads: WorkoutLoad[] = extra.loads ?? [];
  return {
    exercises,
    loads,
    fatigue: extra.fatigue ?? fatigueStatus(loads, exercises, NOW),
    daily: extra.daily ?? [],
    dailyAvailable: extra.dailyAvailable ?? true,
    library: LIBRARY,
    now: NOW,
    ...extra,
  };
}

// Bench: performance sliding while effort climbs from RPE 8 (2 RIR) to ~9.5 (0–1 RIR)
const decliningBench: CoachExercise = {
  name: 'Barbell Bench Press',
  group: 'Chest',
  equipment: 'Barbell',
  sessions: [
    { date: daysAgo(36), sets: sets(80, [8, 8, 8, 8], 8) },
    { date: daysAgo(29), sets: sets(80, [8, 8, 8, 8], 8) },
    { date: daysAgo(22), sets: sets(80, [8, 8, 8, 7], 8) },
    { date: daysAgo(15), sets: sets(80, [7, 7, 6, 6], 9.5) },
    { date: daysAgo(8), sets: sets(77.5, [7, 7, 6, 6], 9.5) },
    { date: daysAgo(1), sets: sets(77.5, [6, 6, 6, 5], 9.5) },
  ],
};

describe('formatting', () => {
  it('turns RPE into reps in reserve', () => {
    assert.equal(rirText(8), '≈2 RIR');
    assert.equal(rirText(9.5), '≈0–1 RIR');
    assert.equal(rirText(10), '≈0 RIR');
  });
  it('describes a session from its real sets, warm-ups excluded', () => {
    const line = sessionLine({ date: daysAgo(1), sets: [{ weight: 40, reps: 10, type: 'warmup' }, ...sets(80, [8, 8, 7], 8)] });
    assert.equal(line, '80 kg × 8, 8, 7 @RPE 8');
  });
});

describe('Why is my bench not progressing?', () => {
  const a = analyzePlateau(decliningBench, ctxWith([decliningBench]));

  it('recommends cutting a set, like a coach would', () => {
    assert.match(a.recommendation, /Reduce Barbell Bench Press from 4 sets to 3/);
  });
  it('explains with real numbers: performance down, effort up from 2 RIR to 0–1 RIR', () => {
    assert.ok(a.why[0].includes('%'));
    assert.ok(a.why.some((w) => w.includes('≈2 RIR') && w.includes('≈0–1 RIR')));
  });
  it('shows the sessions it used', () => {
    assert.ok(a.evidence.some((e) => e.value.includes('77.5 kg × 6, 6, 6, 5 @RPE 9.5')));
  });
  it('never invents sleep or food: says they are missing instead', () => {
    assert.ok(!a.why.some((w) => /sleep|calorie|protein|bodyweight/i.test(w)));
    assert.ok(a.missing.some((m) => /Sleep/.test(m)));
    assert.ok(a.missing.some((m) => /Bodyweight/.test(m)));
  });
});

describe('Why did my squat drop?', () => {
  const squat: CoachExercise = {
    name: 'Barbell Full Squat',
    group: 'Legs',
    equipment: 'Barbell',
    sessions: [
      { date: daysAgo(15), sets: sets(120, [5, 5, 5]) },
      { date: daysAgo(8), sets: sets(122.5, [5, 5, 5]) },
      { date: daysAgo(1), sets: sets(110, [5, 5, 4]) },
    ],
  };
  const daily: DailyLog[] = [3, 2, 1].map((d) => ({
    date: day(d),
    bodyweight: null,
    calories: null,
    protein: null,
    sleep: 5,
    soreness: null,
    energy: null,
  }));

  it('blames logged short sleep, with the numbers', () => {
    const a = analyzeDrop(squat, ctxWith([squat], { daily }));
    assert.match(a.why[0], /from 142\.9 kg to 128\.3 kg/);
    assert.ok(a.why.some((w) => /5 h of sleep/.test(w)));
  });

  it('a small change is called normal variation, not a drop', () => {
    const steady: CoachExercise = { ...squat, sessions: [squat.sessions[0], { date: daysAgo(1), sets: sets(120, [5, 5, 5]) }] };
    assert.match(analyzeDrop(steady, ctxWith([steady])).recommendation, /hasn't really dropped/);
  });
});

describe('Why am I getting weaker?', () => {
  it('names the lifts that are down', () => {
    const a = analyzeWeaker(ctxWith([decliningBench]));
    assert.match(a.why[0], /Barbell Bench Press/);
  });
  it('says so when the data shows no weakness', () => {
    const up: CoachExercise = {
      ...decliningBench,
      sessions: [70, 72.5, 75, 77.5, 80, 82.5].map((w, i) => ({ date: daysAgo(40 - i * 7), sets: sets(w, [8, 8, 8]) })),
    };
    assert.match(analyzeWeaker(ctxWith([up])).recommendation, /doesn't show you getting weaker/);
  });
});

describe('Should I add another chest day?', () => {
  const once: CoachExercise = {
    ...decliningBench,
    sessions: [27, 20, 13, 6].map((d) => ({ date: daysAgo(d), sets: sets(80, [8, 8, 8]) })),
  };
  it('once a week and not improving → yes, with frequency and sets as evidence', () => {
    const a = analyzeAddDay('Chest', ctxWith([once]));
    assert.match(a.recommendation, /^Yes/);
    assert.ok(a.evidence.some((e) => e.label.includes('training days') && e.value.startsWith('1 ')));
  });
  it('high fatigue → no', () => {
    const tired = { ...fatigueStatus([], [], NOW), level: 'high' as const };
    assert.match(analyzeAddDay('Chest', ctxWith([once], { fatigue: tired })).recommendation, /^No/);
  });
});

describe('Should I train today?', () => {
  const ex: CoachExercise = { ...decliningBench, sessions: [{ date: daysAgo(2), sets: sets(80, [8, 8, 8]) }] };
  it('3 hours of sleep → rest, citing the check-in', () => {
    const daily: DailyLog[] = [{ date: day(0), bodyweight: null, calories: null, protein: null, sleep: 3, soreness: 2, energy: 3 }];
    const a = analyzeTrainToday(ctxWith([ex], { daily }));
    assert.match(a.recommendation, /rest day/);
    assert.ok(a.evidence.some((e) => e.label === 'Sleep last night' && e.value === '3 h'));
  });
  it('no check-in → still answers, and asks for one', () => {
    const a = analyzeTrainToday(ctxWith([ex]));
    assert.match(a.recommendation, /^Yes, train today/);
    assert.ok(a.missing[0].includes("Today's check-in"));
  });
});

describe('How many sets should I do?', () => {
  it('per muscle group, from your weekly sets', () => {
    const a = analyzeSets(ctxWith([decliningBench]));
    assert.ok(a.why.some((w) => w.startsWith('Chest:')));
    assert.ok(a.evidence.some((e) => e.label === 'Chest hard sets / week'));
  });
  it('for a specific exercise that is declining at high effort → fewer sets', () => {
    assert.match(analyzeSets(ctxWith([decliningBench]), null, decliningBench).recommendation, /drop to 3 sets/);
  });
});

describe('Can I replace this exercise?', () => {
  it('suggests same-muscle exercises from the library, ones you do first', () => {
    const incline: CoachExercise = { name: 'Dumbbell Incline Bench Press', group: 'Chest', equipment: 'Dumbbell', sessions: [{ date: daysAgo(3), sets: sets(30, [10, 10, 10]) }] };
    const a = analyzeReplace('Barbell Bench Press', ctxWith([decliningBench, incline]));
    assert.match(a.recommendation, /Dumbbell Incline Bench Press/);
    assert.ok(a.evidence[0].value.includes("you've done it"));
    for (const e of a.evidence) assert.equal(LIBRARY.find((l) => l.name === e.label)?.muscle, 'Chest');
  });
});

describe('Build me a 4-day hypertrophy program', () => {
  it('reads days and goal from the question', () => {
    assert.deepEqual(parseProgramRequest('Build me a 4-day hypertrophy program'), { days: 4, goal: 'hypertrophy' });
    assert.deepEqual(parseProgramRequest('make a three day strength split'), { days: 3, goal: 'strength' });
  });

  it('every exercise name exists in the library', () => {
    for (const names of Object.values(PATTERN_CHOICES)) {
      for (const n of names) assert.ok(LIBRARY.some((l) => l.name === n), `${n} missing from library`);
    }
  });

  it('builds upper/lower, uses exercises you do, with starting weights', () => {
    const { program, answer } = buildProgram({ days: 4, goal: 'hypertrophy' }, { exercises: [decliningBench], library: LIBRARY, fatigue: fatigueStatus([], [], NOW) });
    assert.deepEqual(program.days.map((d) => d.name), ['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    const bench = program.days[0].exercises.find((e) => e.name === 'Barbell Bench Press');
    assert.ok(bench?.start, 'starting target from history');
    for (const d of program.days) assert.equal(new Set(d.exercises.map((e) => e.name)).size, d.exercises.length, 'no repeats in a day');
    const chest = program.weeklySets.find((w) => w.group === 'Chest')?.sets ?? 0;
    assert.ok(chest >= 9 && chest <= 20);
    assert.ok(answer.why.some((w) => w.includes('upper/lower')));
  });

  for (const days of [2, 3, 5, 6]) {
    it(`${days} days works`, () => {
      const { program } = buildProgram({ days, goal: 'strength' }, { exercises: [], library: LIBRARY, fatigue: fatigueStatus([], [], NOW) });
      assert.equal(program.days.length, days);
    });
  }
});
