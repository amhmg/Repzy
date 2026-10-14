// Tests for turning saved workouts into coach input, and for the coach chat answers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { answerCoach, matchExercise, QUICK_QUESTIONS } from '../src/lib/coach/chat.ts';
import { fatigueStatus } from '../src/lib/coach/engine.ts';
import type { CoachExercise } from '../src/lib/coach/engine.ts';
import { buildCoachInput } from '../src/lib/coach/input.ts';
import type { RawWorkout } from '../src/lib/coach/input.ts';

const NOW = new Date('2026-10-14T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();

const lookup = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('bench')) return { group: 'Chest', equipment: 'Barbell' };
  if (n.includes('squat')) return { group: 'Legs', equipment: 'Barbell' };
  if (n.includes('curl')) return { group: 'Arms', equipment: 'Dumbbell' };
  return null;
};

function workout(d: number, exercises: { name: string; sets: [number | null, number, string?][] }[]): RawWorkout {
  return {
    id: `w${d}`,
    started_at: daysAgo(d),
    created_at: daysAgo(d),
    exercises: exercises.map((e, i) => ({
      name: e.name,
      order_index: i,
      sets: e.sets.map(([weight, reps, type], j) => ({
        set_number: j + 1,
        weight: weight == null ? null : String(weight), // the database sends numerics as strings
        reps,
        set_type: type ?? 'normal',
        rpe: null,
      })),
    })),
  };
}

describe('buildCoachInput', () => {
  const rows = [
    workout(2, [
      { name: 'Barbell Bench Press', sets: [[40, 10, 'warmup'], [80, 8], [80, 8]] },
      { name: 'Dumbbell Curl', sets: [[12, 12], [12, 0]] },
    ]),
    workout(9, [{ name: 'barbell bench press', sets: [[77.5, 8], [77.5, 8]] }]),
  ];
  const { exercises, loads } = buildCoachInput(rows, lookup);

  it('groups the same exercise across workouts, oldest first, with library info', () => {
    const bench = exercises.find((e) => e.name.toLowerCase() === 'barbell bench press');
    assert.ok(bench);
    assert.equal(bench.sessions.length, 2);
    assert.equal(bench.sessions[0].sets[0].weight, 77.5);
    assert.equal(bench.name, 'Barbell Bench Press'); // latest spelling
    assert.equal(bench.group, 'Chest');
  });

  it('skips 0-rep sets, converts numbers and keeps set types', () => {
    const curl = exercises.find((e) => e.name === 'Dumbbell Curl');
    assert.equal(curl?.sessions[0].sets.length, 1);
    const bench = exercises.find((e) => e.group === 'Chest');
    assert.equal(bench?.sessions[1].sets[0].type, 'warmup');
    assert.equal(typeof bench?.sessions[1].sets[1].weight, 'number');
  });

  it('counts hard sets per workout without warm-ups', () => {
    assert.deepEqual(
      loads.map((l) => l.hardSets),
      [2, 3],
    );
    assert.equal(loads[1].volume, 80 * 8 * 2 + 12 * 12);
  });
});

describe('coach chat', () => {
  const bench: CoachExercise = {
    name: 'Barbell Bench Press',
    group: 'Chest',
    equipment: 'Barbell',
    sessions: [
      { date: daysAgo(30), sets: [{ weight: 70, reps: 8 }] },
      { date: daysAgo(23), sets: [{ weight: 72.5, reps: 8 }] },
      { date: daysAgo(16), sets: [{ weight: 75, reps: 8 }] },
      { date: daysAgo(9), sets: [{ weight: 77.5, reps: 8 }] },
      { date: daysAgo(2), sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 }] },
    ],
  };
  const squat: CoachExercise = {
    name: 'Barbell Full Squat',
    group: 'Legs',
    equipment: 'Barbell',
    sessions: [
      { date: daysAgo(12), sets: [{ weight: 100, reps: 5 }] },
      { date: daysAgo(5), sets: [{ weight: 90, reps: 5 }] },
    ],
  };
  const exercises = [bench, squat];
  const library = [
    { name: 'Barbell Bench Press', group: 'Chest', muscle: 'Chest', equipment: 'Barbell', popular: true },
    { name: 'Dumbbell Bench Press', group: 'Chest', muscle: 'Chest', equipment: 'Dumbbell', popular: true },
    { name: 'Sled 45° Leg Press', group: 'Legs', muscle: 'Glutes', equipment: 'Sled Machine', popular: true },
    { name: 'Barbell Full Squat', group: 'Legs', muscle: 'Glutes', equipment: 'Barbell', popular: true },
  ];
  const ctx = {
    exercises,
    loads: [],
    fatigue: fatigueStatus([], exercises, NOW),
    daily: [],
    dailyAvailable: true,
    library,
    now: NOW,
  };
  const ask = (q: string, c = ctx) => answerCoach(q, c).answer;

  it('finds exercises by short names', () => {
    assert.equal(matchExercise('what should I do on bench?', exercises)?.name, 'Barbell Bench Press');
    assert.equal(matchExercise('squats next time', exercises)?.name, 'Barbell Full Squat');
    assert.equal(matchExercise('Am I overtraining?', exercises), null);
  });

  it('routes every example question to the right analysis', () => {
    const cases: [string, string][] = [
      ['Why is my bench not progressing?', 'plateau'],
      ['Should I add another chest day?', 'add_day'],
      ['Why did my squat drop?', 'drop'],
      ['Should I train today?', 'train_today'],
      ['How many sets should I do?', 'sets'],
      ['Can I replace this exercise?', 'clarify'],
      ['Can I replace leg press?', 'replace'],
      ['Why am I getting weaker?', 'weaker'],
      ['Build me a 4-day hypertrophy program.', 'program'],
      ['What should I do on bench next time?', 'recommend'],
      ['How strong will my bench be in 8 weeks?', 'predict'],
      ['Am I overtraining?', 'fatigue'],
      ['How is my progress?', 'progress'],
    ];
    for (const [q, intent] of cases) assert.equal(ask(q).intent, intent, q);
  });

  it('a chest-day question is about the group, not an exercise with "chest" in its name', () => {
    const dip: CoachExercise = { name: 'Chest Dip', group: 'Chest', equipment: 'Body Weight', sessions: [{ date: daysAgo(3), sets: [{ weight: null, reps: 10 }] }] };
    const a = ask('Should I add another chest day?', { ...ctx, exercises: [...exercises, dip] });
    assert.equal(a.intent, 'add_day');
  });

  it('recommendation answers include reasons and data', () => {
    const r = ask('What should I do on bench next time?', { ...ctx, targets: new Map([['barbell bench press', { min: 8, max: 12 }]]) });
    assert.match(r.recommendation, /80 kg × 9, 9, 9/);
    assert.ok(r.why.length > 0);
    assert.ok(r.evidence.length > 0);
  });

  it('a program comes back with days to save', () => {
    const reply = answerCoach('build me a 3 day program', ctx);
    assert.equal(reply.program?.days.length, 3);
  });

  it('every quick question gets a real answer', () => {
    for (const q of QUICK_QUESTIONS) assert.ok(!['unknown', 'clarify'].includes(ask(q).intent), q);
  });

  it('handles no data, greetings and nonsense', () => {
    assert.equal(ask('should I train today', { ...ctx, exercises: [] }).intent, 'no_data');
    assert.equal(ask('build me a program', { ...ctx, exercises: [] }).intent, 'program');
    assert.equal(ask('hello').intent, 'help');
    assert.equal(ask('banana').intent, 'unknown');
  });
});
