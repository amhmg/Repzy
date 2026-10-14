-- Daily check-in: bodyweight, nutrition and recovery, one row per person per day.
-- Every field is optional, so you can log just your weight, or just your sleep.
-- Only you can read or change your own rows. Safe to run more than once.

create table if not exists public.daily_logs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  bodyweight_kg numeric check (bodyweight_kg is null or (bodyweight_kg >= 20 and bodyweight_kg <= 400)),
  calories int check (calories is null or (calories >= 0 and calories <= 20000)),
  protein_g numeric check (protein_g is null or (protein_g >= 0 and protein_g <= 1000)),
  sleep_hours numeric check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)),
  soreness smallint check (soreness is null or (soreness between 1 and 5)), -- 1 = none, 5 = very sore
  energy smallint check (energy is null or (energy between 1 and 5)), -- 1 = exhausted, 5 = great
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

alter table public.daily_logs enable row level security;

drop policy if exists "Read own daily logs" on public.daily_logs;
create policy "Read own daily logs" on public.daily_logs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Add own daily logs" on public.daily_logs;
create policy "Add own daily logs" on public.daily_logs
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Change own daily logs" on public.daily_logs;
create policy "Change own daily logs" on public.daily_logs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Delete own daily logs" on public.daily_logs;
create policy "Delete own daily logs" on public.daily_logs
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.daily_logs from anon;
grant select, insert, update, delete on public.daily_logs to authenticated;
