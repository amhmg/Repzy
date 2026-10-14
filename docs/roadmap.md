# Repzy roadmap

Status key: ✅ built (app compiles and builds; database logic tested on a local copy; needs a check on a real phone) · 🟡 partly built · ⬜ planned

## Phase 1 — Navigation and core UX (this release)

| Feature | Status | Notes |
|---|---|---|
| Four tabs: Home, Workouts, Progress, Groups | ✅ | Replaces Home + Groups |
| Avatar top-right → Profile & Settings | ✅ | No settings tab in the bar |
| Active workout reachable from every tab | ✅ | Banner on each tab, workout runs app-wide |
| Home dashboard | ✅ | Start chooser, resume, week overview, consistency, latest PR, 3 recent, routines shortcut, insight from real data |
| Workouts tab | ✅ | Start empty, routines, exercise library, favourites |
| Progress tab: Overview, History, Exercises, Records | ✅ | History moved here, with search and "Repeat workout" |
| Groups tab | ✅ | Unchanged |

## Phase 2 — Workout experience

| Feature | Status | Notes |
|---|---|---|
| Saved routines (create, edit, delete, duplicate, start) | ✅ | Starting copies the routine; the template never changes |
| Routine targets shown while logging | ✅ | Sets and rep range per exercise |
| Exercise favourites | ✅ | Star in the library and picker, Favourites filter |
| Rest timer up to 15 minutes, default rest setting | ✅ | 5 s steps to 5 min, then 15 s steps to 15 min |
| Set types (warm-up, drop, failure, AMRAP, back-off) | ✅ | Tap the set number. Warm-ups never count toward PRs (needs `20261015_set_types_notes.sql`) |
| RPE, exercise notes, workout notes | ✅ | RPE 6–10 in the set menu; RIR not added |
| Reorder exercises, duplicate set, undo delete | ✅ | Exercise ••• menu; undo bar for 5 s. Reordering sets not added |
| Replace exercise mid-workout | ✅ | Keeps your sets |
| Supersets | ⬜ | |
| Tap previous to copy | ✅ | |
| kg / lb | ⬜ | Store kg, convert on display and input |
| Finish summary with comparison and notes | ✅ | "Stronger on X of Y exercises" by estimated 1RM |

| Profile picture from your photo library | ✅ | Needs `20261016_avatars.sql`; shown in the header, settings and groups; initials if none |

## Phase 3 — Progress tracking

| Feature | Status | Notes |
|---|---|---|
| History search | ✅ | Title and exercise names |
| Repeat (duplicate) a past workout | ✅ | |
| History sort and date filters | ⬜ | |
| Edit a completed workout (with PR recalculation) | ⬜ | `delete_workout` already recalculates PRs; edit will reuse it |
| Exercise charts with timeframes | 🟡 | Last 10 sessions; 30d/90d/1y/all to add |
| Rep-specific PRs, PR history | ⬜ | |
| Weekly sets by muscle group | ✅ | Counts each set to the exercise's main muscle group (labelled as an estimate) |
| Progressive overload suggestions | ✅ | Coach box on each exercise while logging; can be turned off in settings |

## Phase 4 — Reliability and social

| Feature | Status | Notes |
|---|---|---|
| Offline logging with local draft | ✅ | Draft saved after every change |
| Offline save queue and sync | ⬜ | Save currently needs a connection; retry is manual |
| CSV / JSON export | ⬜ | |
| Group leaderboard categories, reactions, comments, challenges | ⬜ | |
| Group avatars, descriptions, member management | ⬜ | |
| Bodyweight tracking, plate calculator | ⬜ | |

## Phase 5 — Coaching

Coach tab (middle of the tab bar). Rule-based, from your own data; no AI model or paid API yet. Logic lives in `src/lib/coach/` and is unit-tested (`npm run test:coach`).

| Feature | Status | Notes |
|---|---|---|
| Recommendations (weight and reps) | ✅ | Double progression in the routine or inferred rep range; deload after missing the range twice |
| Strength prediction | ✅ | Weighted trend of estimated 1RM, capped at +2.5% / −5% a week, with confidence |
| Fatigue / readiness | ✅ | Hard sets this week vs your 4-week average, plus lifts dropping >5% |
| Adaptive programming | ✅ | Focus on least-trained muscle groups; push, hold or deload depending on fatigue |
| Weekly sets per muscle vs 10–20 target | ✅ | |
| Chat | ✅ | Understands questions about exercises, fatigue, sets, progress and what to train |
| Real AI chat (free-form answers) | ⬜ | Possible later via the Claude API through a Supabase Edge Function (paid per message) |

## Known platform limits

- In Expo Go, notifications are local only. A live countdown on the lock screen needs a development build.
- The ExerciseDB free animations require the in-app credit and non-commercial use until the paid licence is bought. The credit was removed from Profile & settings (About) during testing; put it back before the app goes public (it still shows under the exercise picker and exercise info).
