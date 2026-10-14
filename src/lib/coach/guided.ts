// Guided coach: multiple-choice questions that narrow down what you want,
// then answer with the same analysis as typed questions.

import {
  type AnalysisContext,
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
import type { CoachReply } from './chat';
import { TRACKED_GROUPS } from './engine';
import { buildProgram, EQUIPMENT_LABEL, type Equipment, type Goal } from './program';

export type Topic = 'program' | 'today' | 'exercise' | 'muscle' | 'recovery' | 'progress' | 'type';

export type ExerciseQuestion = 'next' | 'plateau' | 'drop' | 'predict4' | 'predict8' | 'predict12' | 'sets' | 'replace';
export type MuscleQuestion = 'add_day' | 'sets';
export type ProgressQuestion = 'overall' | 'weaker';

export type FlowState = {
  topic?: Topic;
  // program
  days?: number;
  goal?: Goal;
  weeks?: number;
  equipment?: Equipment;
  // exercise
  exercise?: string;
  exerciseQuestion?: ExerciseQuestion;
  // muscle group
  group?: string;
  muscleQuestion?: MuscleQuestion;
  // progress
  progressQuestion?: ProgressQuestion;
};

export type GuidedOption = { label: string; detail?: string; apply: FlowState };

export type GuidedStep =
  | { kind: 'ask'; question: string; options: GuidedOption[] }
  | { kind: 'answer'; summary: string; reply: CoachReply }
  | { kind: 'type' };

const answer = (summary: string, reply: CoachReply): GuidedStep => ({ kind: 'answer', summary, reply });

export function guidedStep(state: FlowState, ctx: AnalysisContext): GuidedStep {
  const hasData = ctx.exercises.length > 0;

  if (!state.topic) {
    return {
      kind: 'ask',
      question: 'What do you want help with?',
      options: [
        { label: '📋 Build me a program', apply: { topic: 'program' } },
        { label: '📅 Should I train today?', apply: { topic: 'today' } },
        { label: '🏋️ One of my exercises', detail: 'next session, plateau, drop, prediction, swap', apply: { topic: 'exercise' } },
        { label: '💪 A muscle group', detail: 'sets per week, adding a day', apply: { topic: 'muscle' } },
        { label: '😴 Fatigue & recovery', apply: { topic: 'recovery' } },
        { label: '📈 My progress', apply: { topic: 'progress' } },
        { label: '✏️ Type my own question', apply: { topic: 'type' } },
      ],
    };
  }

  switch (state.topic) {
    case 'type':
      return { kind: 'type' };

    case 'program': {
      if (state.days == null) {
        return {
          kind: 'ask',
          question: 'How many days a week can you train?',
          options: [2, 3, 4, 5, 6].map((d) => ({ label: `${d} days`, apply: { days: d } })),
        };
      }
      if (!state.goal) {
        return {
          kind: 'ask',
          question: "What's your main goal?",
          options: [
            { label: '💪 Build muscle', detail: 'hypertrophy: 6–15 reps', apply: { goal: 'hypertrophy' } },
            { label: '🏋️ Get stronger', detail: 'strength: 3–6 reps on main lifts', apply: { goal: 'strength' } },
          ],
        };
      }
      if (state.weeks == null) {
        return {
          kind: 'ask',
          question: 'How long should the program last?',
          options: [2, 4, 6, 8, 12].map((w) => ({ label: `${w} weeks`, apply: { weeks: w } })),
        };
      }
      if (!state.equipment) {
        return {
          kind: 'ask',
          question: 'What equipment do you have?',
          options: (Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((e) => ({ label: EQUIPMENT_LABEL[e], apply: { equipment: e } })),
        };
      }
      const { program, answer: a } = buildProgram(
        { days: state.days, goal: state.goal, weeks: state.weeks, equipment: state.equipment },
        { exercises: ctx.exercises, library: ctx.library ?? [], fatigue: ctx.fatigue },
      );
      return answer(
        `Build me a ${state.weeks}-week ${state.goal === 'strength' ? 'strength' : 'muscle-building'} program, ${state.days} days a week, ${EQUIPMENT_LABEL[state.equipment].toLowerCase()}`,
        { answer: a, program },
      );
    }

    case 'today':
      if (!hasData) return answer('Should I train today?', noData());
      return answer('Should I train today?', { answer: analyzeTrainToday(ctx) });

    case 'recovery':
      if (!hasData) return answer('Am I overtraining?', noData());
      return answer('Am I overtraining?', { answer: analyzeFatigue(ctx) });

    case 'progress':
      if (!hasData) return answer('How is my progress?', noData());
      if (!state.progressQuestion) {
        return {
          kind: 'ask',
          question: 'What about your progress?',
          options: [
            { label: '📈 How am I doing overall?', apply: { progressQuestion: 'overall' } },
            { label: '📉 Why am I getting weaker?', apply: { progressQuestion: 'weaker' } },
          ],
        };
      }
      return state.progressQuestion === 'overall'
        ? answer('How is my progress?', { answer: analyzeProgress(ctx) })
        : answer('Why am I getting weaker?', { answer: analyzeWeaker(ctx) });

    case 'muscle': {
      if (!state.group) {
        return {
          kind: 'ask',
          question: 'Which muscle group?',
          options: TRACKED_GROUPS.map((g) => ({ label: g, apply: { group: g } })),
        };
      }
      if (!state.muscleQuestion) {
        return {
          kind: 'ask',
          question: `What about ${state.group.toLowerCase()}?`,
          options: [
            { label: `➕ Should I add another ${state.group.toLowerCase()} day?`, apply: { muscleQuestion: 'add_day' } },
            { label: `🔢 How many ${state.group.toLowerCase()} sets should I do?`, apply: { muscleQuestion: 'sets' } },
          ],
        };
      }
      if (!hasData) return answer(`${state.group}`, noData());
      return state.muscleQuestion === 'add_day'
        ? answer(`Should I add another ${state.group.toLowerCase()} day?`, { answer: analyzeAddDay(state.group, ctx) })
        : answer(`How many ${state.group.toLowerCase()} sets should I do?`, { answer: analyzeSets(ctx, state.group) });
    }

    case 'exercise': {
      if (!hasData) return answer('My exercises', noData());
      if (!state.exercise) {
        const recent = [...ctx.exercises]
          .sort((a, b) => {
            const last = (e: typeof a) => new Date(e.sessions[e.sessions.length - 1]?.date ?? 0).getTime();
            return last(b) - last(a);
          })
          .slice(0, 12);
        return {
          kind: 'ask',
          question: 'Which exercise?',
          options: recent.map((e) => ({
            label: e.name,
            detail: `${e.sessions.length} session${e.sessions.length === 1 ? '' : 's'}`,
            apply: { exercise: e.name },
          })),
        };
      }
      const ex = ctx.exercises.find((e) => e.name === state.exercise);
      if (!ex) return { kind: 'ask', question: 'Which exercise?', options: [] };
      if (!state.exerciseQuestion) {
        return {
          kind: 'ask',
          question: `What about ${ex.name}?`,
          options: [
            { label: '🎯 What should I do next session?', apply: { exerciseQuestion: 'next' } },
            { label: "🤔 Why isn't it progressing?", apply: { exerciseQuestion: 'plateau' } },
            { label: '📉 Why did it drop?', apply: { exerciseQuestion: 'drop' } },
            { label: '🔮 Predict it in 4 weeks', apply: { exerciseQuestion: 'predict4' } },
            { label: '🔮 Predict it in 8 weeks', apply: { exerciseQuestion: 'predict8' } },
            { label: '🔮 Predict it in 12 weeks', apply: { exerciseQuestion: 'predict12' } },
            { label: '🔢 How many sets should I do?', apply: { exerciseQuestion: 'sets' } },
            { label: '🔄 Can I replace it?', apply: { exerciseQuestion: 'replace' } },
          ],
        };
      }
      switch (state.exerciseQuestion) {
        case 'next':
          return answer(`What should I do on ${ex.name} next session?`, { answer: analyzeExerciseTarget(ex, ctx) });
        case 'plateau':
          return answer(`Why isn't my ${ex.name} progressing?`, { answer: analyzePlateau(ex, ctx) });
        case 'drop':
          return answer(`Why did my ${ex.name} drop?`, { answer: analyzeDrop(ex, ctx) });
        case 'sets':
          return answer(`How many sets of ${ex.name} should I do?`, { answer: analyzeSets(ctx, null, ex) });
        case 'replace':
          return answer(`Can I replace ${ex.name}?`, { answer: analyzeReplace(ex.name, ctx) });
        default: {
          const weeks = state.exerciseQuestion === 'predict12' ? 12 : state.exerciseQuestion === 'predict8' ? 8 : 4;
          return answer(`How strong will my ${ex.name} be in ${weeks} weeks?`, { answer: analyzePrediction(ex, ctx, weeks * 7) });
        }
      }
    }
  }
  return { kind: 'ask', question: 'What do you want help with?', options: [] };
}

function noData(): CoachReply {
  return {
    answer: {
      intent: 'no_data',
      recommendation:
        "I haven't seen any workouts from you yet. Log one and I'll be able to answer this from your data. I can already build you a program.",
      why: [],
      evidence: [],
      missing: [],
    },
  };
}
