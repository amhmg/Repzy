import data from '@/data/exercise-library.json';

export type LibraryExercise = {
  id: string;
  name: string;
  muscle: string;
  group: string;
  equipment: string;
  primary: string[];
  secondary: string[];
  primaryNames: string[];
  secondaryNames: string[];
  level: string;
  mechanic: string;
  instructions: string[];
  popular: boolean;
  gif: string | null;
};

export const EXERCISE_LIBRARY = data as LibraryExercise[];

export const MUSCLE_GROUPS = ['All', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio'];

// Body-diagram regions for each muscle group, and which side of the body shows them best
export const GROUP_BODY: Record<string, { slugs: string[]; side: 'front' | 'back' | 'both' }> = {
  All: {
    slugs: ['chest', 'deltoids', 'biceps', 'triceps', 'abs', 'quadriceps', 'upper-back', 'hamstring', 'gluteal', 'calves'],
    side: 'front',
  },
  Chest: { slugs: ['chest'], side: 'front' },
  Back: { slugs: ['upper-back', 'lower-back', 'trapezius'], side: 'back' },
  Shoulders: { slugs: ['deltoids'], side: 'front' },
  Arms: { slugs: ['biceps', 'triceps', 'forearm'], side: 'front' },
  Legs: { slugs: ['quadriceps', 'hamstring', 'gluteal', 'calves', 'adductors'], side: 'front' },
  Core: { slugs: ['abs', 'obliques'], side: 'front' },
};

const BY_NAME = new Map(EXERCISE_LIBRARY.map((e) => [e.name.toLowerCase(), e]));

export function findLibraryExercise(name: string): LibraryExercise | null {
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

// Every word you type must appear in the name, muscle or equipment.
// Names that start with what you typed come first.
export function searchExercises(query: string, group: string): LibraryExercise[] {
  const cleaned = query.trim().toLowerCase();
  const words = cleaned.split(/\s+/).filter(Boolean);

  const matches = EXERCISE_LIBRARY.filter((e) => {
    if (group !== 'All' && e.group !== group) return false;
    if (words.length === 0) return true;
    const haystack = `${e.name} ${e.muscle} ${e.equipment}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });

  if (!cleaned) return matches;

  const score = (e: LibraryExercise) => {
    const name = e.name.toLowerCase();
    if (name.startsWith(cleaned)) return 0;
    if (name.includes(cleaned)) return 1;
    return 2;
  };
  return [...matches].sort((a, b) => score(a) - score(b));
}
