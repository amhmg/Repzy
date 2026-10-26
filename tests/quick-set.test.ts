// The minimised workout bar / notification "✓" button: which set is next and ticking it off.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { completeNextSet, describeSet, findNextSet } from '../src/lib/quick-set.ts';
import type { DraftExercise, WorkoutDraft } from '../src/lib/workout-draft.ts';

const ex = (over: Partial<DraftExercise>): DraftExercise => ({
  id: 'e1',
  name: 'Barbell Bench Press',
  gif: null,
  restSeconds: 90,
  sets: [],
  previous: [],
  hasHistory: true,
  historicBest: { heaviest_weight: 80, estimated_1rm: 101.3, best_set_volume: 640 },
  loading: false,
  ...over,
});
const set = (weight: string, reps: string, done = false, type?: 'warmup') => ({ id: Math.random().toString(), weight, reps, done, prTypes: [], type });
const draft = (exercises: DraftExercise[]): WorkoutDraft => ({
  version: 1,
  startedAt: '2026-10-26T10:00:00Z',
  exercises,
  rest: null,
  title: 'Push',
  visibility: 'private',
  groupId: null,
  updatedAt: '2026-10-26T10:00:00Z',
});

describe('quick set', () => {
  it('finds the first unticked set and labels working sets (warm-ups not counted)', () => {
    const d = draft([ex({ sets: [set('40', '10', true, 'warmup'), set('80', '8', true), set('', ''), set('', '')], previous: [
      { set_number: 1, weight: 40, reps: 10 }, { set_number: 2, weight: 80, reps: 8 }, { set_number: 3, weight: 80, reps: 7 },
    ] })]);
    const n = findNextSet(d);
    assert.equal(n?.label, 'Set 2 of 3');
    assert.equal(describeSet(n!), '80 kg × 7'); // copied from last time
    assert.equal(n?.fromPrevious, true);
  });

  it('ticking uses last session numbers, starts the rest timer and moves on', () => {
    const d = draft([ex({ sets: [set('80', '8', true), set('', '')], previous: [{ set_number: 1, weight: 80, reps: 8 }, { set_number: 2, weight: 80, reps: 8 }] }),
      ex({ id: 'e2', name: 'Dumbbell Fly', restSeconds: 60, sets: [set('14', '12')], hasHistory: false, historicBest: {} })]);
    const r = completeNextSet(d, 1_000_000);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.draft.exercises[0].sets[1].done, true);
    assert.equal(r.draft.exercises[0].sets[1].weight, '80');
    assert.deepEqual(r.draft.rest, { endsAt: 1_000_000 + 90_000, total: 90, exerciseName: 'Barbell Bench Press' });
    assert.equal(findNextSet(r.draft)?.exerciseName, 'Dumbbell Fly');
  });

  it('flags a PR the same way the workout screen does', () => {
    const d = draft([ex({ sets: [set('85', '8')] })]);
    const r = completeNextSet(d, 0);
    assert.ok(r.ok && r.prTypes.includes('heaviest_weight'));
  });

  it('asks you to open the workout when there are no reps to use', () => {
    const r = completeNextSet(draft([ex({ sets: [set('', '')] })]), 0);
    assert.deepEqual(r, { ok: false, reason: 'needs_reps' });
  });

  it('routine targets fill in reps when there is no history', () => {
    const d = draft([ex({ sets: [set('60', '')], target: { sets: 3, repMin: 10, repMax: 12 } })]);
    assert.equal(describeSet(findNextSet(d)!), '60 kg × 10');
  });

  it('all done → nothing next', () => {
    const d = draft([ex({ sets: [set('80', '8', true)] })]);
    assert.equal(findNextSet(d), null);
    assert.deepEqual(completeNextSet(d, 0), { ok: false, reason: 'no_sets' });
  });
});
