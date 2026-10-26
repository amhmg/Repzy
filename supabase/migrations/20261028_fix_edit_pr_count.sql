-- Fix: editing a workout set its PR count to the number of records it holds
-- (e.g. 3 record types x 3 exercises = 9), so a first-ever workout showed PRs.
-- Now a PR is counted the same way as when saving: a set that beats your best from
-- EARLIER workouts (or earlier sets in the same workout), only for exercises you had
-- done before. First-time exercises never count. Warm-ups never count.
-- Also recalculates the PR count of every existing workout with this rule.
-- Safe to run more than once.

create or replace function public.workout_pr_sets(p_user uuid, p_workout_id uuid)
returns int
language sql
volatile -- must see the sets update_workout just wrote (a stable function reads an older snapshot)
security definer
set search_path = public
as $$
  with this_workout as (
    select coalesce(ended_at, created_at) as t, created_at from public.workouts where id = p_workout_id
  ),
  -- your best per exercise from workouts before this one
  prior as (
    select e.exercise_key as k,
           max(s.weight) as heaviest,
           max(s.weight * s.reps) as volume,
           max(case when s.reps = 1 then s.weight else round(s.weight * (1 + s.reps / 30.0), 1) end) as e1rm
    from public.workouts w
    join public.exercises e on e.workout_id = w.id
    join public.sets s on s.exercise_id = e.id
    cross join this_workout tw
    where w.user_id = p_user and w.id <> p_workout_id
      and (coalesce(w.ended_at, w.created_at), w.created_at) < (tw.t, tw.created_at)
      and s.weight > 0 and s.set_type <> 'warmup'
    group by e.exercise_key
  ),
  -- this workout's sets in order, with the best of the sets before each one
  these as (
    select e.exercise_key as k,
           s.weight as w,
           s.weight * s.reps as vol,
           case when s.reps = 1 then s.weight else round(s.weight * (1 + s.reps / 30.0), 1) end as e1,
           max(s.weight) over win as prev_w,
           max(s.weight * s.reps) over win as prev_vol,
           max(case when s.reps = 1 then s.weight else round(s.weight * (1 + s.reps / 30.0), 1) end) over win as prev_e1
    from public.exercises e
    join public.sets s on s.exercise_id = e.id
    where e.workout_id = p_workout_id and s.weight > 0 and s.set_type <> 'warmup'
    window win as (partition by e.exercise_key order by e.order_index, s.set_number
                   rows between unbounded preceding and 1 preceding)
  )
  select count(*)::int
  from these x
  join prior p on p.k = x.k  -- only exercises you had done before
  where x.w > greatest(p.heaviest, coalesce(x.prev_w, 0))
     or x.vol > greatest(p.volume, coalesce(x.prev_vol, 0))
     or x.e1 > greatest(p.e1rm, coalesce(x.prev_e1, 0));
$$;

revoke execute on function public.workout_pr_sets(uuid, uuid) from public, anon, authenticated;

-- update_workout: same as before, but uses the rule above for the PR count
do $$
declare
  src text;
begin
  src := pg_get_functiondef('public.update_workout(uuid, jsonb)'::regprocedure);
  if position('public.workout_pr_sets(uid, p_workout_id)' in src) = 0 then
    src := replace(
      src,
      'set pr_count = (select count(*) from public.personal_records where user_id = uid and workout_id = p_workout_id)',
      'set pr_count = public.workout_pr_sets(uid, p_workout_id)'
    );
    if position('public.workout_pr_sets(uid, p_workout_id)' in src) = 0 then
      raise exception 'Could not update update_workout. Run 20261027_workout_photos_edit.sql first.';
    end if;
    execute src;
  end if;
end $$;

-- Correct the PR count on existing workouts
update public.workouts w set pr_count = public.workout_pr_sets(w.user_id, w.id);
