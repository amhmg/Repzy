// Downloads the full free ExerciseDB V1 exercise list into exercisedb-raw.json
// Run from the project folder with:  node scripts/fetch-exercisedb.mjs

import { writeFileSync } from 'node:fs';

const BASE = 'https://oss.exercisedb.dev/api/v1/exercises';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getPage(after) {
  const url = new URL(BASE);
  url.searchParams.set('limit', '25'); // the API never returns more than 25 at a time
  if (after) url.searchParams.set('after', after);

  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();

    if (res.status === 429 || res.status >= 500) {
      const wait = attempt * 5000;
      console.log(`Server busy (${res.status}), waiting ${wait / 1000}s and trying again...`);
      await sleep(wait);
      continue;
    }

    throw new Error(`Request failed: ${res.status} ${await res.text()}`);
  }
  throw new Error('Gave up after several retries. Wait a few minutes and run the script again.');
}

const all = [];
const seen = new Set();
let after = null;

console.log('Downloading exercises from ExerciseDB (this takes a few minutes)...');

while (true) {
  const body = await getPage(after);
  const items = Array.isArray(body) ? body : (body.data ?? []);

  let added = 0;
  for (const ex of items) {
    if (!seen.has(ex.exerciseId)) {
      seen.add(ex.exerciseId);
      all.push(ex);
      added++;
    }
  }
  console.log(`Downloaded ${all.length} exercises...`);

  const meta = body.meta ?? {};
  if (!meta.hasNextPage || !meta.nextCursor || added === 0) break;

  after = meta.nextCursor;
  await sleep(1200); // be gentle with the free server
}

writeFileSync(
  'exercisedb-raw.json',
  JSON.stringify({ fetchedAt: new Date().toISOString(), count: all.length, exercises: all }),
);

console.log(`Done! Saved ${all.length} exercises to exercisedb-raw.json`);
