-- Set types (warm-up, drop, failure, AMRAP, back-off), RPE, exercise notes.
-- Warm-up sets are saved but never count toward personal records.
-- Only adds columns and replaces functions; existing workouts are kept as "normal" sets.

alter table public.sets add column if not exists set_type text not null default 'normal';
alter table public.sets drop constraint if exists sets_set_type_check;
alter table public.sets add constraint sets_set_type_check
  check (set_type in ('normal', 'warmup', 'drop', 'failure', 'amrap', 'backoff'));

alter table public.sets add column if not exists rpe numeric;
alter table public.sets drop constraint if exists sets_rpe_check;
alter table public.sets add constraint sets_rpe_check check (rpe is null or (rpe >= 1 and rpe <= 10));

alter table public.exercises add column if not exists notes text;
alter table public.exercises drop constraint if exists exercises_notes_length;
alter table public.exercises add constraint exercises_notes_length check (notes is null or char_length(notes) <= 500);

-- ---------- save_workout: stores set type, RPE and notes; warm-ups skip PRs ----------
create or replace function public.save_workout(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  eid uuid;
  ekey text;
  ename text;
  ex jsonb;
  st jsonb;
  ex_index int := 0;
  set_index int;
  w numeric;
  r int;
  stype text;
  srpe numeric;
  gid uuid := nullif(payload->>'group_id', '')::uuid;
  vis text := coalesce(payload->>'visibility', 'private');
  started timestamptz := (payload->>'started_at')::timestamptz;
  ended timestamptz := coalesce((payload->>'ended_at')::timestamptz, now());
  rec record;
  result_records jsonb;
  had_history boolean;
  set_improved boolean;
  rc int;
  pr_sets int := 0;
begin
  if uid is null then
    raise exception 'You must be logged in to save a workout';
  end if;
  if vis not in ('private', 'group', 'public') then
    raise exception 'Invalid visibility';
  end if;
  if gid is not null and not public.is_group_member(gid) then
    raise exception 'You are not a member of that group';
  end if;
  if vis = 'group' and gid is null then
    raise exception 'Choose a group to share this workout with';
  end if;
  if coalesce(jsonb_array_length(payload->'exercises'), 0) = 0 then
    raise exception 'Add at least one exercise';
  end if;

  insert into public.workouts (user_id, group_id, visibility, title, notes, started_at, ended_at, duration_minutes)
  values (
    uid, gid, vis,
    nullif(trim(payload->>'title'), ''),
    left(nullif(trim(payload->>'notes'), ''), 2000),
    started, ended,
    case when started is null then null
         else greatest(0, round(extract(epoch from (ended - started)) / 60))::int end
  )
  returning id into wid;

  for ex in select * from jsonb_array_elements(payload->'exercises') loop
    ename := trim(ex->>'name');
    continue when ename is null or ename = '';

    insert into public.exercises (workout_id, name, rest_seconds, order_index, notes)
    values (wid, ename, nullif(ex->>'rest_seconds', '')::int, ex_index, left(nullif(trim(ex->>'notes'), ''), 500))
    returning id, exercise_key into eid, ekey;

    -- PRs only count once you've logged this exercise before (matches the app)
    had_history := exists (
      select 1 from public.personal_records where user_id = uid and exercise_key = ekey
    );

    ex_index := ex_index + 1;
    set_index := 0;

    for st in select * from jsonb_array_elements(coalesce(ex->'sets', '[]'::jsonb)) loop
      w := nullif(st->>'weight', '')::numeric;
      r := nullif(st->>'reps', '')::int;
      continue when r is null or r <= 0;
      stype := coalesce(nullif(st->>'type', ''), 'normal');
      if stype not in ('normal', 'warmup', 'drop', 'failure', 'amrap', 'backoff') then
        stype := 'normal';
      end if;
      srpe := nullif(st->>'rpe', '')::numeric;
      if srpe is not null and (srpe < 1 or srpe > 10) then
        srpe := null;
      end if;

      set_index := set_index + 1;
      insert into public.sets (exercise_id, set_number, weight, reps, set_type, rpe)
      values (eid, set_index, w, r, stype, srpe);

      set_improved := false;

      if w is not null and w > 0 and stype <> 'warmup' then
        for rec in
          select * from (values
            ('heaviest_weight'::text, w),
            ('best_set_volume'::text, w * r),
            ('estimated_1rm'::text, case when r = 1 then w else round(w * (1 + r / 30.0), 1) end)
          ) as t(record_type, value)
        loop
          insert into public.personal_records
            (user_id, exercise_key, exercise_name, record_type, value, weight, reps, workout_id, achieved_at)
          values
            (uid, ekey, ename, rec.record_type, rec.value, w, r, wid, now())
          on conflict (user_id, exercise_key, record_type) do update
            set value = excluded.value,
                weight = excluded.weight,
                reps = excluded.reps,
                workout_id = excluded.workout_id,
                exercise_name = excluded.exercise_name,
                achieved_at = excluded.achieved_at
            where public.personal_records.value < excluded.value;

          get diagnostics rc = row_count;
          if rc > 0 and had_history then
            set_improved := true;
          end if;
        end loop;
      end if;

      if set_improved then
        pr_sets := pr_sets + 1;
      end if;
    end loop;
  end loop;

  update public.workouts set pr_count = pr_sets where id = wid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'exercise', exercise_name, 'record_type', record_type, 'value', value
  )), '[]'::jsonb)
  into result_records
  from public.personal_records
  where user_id = uid and workout_id = wid;

  return jsonb_build_object('workout_id', wid, 'records', result_records, 'pr_count', pr_sets);
end;
$$;

-- ---------- delete_workout: recalculated records ignore warm-ups ----------
create or replace function public.delete_workout(p_workout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  keys text[];
begin
  if uid is null then
    raise exception 'You must be logged in';
  end if;
  if not exists (select 1 from public.workouts where id = p_workout_id and user_id = uid) then
    raise exception 'Workout not found';
  end if;

  select array_agg(distinct exercise_key) into keys
  from public.exercises where workout_id = p_workout_id;

  delete from public.workouts where id = p_workout_id;

  if keys is not null then
    delete from public.personal_records where user_id = uid and exercise_key = any(keys);

    insert into public.personal_records
      (user_id, exercise_key, exercise_name, record_type, value, weight, reps, workout_id, achieved_at)
    select distinct on (k, rt)
      uid, k, ename, rt, val, weight, reps, wid, t
    from (
      select e.exercise_key as k, e.name as ename, w.id as wid,
             coalesce(w.ended_at, w.created_at) as t, s.weight, s.reps, v.rt, v.val
      from public.workouts w
      join public.exercises e on e.workout_id = w.id
      join public.sets s on s.exercise_id = e.id
      cross join lateral (values
        ('heaviest_weight'::text, s.weight),
        ('best_set_volume'::text, s.weight * s.reps),
        ('estimated_1rm'::text, case when s.reps = 1 then s.weight else round(s.weight * (1 + s.reps / 30.0), 1) end)
      ) as v(rt, val)
      where w.user_id = uid and e.exercise_key = any(keys) and s.weight > 0 and s.set_type <> 'warmup'
    ) q
    order by k, rt, val desc, t asc;
  end if;
end;
$$;

-- ---------- Last session for an exercise, now with set type and RPE ----------
drop function if exists public.get_last_performance(text);

create or replace function public.get_last_performance(exercise_name text)
returns table (set_number int, weight numeric, reps int, set_type text, rpe numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select s.set_number, s.weight, s.reps, s.set_type, s.rpe
  from public.sets s
  where s.exercise_id = (
    select e.id
    from public.exercises e
    join public.workouts w on w.id = e.workout_id
    where w.user_id = auth.uid()
      and e.exercise_key = lower(trim(exercise_name))
    order by coalesce(w.ended_at, w.created_at) desc, w.created_at desc, e.order_index desc
    limit 1
  )
  order by s.set_number;
$$;

revoke execute on function public.get_last_performance(text) from public, anon;
grant execute on function public.get_last_performance(text) to authenticated;
