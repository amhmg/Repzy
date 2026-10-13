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
| Set types (warm-up, drop, failure, AMRAP, back-off) | ⬜ | Needs a `set_type` column; warm-ups excluded from PRs |
| RPE / RIR, set and exercise notes | ⬜ | |
| Reorder exercises and sets, duplicate set, undo delete | ⬜ | |
| Replace exercise mid-workout, supersets | ⬜ | |
| Tap previous to copy, clearer suggestion styling | ⬜ | |
| kg / lb | ⬜ | Store kg, convert on display and input |
| Finish summary with comparison and notes | 🟡 | Summary exists; comparison and notes to add |

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
| Progressive overload suggestions | ⬜ | Double progression from history + routine rep range |

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

Not started. Data needed for it (sets, PRs, routines, rep targets) is being stored in a structured way so a coach can read real history later.

## Known platform limits

- In Expo Go, notifications are local only. A live countdown on the lock screen needs a development build.
- The ExerciseDB free animations require the in-app credit and non-commercial use until the paid licence is bought.
