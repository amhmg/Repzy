-- Profile pictures.
-- profiles.avatar_url already exists. It holds the public URL of your photo in the
-- "avatars" storage bucket, or null (initials are shown).
-- Safe to run more than once.

-- Keep the value sensible
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or (char_length(avatar_url) <= 500 and avatar_url like 'https://%'));

-- Public bucket for photos: max 2 MB, images only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Each person can only add, change or delete files in their own folder: avatars/<their user id>/...
drop policy if exists "Avatar upload own folder" on storage.objects;
create policy "Avatar upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Avatar update own folder" on storage.objects;
create policy "Avatar update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Avatar delete own folder" on storage.objects;
create policy "Avatar delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Listing your own folder (used to clean up old photos). Viewing pictures uses the public URL.
drop policy if exists "Avatar list own folder" on storage.objects;
create policy "Avatar list own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
