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
    sessions: [{ date: daysAgo(12), sets: [{ weight: 100, reps: 5 }] }],
  };
  const exercises = [bench, squat];
  const ctx = { exercises, fatigue: fatigueStatus([], exercises, NOW), now: NOW };

  it('finds exercises by short names', () => {
    assert.equal(matchExercise('what should I do on bench?', exercises)?.name, 'Barbell Bench Press');
    assert.equal(matchExercise('squats next time', exercises)?.name, 'Barbell Full Squat');
    assert.equal(matchExercise('Am I overtraining?', exercises), null);
  });

  it('recommends weights and reps for a named exercise', () => {
    const r = answerCoach('What should I do on bench next time?', { ...ctx, targets: new Map([['barbell bench press', { min: 8, max: 12 }]]) });
    assert.equal(r.intent, 'recommend');
    assert.equal(r.exercise, 'Barbell Bench Press');
    assert.match(r.text, /80 kg × 9, 9, 9/);
  });

  it('predicts strength over the horizon you ask for', () => {
    const r = answerCoach('How strong will my bench be in 8 weeks?', ctx);
    assert.equal(r.intent, 'predict');
    assert.match(r.text, /in 8 weeks/);
    assert.match(r.text, /estimate/);
  });

  it('says when there is not enough data instead of guessing', () => {
    const r = answerCoach('predict my squat', ctx);
    assert.equal(r.intent, 'predict');
    assert.match(r.text, /more time/);
  });

  it('answers fatigue, volume, progress and plan questions', () => {
    assert.equal(answerCoach('Am I overtraining?', ctx).intent, 'fatigue');
    const v = answerCoach('Am I doing enough sets?', ctx);
    assert.equal(v.intent, 'volume');
    assert.match(v.text, /Chest: 3 sets/);
    assert.equal(answerCoach('How is my progress?', ctx).intent, 'progress');
    const plan = answerCoach('What should I train today?', ctx);
    assert.equal(plan.intent, 'plan');
    assert.match(plan.text, /Legs/);
  });

  it('every quick question gets a real answer', () => {
    for (const q of QUICK_QUESTIONS) assert.notEqual(answerCoach(q, ctx).intent, 'unknown', q);
  });

  it('handles no data, greetings and nonsense', () => {
    assert.equal(answerCoach('hi', { ...ctx, exercises: [] }).intent, 'no_data');
    assert.equal(answerCoach('hello', ctx).intent, 'help');
    assert.equal(answerCoach('banana', ctx).intent, 'unknown');
  });
});
