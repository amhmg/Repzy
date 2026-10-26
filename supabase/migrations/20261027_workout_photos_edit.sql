-- Workout photos and editing a finished workout.
-- Adds workouts.photo_url, a "workout-photos" storage bucket, photo support in save_workout,
-- and update_workout (change sets, exercises, title, notes, who can see it, photo).
-- Personal records are recalculated after an edit, the same way delete_workout does it.
-- Safe to run more than once.

alter table public.workouts add column if not exists photo_url text;
alter table public.workouts drop constraint if exists workouts_photo_url_check;
alter table public.workouts add constraint workouts_photo_url_check
  check (photo_url is null or (char_length(photo_url) <= 500 and photo_url like 'https://%'));

-- Only accept https links, otherwise store nothing
create or replace function public.clean_photo_url(url text)
returns text
language sql
immutable
as $$
  select case when url is not null and url like 'https://%' and char_length(url) <= 500 then url end
$$;

-- ---------- Storage: workout photos, max 5 MB, each person writes only to their own folder ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workout-photos', 'workout-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Workout photo upload own folder" on storage.objects;
create policy "Workout photo upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Workout photo update own folder" on storage.objects;
create policy "Workout photo update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Workout photo delete own folder" on storage.objects;
create policy "Workout photo delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Workout photo list own folder" on storage.objects;
create policy "Workout photo list own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- save_workout: now also stores the photo ----------
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

  insert into public.workouts (user_id, group_id, visibility, title, notes, photo_url, started_at, ended_at, duration_minutes)
  values (
    uid, gid, vis,
    nullif(trim(payload->>'title'), ''),
    left(nullif(trim(payload->>'notes'), ''), 2000),
    public.clean_photo_url(payload->>'photo_url'),
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


-- ---------- Recalculate personal records for some exercises from all your workouts ----------
create or replace function public.recalculate_records(p_user uuid, keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if keys is null or array_length(keys, 1) is null then
    return;
  end if;
  delete from public.personal_records where user_id = p_user and exercise_key = any(keys);

  insert into public.personal_records
    (user_id, exercise_key, exercise_name, record_type, value, weight, reps, workout_id, achieved_at)
  select distinct on (k, rt)
    p_user, k, ename, rt, val, weight, reps, wid, t
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
    where w.user_id = p_user and e.exercise_key = any(keys) and s.weight > 0 and s.set_type <> 'warmup'
  ) q
  order by k, rt, val desc, t asc;
end;
$$;

revoke execute on function public.recalculate_records(uuid, text[]) from public, anon, authenticated;

-- ---------- update_workout: edit a finished workout ----------
create or replace function public.update_workout(p_workout_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  old_keys text[];
  new_keys text[];
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
  saved_sets int := 0;
begin
  if uid is null then
    raise exception 'You must be logged in';
  end if;
  if not exists (select 1 from public.workouts where id = p_workout_id and user_id = uid) then
    raise exception 'Workout not found';
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

  select array_agg(distinct exercise_key) into old_keys
  from public.exercises where workout_id = p_workout_id;

  update public.workouts
  set title = nullif(trim(payload->>'title'), ''),
      notes = left(nullif(trim(payload->>'notes'), ''), 2000),
      visibility = vis,
      group_id = case when vis = 'group' then gid else null end,
      photo_url = public.clean_photo_url(payload->>'photo_url')
  where id = p_workout_id;

  -- Replace the exercises and sets (sets go with their exercise)
  delete from public.exercises where workout_id = p_workout_id;

  for ex in select * from jsonb_array_elements(payload->'exercises') loop
    ename := trim(ex->>'name');
    continue when ename is null or ename = '';

    insert into public.exercises (workout_id, name, rest_seconds, order_index, notes)
    values (p_workout_id, ename, nullif(ex->>'rest_seconds', '')::int, ex_index, left(nullif(trim(ex->>'notes'), ''), 500))
    returning id, exercise_key into eid, ekey;
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
      saved_sets := saved_sets + 1;
      insert into public.sets (exercise_id, set_number, weight, reps, set_type, rpe)
      values (eid, set_index, w, r, stype, srpe);
    end loop;
  end loop;

  if saved_sets = 0 then
    raise exception 'Add at least one set with reps';
  end if;

  select array_agg(distinct exercise_key) into new_keys
  from public.exercises where workout_id = p_workout_id;

  perform public.recalculate_records(
    uid,
    array(select distinct k from unnest(coalesce(old_keys, '{}') || coalesce(new_keys, '{}')) as k)
  );

  -- PR count (changed by the 20261028 fix to count only sets that beat earlier workouts)
  update public.workouts
  set pr_count = (select count(*) from public.personal_records where user_id = uid and workout_id = p_workout_id)
  where id = p_workout_id;

  return jsonb_build_object(
    'workout_id', p_workout_id,
    'pr_count', (select pr_count from public.workouts where id = p_workout_id)
  );
end;
$$;

revoke execute on function public.update_workout(uuid, jsonb) from public, anon;
grant execute on function public.update_workout(uuid, jsonb) to authenticated;
