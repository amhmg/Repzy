export type RecordType = 'heaviest_weight' | 'estimated_1rm' | 'best_set_volume';

export const RECORD_TYPES: RecordType[] = ['heaviest_weight', 'estimated_1rm', 'best_set_volume'];

export const RECORD_LABELS: Record<RecordType, string> = {
  heaviest_weight: 'Heaviest weight',
  estimated_1rm: 'Est. one-rep max',
  best_set_volume: 'Best set volume',
};

export type Bests = Partial<Record<RecordType, number>>;

// Epley formula, rounded to 0.1 kg (matches the database)
export function estimateOneRepMax(weight: number, reps: number) {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function recordValues(weight: number, reps: number): Record<RecordType, number> {
  return {
    heaviest_weight: weight,
    estimated_1rm: estimateOneRepMax(weight, reps),
    best_set_volume: weight * reps,
  };
}

export function formatKg(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString()} kg`;
}

export function parseNumber(text: string): number | null {
  const n = parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

