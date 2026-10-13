-- Groups: create/join/leave, group feed, weekly leaderboard with streaks,
-- and a stored PR count per workout (so the group feed can show it).
-- Already applied to the Repzy-London project; kept here as a record.

-- ---------- Stored PR count per workout ----------
alter table public.workouts add column if not exists pr_count int not null default 0;

-- ---------- Group name rules ----------
alter table public.groups drop constraint if exists groups_name_length;
alter table public.groups
  add constraint groups_name_length check (char_length(btrim(name)) between 1 and 40);

-- ---------- save_workout: same as before, plus counts sets that set a PR ----------
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
    uid,
    gid,
    vis,
    nullif(trim(payload->>'title'), ''),
    nullif(trim(payload->>'notes'), ''),
    started,
    ended,
    case when started is null then null
         else greatest(0, round(extract(epoch from (ended - started)) / 60))::int end
  )
  returning id into wid;

  for ex in select * from jsonb_array_elements(payload->'exercises') loop
    ename := trim(ex->>'name');
    continue when ename is null or ename = '';

    insert into public.exercises (workout_id, name, rest_seconds, order_index)
    values (wid, ename, nullif(ex->>'rest_seconds', '')::int, ex_index)
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

      set_index := set_index + 1;
      insert into public.sets (exercise_id, set_number, weight, reps)
      values (eid, set_index, w, r);

      set_improved := false;

      if w is not null and w > 0 then
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
    'exercise', exercise_name,
    'record_type', record_type,
    'value', value
  )), '[]'::jsonb)
  into result_records
  from public.personal_records
  where user_id = uid and workout_id = wid;

  return jsonb_build_object('workout_id', wid, 'records', result_records, 'pr_count', pr_sets);
end;
$$;

-- Backfill PR counts for workouts saved before this change
with set_rows as (
  select w.id as wid, w.user_id as u, coalesce(w.started_at, w.created_at) as t,
         e.exercise_key as k, s.set_number as sn, e.order_index as oi, s.weight, s.reps
  from public.workouts w
  join public.exercises e on e.workout_id = w.id
  join public.sets s on s.exercise_id = e.id
  where s.weight > 0
),
vals as (
  select *, weight as hw, weight * reps as vol,
         case when reps = 1 then weight else round(weight * (1 + reps / 30.0), 1) end as e1
  from set_rows
),
running as (
  select vals.*,
    max(hw) over w1 as phw, max(vol) over w1 as pvol, max(e1) over w1 as pe1,
    min(t) over (partition by u, k) as first_t -- the first session never counts as a PR
  from vals
  window w1 as (partition by u, k order by t, wid, sn rows between unbounded preceding and 1 preceding)
),
prs as (
  select wid, count(*)::int as n
  from running
  where t > first_t and phw is not null and (hw > phw or vol > pvol or e1 > pe1)
  group by wid
)
update public.workouts w set pr_count = prs.n from prs where prs.wid = w.id;

-- ---------- Create a group (creator is added as a member by the existing trigger) ----------
create or replace function public.create_group(p_name text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  g public.groups;
  attempts int := 0;
begin
  if uid is null then
    raise exception 'You must be logged in to create a group';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 40 then
    raise exception 'Group names must be 1 to 40 characters';
  end if;
  if (select count(*) from public.groups where created_by = uid) >= 10 then
    raise exception 'You can create up to 10 groups';
  end if;

  loop
    begin
      insert into public.groups (name, created_by) values (clean, uid) returning * into g;
      exit;
    exception when unique_violation then
      attempts := attempts + 1; -- invite code clash, try a new one
      if attempts >= 5 then raise; end if;
    end;
  end loop;

  return jsonb_build_object(
    'id', g.id, 'name', g.name, 'invite_code', g.invite_code, 'created_by', g.created_by,
    'member_count', 1, 'last_activity', null
  );
end;
$$;

-- ---------- Join by code (now with a 50 member limit) ----------
create or replace function public.join_group_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to join a group';
  end if;

  select id into gid from public.groups where invite_code = lower(trim(code));

  if gid is null then
    raise exception 'Invalid invite code';
  end if;

  if not exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid())
     and (select count(*) from public.group_members where group_id = gid) >= 50 then
    raise exception 'This group is full';
  end if;

  insert into public.group_members (group_id, user_id)
  values (gid, auth.uid())
  on conflict do nothing;

  return gid;
end;
$$;

-- ---------- Leave a group (the creator deletes it instead) ----------
drop policy if exists "Users can leave groups" on public.group_members;
create policy "Users can leave groups"
  on public.group_members for delete
  using (
    auth.uid() = user_id
    and not exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (select 1 from public.groups where id = p_group_id and created_by = auth.uid()) then
    raise exception 'You created this group, so you can''t leave it. Delete the group instead.';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = auth.uid();
end;
$$;

-- ---------- My groups ----------
create or replace function public.get_my_groups()
returns table (
  id uuid,
  name text,
  invite_code text,
  created_by uuid,
  member_count int,
  last_activity timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select g.id, g.name, g.invite_code, g.created_by,
    (select count(*)::int from public.group_members m where m.group_id = g.id),
    (select max(coalesce(w.started_at, w.created_at)) from public.workouts w
      where w.group_id = g.id and w.visibility in ('group', 'public'))
  from public.groups g
  where public.is_group_member(g.id)
  order by 6 desc nulls last, g.created_at desc;
$$;

-- ---------- Group feed: workouts shared to the group, newest first ----------
create or replace function public.get_group_feed(p_group_id uuid, p_limit int default 20, p_before timestamptz default null)
returns table (
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  title text,
  started_at timestamptz,
  created_at timestamptz,
  duration_minutes int,
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
  select w.id, w.user_id, p.username, p.display_name, w.title, w.started_at, w.created_at, w.duration_minutes,
    (select count(*)::int from public.sets s join public.exercises e on e.id = s.exercise_id where e.workout_id = w.id),
    (select coalesce(sum(coalesce(s.weight, 0) * s.reps), 0) from public.sets s join public.exercises e on e.id = s.exercise_id where e.workout_id = w.id),
    (select coalesce(array_agg(e.name order by e.order_index), '{}') from public.exercises e where e.workout_id = w.id),
    w.pr_count
  from public.workouts w
  left join public.profiles p on p.id = w.user_id
  where public.is_group_member(p_group_id)
    and w.group_id = p_group_id
    and w.visibility in ('group', 'public')
    and (p_before is null or coalesce(w.started_at, w.created_at) < p_before)
  order by coalesce(w.started_at, w.created_at) desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- ---------- Leaderboard: this week's workouts, volume and weekly streak per member ----------
create or replace function public.get_group_leaderboard(p_group_id uuid, p_tz text default 'UTC')
returns table (
  user_id uuid,
  username text,
  display_name text,
  is_creator boolean,
  joined_at timestamptz,
  week_workouts int,
  week_volume numeric,
  week_streak int,
  last_workout_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with zone as (
    select case when exists (select 1 from pg_timezone_names where name = p_tz) then p_tz else 'UTC' end as z
  ),
  this_week as (
    select date_trunc('week', now() at time zone (select z from zone))::date as wk
  ),
  members as (
    select m.user_id, m.joined_at, g.created_by
    from public.group_members m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id
  ),
  shared as (
    select w.id, w.user_id, coalesce(w.started_at, w.created_at) as t,
      date_trunc('week', coalesce(w.started_at, w.created_at) at time zone (select z from zone))::date as wk
    from public.workouts w
    where w.group_id = p_group_id and w.visibility in ('group', 'public')
  ),
  vol as (
    select sh.id, coalesce(sum(coalesce(s.weight, 0) * s.reps), 0) as v
    from shared sh
    join public.exercises e on e.workout_id = sh.id
    join public.sets s on s.exercise_id = e.id
    group by sh.id
  ),
  weeks as (
    select distinct sh.user_id, sh.wk from shared sh
  ),
  islands as (
    select x.user_id, max(x.wk) as last_wk, count(*)::int as len
    from (
      select wk2.user_id, wk2.wk,
        wk2.wk - (row_number() over (partition by wk2.user_id order by wk2.wk) * 7)::int as grp
      from weeks wk2
    ) x
    group by x.user_id, x.grp
  ),
  streaks as (
    -- a streak is still alive if its last week is this week or last week
    select i.user_id, max(i.len) as len
    from islands i, this_week tw
    where i.last_wk >= tw.wk - 7
    group by i.user_id
  )
  select
    m.user_id,
    p.username,
    p.display_name,
    m.user_id = m.created_by,
    m.joined_at,
    (select count(*)::int from shared sh, this_week tw where sh.user_id = m.user_id and sh.wk = tw.wk),
    (select coalesce(sum(vol.v), 0) from shared sh join vol on vol.id = sh.id, this_week tw
      where sh.user_id = m.user_id and sh.wk = tw.wk),
    coalesce((select st.len from streaks st where st.user_id = m.user_id), 0),
    (select max(sh.t) from shared sh where sh.user_id = m.user_id)
  from members m
  left join public.profiles p on p.id = m.user_id
  order by 1;
$$;

revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.get_my_groups() from public, anon;
revoke execute on function public.get_group_feed(uuid, int, timestamptz) from public, anon;
revoke execute on function public.get_group_leaderboard(uuid, text) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.get_my_groups() to authenticated;
grant execute on function public.get_group_feed(uuid, int, timestamptz) to authenticated;
grant execute on function public.get_group_leaderboard(uuid, text) to authenticated;
