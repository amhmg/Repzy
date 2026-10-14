// The multiple-choice coach: each tap narrows the question until it can answer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { LibraryLite } from '../src/lib/coach/analysis.ts';
import { fatigueStatus } from '../src/lib/coach/engine.ts';
import type { CoachExercise } from '../src/lib/coach/engine.ts';
import { guidedStep } from '../src/lib/coach/guided.ts';
import type { FlowState, GuidedStep } from '../src/lib/coach/guided.ts';

const NOW = new Date('2026-10-14T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
const LIBRARY: LibraryLite[] = JSON.parse(readFileSync(new URL('../src/data/exercise-library.json', import.meta.url), 'utf8'));
const bench: CoachExercise = {
  name: 'Barbell Bench Press',
  group: 'Chest',
  equipment: 'Barbell',
  sessions: [27, 20, 13, 6].map((d) => ({ date: daysAgo(d), sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }] })),
};
const ctx = { exercises: [bench], loads: [], fatigue: fatigueStatus([], [bench], NOW), daily: [], dailyAvailable: true, library: LIBRARY, now: NOW };

// Taps the option whose label includes `text` and returns the new state + step
function tap(state: FlowState, text: string): { state: FlowState; step: GuidedStep } {
  const step = guidedStep(state, ctx);
  assert.equal(step.kind, 'ask');
  if (step.kind !== 'ask') throw new Error();
  const o = step.options.find((x) => x.label.includes(text));
  assert.ok(o, `option "${text}" in ${step.options.map((x) => x.label).join(' | ')}`);
  const next = { ...state, ...o.apply };
  return { state: next, step: guidedStep(next, ctx) };
}

describe('guided coach', () => {
  it('program: days → goal → weeks → equipment → a 2-week program', () => {
    let r = tap({}, 'Build me a program');
    r = tap(r.state, '4 days');
    r = tap(r.state, 'Build muscle');
    r = tap(r.state, '2 weeks');
    r = tap(r.state, 'Dumbbells only');
    assert.equal(r.step.kind, 'answer');
    if (r.step.kind !== 'answer') return;
    assert.equal(r.step.reply.program?.weeks, 2);
    assert.equal(r.step.reply.program?.days.length, 4);
    assert.match(r.step.summary, /2-week/);
  });

  it('exercise: pick an exercise, then a question', () => {
    let r = tap({}, 'One of my exercises');
    r = tap(r.state, 'Barbell Bench Press');
    r = tap(r.state, "Why isn't it progressing");
    assert.equal(r.step.kind, 'answer');
    if (r.step.kind === 'answer') assert.equal(r.step.reply.answer.intent, 'plateau');
  });

  it('muscle group: chest → add a day', () => {
    let r = tap({}, 'A muscle group');
    r = tap(r.state, 'Chest');
    r = tap(r.state, 'add another chest day');
    if (r.step.kind === 'answer') assert.equal(r.step.reply.answer.intent, 'add_day');
    else assert.fail('should answer');
  });

  it('single-tap topics answer straight away', () => {
    const t = tap({}, 'Should I train today');
    assert.equal(t.step.kind, 'answer');
    assert.equal(tap({}, 'Fatigue').step.kind, 'answer');
  });

  it('"Type my own question" switches to typing', () => {
    assert.equal(tap({}, 'Type my own').step.kind, 'type');
  });
});
