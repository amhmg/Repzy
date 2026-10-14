// Unit tests for the coach engine. Run with:  npm run test:coach
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  adaptivePlan,
  epley,
  fatigueStatus,
  inferRepRange,
  predictStrength,
  recommendNext,
  sessionBestE1rm,
  weeklyGroupVolume,
  weightIncrement,
  workingSets,
} from '../src/lib/coach/engine.ts';
import type { CoachExercise, CoachSet, WorkoutLoad } from '../src/lib/coach/engine.ts';

const NOW = new Date('2026-10-14T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
const sets = (weight: number | null, reps: number[], type?: CoachSet['type']): CoachSet[] =>
  reps.map((r) => ({ weight, reps: r, type }));

function bench(sessions: { d: number; sets: CoachSet[] }[]): CoachExercise {
  return {
    name: 'Barbell Bench Press',
    group: 'Chest',
    equipment: 'Barbell',
    sessions: sessions.map((s) => ({ date: daysAgo(s.d), sets: s.sets })),
  };
}

describe('basics', () => {
  it('Epley matches the database rounding', () => {
    assert.equal(epley(100, 1), 100);
    assert.equal(epley(80, 8), 101.3); // 80 × (1 + 8/30) = 101.33
    assert.equal(epley(82.5, 8), 104.5); // same as the database test
  });

  it('warm-ups never count, light back-off sets are ignored', () => {
    const s = [...sets(40, [10], 'warmup'), ...sets(100, [5, 5]), ...sets(60, [12], 'backoff')];
    const w = workingSets(s);
    assert.deepEqual(w.map((x) => x.weight), [100, 100]);
    assert.equal(sessionBestE1rm({ date: daysAgo(0), sets: s }), epley(100, 5));
  });

  it('a session of only warm-ups has no strength value', () => {
    assert.equal(sessionBestE1rm({ date: daysAgo(0), sets: sets(40, [10, 10], 'warmup') }), null);
  });
});

describe('increments and rep ranges', () => {
  it('picks sensible weight jumps', () => {
    assert.equal(weightIncrement({ name: 'Barbell Bench Press', equipment: 'Barbell', group: 'Chest' }), 2.5);
    assert.equal(weightIncrement({ name: 'Barbell Full Squat', equipment: 'Barbell', group: 'Legs' }), 5);
    assert.equal(weightIncrement({ name: 'Dumbbell Curl', equipment: 'Dumbbell', group: 'Arms' }), 2);
    assert.equal(weightIncrement({ name: 'Push-up', equipment: 'Body Weight', group: 'Chest' }), 0);
  });

  it('uses the routine range when there is one, otherwise infers it', () => {
    const ex = bench([{ d: 3, sets: sets(80, [5, 5, 4]) }]);
    assert.deepEqual(inferRepRange(ex, { min: 8, max: 12 }), { min: 8, max: 12, source: 'routine' });
    assert.deepEqual(inferRepRange(ex), { min: 3, max: 6, source: 'inferred' });
    assert.deepEqual(inferRepRange(bench([])), { min: 8, max: 12, source: 'inferred' });
  });
});

describe('recommendations (double progression)', () => {
  it('your example: 80 × 8, 8, 8 in an 8–12 range → stay at 80, aim for 9s', () => {
    const r = recommendNext(bench([{ d: 3, sets: sets(80, [8, 8, 8]) }]), { target: { min: 8, max: 12 } });
    assert.equal(r.action, 'add_reps');
    assert.equal(r.weight, 80);
    assert.deepEqual(r.reps, [9, 9, 9]);
    assert.equal(r.headline, '80 kg × 9, 9, 9');
  });

  it('every set at the top of the range → add the increment and reset to the bottom', () => {
    const r = recommendNext(bench([{ d: 3, sets: sets(80, [12, 12, 12]) }]), { target: { min: 8, max: 12 } });
    assert.equal(r.action, 'increase_weight');
    assert.equal(r.weight, 82.5);
    assert.deepEqual(r.reps, [8, 8, 8]);
  });

  it('does not increase weight every session: one set short of the top means no jump', () => {
    const r = recommendNext(bench([{ d: 3, sets: sets(80, [12, 12, 11]) }]), { target: { min: 8, max: 12 } });
    assert.equal(r.action, 'add_reps');
    assert.equal(r.weight, 80);
    assert.deepEqual(r.reps, [12, 12, 12]);
  });

  it('missing the bottom of the range twice in a row → deload about 10%', () => {
    const r = recommendNext(
      bench([
        { d: 7, sets: sets(100, [7, 6, 6]) },
        { d: 3, sets: sets(100, [7, 6, 5]) },
      ]),
      { target: { min: 8, max: 12 } },
    );
    assert.equal(r.action, 'deload');
    assert.equal(r.weight, 90);
  });

  it('high fatigue → hold the weight and drop a set', () => {
    const r = recommendNext(bench([{ d: 3, sets: sets(80, [12, 12, 12]) }]), {
      target: { min: 8, max: 12 },
      fatigue: 'high',
    });
    assert.equal(r.action, 'hold');
    assert.equal(r.weight, 80);
    assert.equal(r.reps.length, 2);
  });

  it('bodyweight at the top of the range → harder variation, not a weight jump', () => {
    const pushups: CoachExercise = {
      name: 'Push-up',
      group: 'Chest',
      equipment: 'Body Weight',
      sessions: [{ date: daysAgo(2), sets: sets(null, [20, 20, 20]) }],
    };
    const r = recommendNext(pushups, { target: { min: 15, max: 20 } });
    assert.equal(r.action, 'harder_variation');
    assert.equal(r.weight, null);
  });

  it('routine set count wins over last session', () => {
    const r = recommendNext(bench([{ d: 3, sets: sets(80, [8, 8]) }]), { target: { min: 8, max: 12, sets: 4 } });
    assert.equal(r.reps.length, 4);
  });

  it('no history → a starting suggestion, not made-up numbers', () => {
    const r = recommendNext(bench([]));
    assert.equal(r.action, 'start');
    assert.equal(r.weight, null);
  });
});

describe('strength prediction', () => {
  it('needs at least 3 weighted sessions', () => {
    const p = predictStrength(bench([{ d: 10, sets: sets(80, [8]) }, { d: 3, sets: sets(82.5, [8]) }]), NOW);
    assert.ok('notEnoughData' in p);
  });

  it('a steady climb predicts upward, capped to a realistic rate', () => {
    const ex = bench([
      { d: 42, sets: sets(70, [8]) },
      { d: 35, sets: sets(72.5, [8]) },
      { d: 28, sets: sets(75, [8]) },
      { d: 21, sets: sets(77.5, [8]) },
      { d: 14, sets: sets(80, [8]) },
      { d: 7, sets: sets(82.5, [8]) },
    ]);
    const p = predictStrength(ex, NOW);
    assert.ok(!('notEnoughData' in p));
    if ('notEnoughData' in p) return;
    assert.equal(p.trend, 'up');
    assert.ok(p.weeklyChangePct <= 2.5, 'never more than 2.5% a week');
    assert.ok(p.predicted > p.current);
    assert.equal(p.confidence, 'high');
  });

  it('flat results predict no change', () => {
    const ex = bench([
      { d: 30, sets: sets(80, [8]) },
      { d: 20, sets: sets(80, [8]) },
      { d: 10, sets: sets(80, [8]) },
      { d: 2, sets: sets(80, [8]) },
    ]);
    const p = predictStrength(ex, NOW);
    if ('notEnoughData' in p) assert.fail('should predict');
    else {
      assert.equal(p.trend, 'flat');
      assert.equal(p.predicted, p.current);
    }
  });
});

describe('fatigue', () => {
  const steadyWeeks = (setsPerWeek: number): WorkoutLoad[] =>
    [8, 15, 22, 29].map((d) => ({ date: daysAgo(d), hardSets: setsPerWeek, volume: 0 }));

  it('not enough history → says so instead of guessing', () => {
    const f = fatigueStatus([{ date: daysAgo(1), hardSets: 20, volume: 0 }], [], NOW);
    assert.equal(f.level, 'not_enough_data');
  });

  it('normal week → optimal', () => {
    const f = fatigueStatus([...steadyWeeks(40), { date: daysAgo(2), hardSets: 42, volume: 0 }], [], NOW);
    assert.equal(f.level, 'optimal');
    assert.equal(f.chronicWeeklySets, 40);
  });

  it('doubling your usual load → high', () => {
    const f = fatigueStatus([...steadyWeeks(30), { date: daysAgo(1), hardSets: 70, volume: 0 }], [], NOW);
    assert.equal(f.level, 'high');
    assert.ok((f.ratio ?? 0) > 1.5);
  });

  it('much less than usual → low (room to push)', () => {
    const f = fatigueStatus([...steadyWeeks(40), { date: daysAgo(3), hardSets: 15, volume: 0 }], [], NOW);
    assert.equal(f.level, 'low');
  });

  it('several lifts dropping >5% → high even at normal load', () => {
    const dropping = (name: string): CoachExercise => ({
      name,
      group: 'Chest',
      equipment: 'Barbell',
      sessions: [
        { date: daysAgo(20), sets: sets(100, [5]) },
        { date: daysAgo(13), sets: sets(100, [5]) },
        { date: daysAgo(2), sets: sets(85, [5]) },
      ],
    });
    const f = fatigueStatus(
      [...steadyWeeks(40), { date: daysAgo(2), hardSets: 40, volume: 0 }],
      [dropping('A'), dropping('B'), dropping('C')],
      NOW,
    );
    assert.equal(f.level, 'high');
    assert.deepEqual(f.droppingExercises, ['A', 'B', 'C']);
  });
});

describe('weekly volume and the adaptive plan', () => {
  const legs: CoachExercise = {
    name: 'Barbell Full Squat',
    group: 'Legs',
    equipment: 'Barbell',
    sessions: [{ date: daysAgo(12), sets: sets(100, [5, 5, 5]) }],
  };
  const chest = bench([{ d: 2, sets: [...sets(40, [10], 'warmup'), ...sets(80, [8, 8, 8, 8])] }]);

  it('counts hard sets this week per group, excluding warm-ups', () => {
    const v = weeklyGroupVolume([legs, chest], NOW);
    assert.equal(v.find((x) => x.group === 'Chest')?.sets, 4);
    assert.equal(v.find((x) => x.group === 'Legs')?.sets, 0);
    assert.equal(v.find((x) => x.group === 'Legs')?.lastTrainedDays, 12);
  });

  it('focuses on the neglected group and adapts advice to fatigue', () => {
    const fatigue = fatigueStatus([], [], NOW);
    const plan = adaptivePlan([legs, chest], fatigue, NOW);
    assert.equal(plan.focusGroups[0], 'Legs');
    assert.equal(plan.suggestions[0].exercise, 'Barbell Full Squat');

    const tired = { ...fatigue, level: 'high' as const };
    assert.match(adaptivePlan([legs, chest], tired, NOW).weekAdvice, /Deload/);
  });
});
