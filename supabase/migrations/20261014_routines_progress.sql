-- Phase 1 + routines: saved routines, favourite exercises, progress summaries,
-- searchable history. Only adds things; no existing data is changed or removed.

-- ---------- Routines ----------
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  position int not null,
  exercise_name text not null check (char_length(btrim(exercise_name)) between 1 and 120),
  target_sets int not null default 3 check (target_sets between 1 and 20),
  rep_min int check (rep_min between 1 and 100),
  rep_max int check (rep_max between 1 and 100),
  rest_seconds int check (rest_seconds between 0 and 900),
  notes text check (notes is null or char_length(notes) <= 500),
  check (rep_min is null or rep_max is null or rep_min <= rep_max)
);

create index if not exists routines_user_idx on public.routines (user_id, updated_at desc);
create index if not exists routine_exercises_routine_idx on public.routine_exercises (routine_id, position);

alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
grant select, insert, update, delete on public.routines, public.routine_exercises to authenticated;

drop policy if exists "Owners manage their routines" on public.routines;
create policy "Owners manage their routines"
  on public.routines for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Owners manage their routine exercises" on public.routine_exercises;
create policy "Owners manage their routine exercises"
  on public.routine_exercises for all
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));

-- Create or update a routine and its exercises in one go (all or nothing)
create or replace function public.save_routine(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rid uuid := nullif(payload->>'id', '')::uuid;
  clean_name text := regexp_replace(btrim(coalesce(payload->>'name', '')), '\s+', ' ', 'g');
  ex jsonb;
  pos int := 0;
  rmin int;
  rmax int;
begin
  if uid is null then
    raise exception 'You must be logged in';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 60 then
    raise exception 'Routine names must be 1 to 60 characters';
  end if;
  if coalesce(jsonb_array_length(payload->'exercises'), 0) = 0 then
    raise exception 'Add at least one exercise to the routine';
  end if;
  if jsonb_array_length(payload->'exercises') > 40 then
    raise exception 'Routines can have up to 40 exercises';
  end if;

  if rid is null then
    insert into public.routines (user_id, name, notes)
    values (uid, clean_name, nullif(btrim(payload->>'notes'), ''))
    returning id into rid;
  else
    update public.routines
    set name = clean_name, notes = nullif(btrim(payload->>'notes'), ''), updated_at = now()
    where id = rid and user_id = uid;
    if not found then
      raise exception 'Routine not found';
    end if;
    delete from public.routine_exercises where routine_id = rid;
  end if;

  for ex in select * from jsonb_array_elements(payload->'exercises') loop
    continue when coalesce(btrim(ex->>'name'), '') = '';
    rmin := nullif(ex->>'rep_min', '')::int;
    rmax := nullif(ex->>'rep_max', '')::int;
    if rmin is not null and rmax is not null and rmin > rmax then
      raise exception 'Rep range for % is the wrong way round', ex->>'name';
    end if;
    insert into public.routine_exercises
      (routine_id, position, exercise_name, target_sets, rep_min, rep_max, rest_seconds, notes)
    values (
      rid, pos, btrim(ex->>'name'),
      coalesce(nullif(ex->>'target_sets', '')::int, 3),
      rmin, rmax,
      nullif(ex->>'rest_seconds', '')::int,
      nullif(btrim(ex->>'notes'), '')
    );
    pos := pos + 1;
  end loop;

  return rid;
end;
$$;

-- ---------- Favourite exercises ----------
create table if not exists public.favorite_exercises (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_name text not null check (char_length(btrim(exercise_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_name)
);

alter table public.favorite_exercises enable row level security;
grant select, insert, delete on public.favorite_exercises to authenticated;

drop policy if exists "Owners manage their favourites" on public.favorite_exercises;
create policy "Owners manage their favourites"
  on public.favorite_exercises for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- Searchable workout history ----------
drop function if exists public.get_workout_history(int, timestamptz);

create or replace function public.get_workout_history(
  p_limit int default 20,
  p_before timestamptz default null,
  p_search text default null
)
returns table (
  id uuid,
  title text,
  visibility text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  duration_minutes int,
  exercise_count int,
  set_count int,
  volume numeric,
  exercise_names text[],
  pr_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select nullif(btrim(coalesce(p_search, '')), '') as term
  ),
  mine as (
    select w.*
    from public.workouts w, q
    where w.user_id = auth.uid()
      and (p_before is null or coalesce(w.started_at, w.created_at) < p_before)
      and (
        q.term is null
        or coalesce(w.title, '') ilike '%' || q.term || '%'
        or exists (select 1 from public.exercises e where e.workout_id = w.id and e.name ilike '%' || q.term || '%')
      )
    order by coalesce(w.started_at, w.created_at) desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  select
    m.id, m.title, m.visibility, m.started_at, m.ended_at, m.created_at, m.duration_minutes,
    (select count(*)::int from public.exercises e where e.workout_id = m.id),
    (select count(*)::int from public.sets s join public.exercises e on e.id = s.exercise_id where e.workout_id = m.id),
    (select coalesce(sum(coalesce(s.weight, 0) * s.reps), 0) from public.sets s join public.exercises e on e.id = s.exercise_id where e.workout_id = m.id),
    (select coalesce(array_agg(e.name order by e.order_index), '{}') from public.exercises e where e.workout_id = m.id),
    m.pr_count
  from mine m
  order by coalesce(m.started_at, m.created_at) desc;
$$;

-- ---------- Exercises I've done ----------
create or replace function public.get_my_exercises()
returns table (
  exercise_key text,
  name text,
  sessions int,
  total_sets int,
  last_done timestamptz,
  best_e1rm numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.exercise_key,
    (array_agg(e.name order by coalesce(w.started_at, w.created_at) desc))[1],
    count(distinct w.id)::int,
    (select count(*)::int from public.sets s
       join public.exercises e2 on e2.id = s.exercise_id
       join public.workouts w2 on w2.id = e2.workout_id
      where w2.user_id = auth.uid() and e2.exercise_key = e.exercise_key),
    max(coalesce(w.started_at, w.created_at)),
    (select pr.value from public.personal_records pr
      where pr.user_id = auth.uid() and pr.exercise_key = e.exercise_key and pr.record_type = 'estimated_1rm')
  from public.exercises e
  join public.workouts w on w.id = e.workout_id
  where w.user_id = auth.uid()
  group by e.exercise_key
  order by 5 desc;
$$;

-- ---------- Training summary for Home and Progress ----------
create or replace function public.get_training_summary(p_tz text default 'UTC')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with zone as (
    select case when exists (select 1 from pg_timezone_names where name = p_tz) then p_tz else 'UTC' end as z
  ),
  now_local as (
    select (now() at time zone (select z from zone)) as n
  ),
  bounds as (
    select
      date_trunc('week', n)::date as this_week,
      (date_trunc('week', n) - interval '7 days')::date as last_week,
      date_trunc('month', n)::date as this_month
    from now_local
  ),
  mine as (
    select w.id, coalesce(w.started_at, w.created_at) as t, w.pr_count, w.duration_minutes,
      (coalesce(w.started_at, w.created_at) at time zone (select z from zone)) as lt
    from public.workouts w
    where w.user_id = auth.uid()
  ),
  per_workout as (
    select m.id, m.lt,
      date_trunc('week', m.lt)::date as wk,
      count(s.id)::int as sets,
      coalesce(sum(coalesce(s.weight, 0) * s.reps), 0) as volume
    from mine m
    left join public.exercises e on e.workout_id = m.id
    left join public.sets s on s.exercise_id = e.id
    group by m.id, m.lt
  ),
  weeks as (
    select distinct wk from per_workout
  ),
  islands as (
    select max(wk) as last_wk, count(*)::int as len
    from (select wk, wk - (row_number() over (order by wk) * 7)::int as grp from weeks) x
    group by grp
  ),
  week_series as (
    select g::date as wk
    from bounds, generate_series(bounds.this_week - 77, bounds.this_week, interval '7 days') g
  ),
  recent_prs as (
    select pr.exercise_name, pr.record_type, pr.value, pr.weight, pr.reps, pr.achieved_at
    from public.personal_records pr
    join public.workouts pw on pw.id = pr.workout_id
    where pr.user_id = auth.uid()
      -- a first-ever session sets a baseline, not a PR
      and exists (
        select 1 from public.exercises e2
        join public.workouts w2 on w2.id = e2.workout_id
        where w2.user_id = auth.uid()
          and e2.exercise_key = pr.exercise_key
          and coalesce(w2.started_at, w2.created_at) < coalesce(pw.started_at, pw.created_at)
      )
    order by pr.achieved_at desc
    limit 6
  ),
  week_exercises as (
    select e.name, count(s.id)::int as sets
    from mine m
    join public.exercises e on e.workout_id = m.id
    join public.sets s on s.exercise_id = e.id, bounds b
    where date_trunc('week', m.lt)::date = b.this_week
    group by e.name
  )
  select jsonb_build_object(
    'total_workouts', (select count(*) from per_workout),
    'total_sets', (select coalesce(sum(sets), 0) from per_workout),
    'total_volume', (select coalesce(sum(volume), 0) from per_workout),
    'week_workouts', (select count(*) from per_workout, bounds b where wk = b.this_week),
    'last_week_workouts', (select count(*) from per_workout, bounds b where wk = b.last_week),
    'week_volume', (select coalesce(sum(volume), 0) from per_workout, bounds b where wk = b.this_week),
    'last_week_volume', (select coalesce(sum(volume), 0) from per_workout, bounds b where wk = b.last_week),
    'month_workouts', (select count(*) from per_workout, bounds b where date_trunc('month', lt)::date = b.this_month),
    'week_days', (
      select coalesce(jsonb_agg(distinct extract(isodow from lt)::int), '[]'::jsonb)
      from per_workout, bounds b where wk = b.this_week
    ),
    'week_streak', coalesce((
      select max(len) from islands, bounds b where last_wk >= b.last_week
    ), 0),
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'week', ws.wk,
        'workouts', (select count(*) from per_workout p where p.wk = ws.wk),
        'volume', (select coalesce(sum(volume), 0) from per_workout p where p.wk = ws.wk)
      ) order by ws.wk), '[]'::jsonb)
      from week_series ws
    ),
    'recent_prs', (select coalesce(jsonb_agg(to_jsonb(r) order by r.achieved_at desc), '[]'::jsonb) from recent_prs r),
    'week_exercise_sets', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from week_exercises x)
  );
$$;

revoke execute on function public.save_routine(jsonb) from public, anon;
revoke execute on function public.get_workout_history(int, timestamptz, text) from public, anon;
revoke execute on function public.get_my_exercises() from public, anon;
revoke execute on function public.get_training_summary(text) from public, anon;
grant execute on function public.save_routine(jsonb) to authenticated;
grant execute on function public.get_workout_history(int, timestamptz, text) to authenticated;
grant execute on function public.get_my_exercises() to authenticated;
grant execute on function public.get_training_summary(text) to authenticated;
