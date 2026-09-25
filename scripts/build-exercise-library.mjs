// Converts exercisedb-raw.json into Repzy's exercise library.
// Run from the project folder with:  node scripts/build-exercise-library.mjs
// Output: src/data/exercise-library.json

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('exercisedb-raw.json', 'utf8'));
const source = raw.exercises ?? raw;

// ExerciseDB muscle names -> body diagram regions
const SLUGS = {
  pectorals: 'chest', chest: 'chest', 'upper chest': 'chest',
  abs: 'abs', abdominals: 'abs', 'lower abs': 'abs', core: 'abs',
  obliques: 'obliques', 'serratus anterior': 'obliques',
  biceps: 'biceps', brachialis: 'biceps',
  triceps: 'triceps',
  delts: 'deltoids', deltoids: 'deltoids', shoulders: 'deltoids',
  'rear deltoids': 'deltoids', 'rotator cuff': 'deltoids',
  lats: 'upper-back', 'latissimus dorsi': 'upper-back', 'upper back': 'upper-back',
  rhomboids: 'upper-back', back: 'upper-back',
  spine: 'lower-back', 'lower back': 'lower-back',
  traps: 'trapezius', trapezius: 'trapezius', 'levator scapulae': 'trapezius',
  sternocleidomastoid: 'neck',
  forearms: 'forearm', 'wrist flexors': 'forearm', 'wrist extensors': 'forearm',
  'grip muscles': 'forearm', wrists: 'forearm', hands: 'forearm',
  glutes: 'gluteal',
  quads: 'quadriceps', quadriceps: 'quadriceps',
  hamstrings: 'hamstring',
  calves: 'calves', soleus: 'calves',
  shins: 'tibialis',
  abductors: 'abductors',
  adductors: 'adductors', groin: 'adductors', 'inner thighs': 'adductors',
};

// Nicer display names for the info screen
const DISPLAY = {
  pectorals: 'Chest', 'upper chest': 'Upper Chest',
  delts: 'Shoulders', deltoids: 'Shoulders', shoulders: 'Shoulders',
  quads: 'Quads', quadriceps: 'Quads',
  spine: 'Lower Back', 'cardiovascular system': 'Cardio',
  traps: 'Traps', trapezius: 'Traps',
  lats: 'Lats', 'latissimus dorsi': 'Lats',
  'levator scapulae': 'Neck', sternocleidomastoid: 'Neck',
  'serratus anterior': 'Serratus', abdominals: 'Abs', abs: 'Abs', core: 'Core',
};

const GROUPS = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  'upper arms': 'Arms', 'lower arms': 'Arms',
  'upper legs': 'Legs', 'lower legs': 'Legs',
  waist: 'Core', cardio: 'Cardio', neck: 'Other',
};

const POPULAR = [
  'barbell bench press', 'barbell incline bench press', 'dumbbell bench press',
  'dumbbell incline bench press', 'dumbbell fly', 'push-up', 'chest dip', 'lever chest press',
  'barbell full squat', 'dumbbell goblet squat', 'sled 45° leg press', 'lever leg extension',
  'lever lying leg curl', 'lever seated leg curl', 'barbell deadlift', 'barbell romanian deadlift',
  'trap bar deadlift', 'barbell glute bridge', 'dumbbell lunge', 'walking lunge',
  'barbell standing calf raise', 'lever seated calf raise',
  'pull-up', 'chin-up', 'cable pulldown', 'barbell bent over row', 'dumbbell bent over row',
  'cable seated row', 'dumbbell seated shoulder press', 'barbell seated overhead press',
  'dumbbell lateral raise', 'cable lateral raise', 'dumbbell rear fly', 'dumbbell shrug',
  'barbell curl', 'dumbbell biceps curl', 'dumbbell hammer curl', 'cable pushdown',
  'cable pushdown (with rope attachment)', 'barbell lying triceps extension skull crusher',
  'hanging leg raise', 'crunch floor', 'russian twist', 'kettlebell swing',
];

const FILLER = [
  /\s*Focus on [\w-]+ movement\.?/gi,
  /\s*Perform with [\w-]+ intensity\.?/gi,
  /\s*Emphasize [\w-]+ control\.?/gi,
  /\s*Maintain [\w-]+ form throughout\.?/gi,
  /^\([\w-]+ variation\)\s*/i,
];

const unknownMuscles = new Map();

function fixText(s) {
  return String(s ?? '')
    .replace(/в°/g, '°')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(s) {
  return fixText(s)
    .replace(/(^|[\s(\-/])([a-z])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\bEz\b/g, 'EZ');
}

function toSlugs(list) {
  const out = [];
  for (const m of list ?? []) {
    const key = fixText(m).toLowerCase();
    const slug = SLUGS[key];
    if (slug) {
      if (!out.includes(slug)) out.push(slug);
    } else if (key !== 'cardiovascular system') {
      unknownMuscles.set(key, (unknownMuscles.get(key) ?? 0) + 1);
    }
  }
  return out;
}

function toNames(list, exclude = []) {
  const out = [];
  for (const m of list ?? []) {
    const key = fixText(m).toLowerCase();
    const name = DISPLAY[key] ?? titleCase(key);
    if (!out.includes(name) && !exclude.includes(name)) out.push(name);
  }
  return out;
}

function cleanStep(step) {
  let t = String(step).replace(/^Step:\s*\d+\s*/i, '');
  for (const re of FILLER) t = t.replace(re, '');
  return fixText(t);
}

const seen = new Set();
const library = [];

for (const e of source) {
  const lowerName = fixText(e.name).toLowerCase();
  if (!lowerName || seen.has(lowerName)) continue; // skip duplicate names
  seen.add(lowerName);

  const primary = toSlugs(e.targetMuscles);
  const secondary = toSlugs(e.secondaryMuscles).filter((s) => !primary.includes(s));
  const primaryNames = toNames(e.targetMuscles);
  const secondaryNames = toNames(e.secondaryMuscles, primaryNames);

  library.push({
    id: e.exerciseId,
    name: titleCase(lowerName),
    muscle: primaryNames[0] ?? 'Other',
    group: GROUPS[fixText(e.bodyParts?.[0]).toLowerCase()] ?? 'Other',
    equipment: titleCase(e.equipments?.[0] ?? 'other'),
    primary,
    secondary,
    primaryNames,
    secondaryNames,
    level: '',
    mechanic: '',
    instructions: (e.instructions ?? []).map(cleanStep).filter(Boolean),
    popular: POPULAR.includes(lowerName),
    gif: e.gifUrl ?? `https://static.exercisedb.dev/media/${e.exerciseId}.gif`,
    _rank: POPULAR.indexOf(lowerName),
  });
}

library.sort((a, b) => {
  if (a.popular && b.popular) return a._rank - b._rank;
  if (a.popular !== b.popular) return a.popular ? -1 : 1;
  return a.name.localeCompare(b.name);
});
for (const e of library) delete e._rank;

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/exercise-library.json', JSON.stringify(library));

const missing = POPULAR.filter((p) => !library.some((e) => e.name.toLowerCase() === p));
console.log(`Done! Saved ${library.length} exercises to src/data/exercise-library.json`);
console.log(`Popular exercises found: ${POPULAR.length - missing.length} of ${POPULAR.length}`);
if (missing.length) console.log('Popular names not found:', missing.join(', '));
if (unknownMuscles.size) {
  console.log('Muscle names without a body-diagram region (these just are not highlighted):');
  console.log([...unknownMuscles.entries()].map(([k, v]) => `${k} (${v})`).join(', '));
}
