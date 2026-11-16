-- 0015_storage: private buckets and Storage RLS (ARCHITECTURE.md 4.3 storage table, 8.2; RISK_REVIEW.md M-02, S-08).
-- Object names carry no bucket prefix: avatars {user_id}/{version}.jpg, snaps {sender_id}/{snap_id}.jpg
-- and _t.jpg, flare-photos {sender_id}/{flare_id}.jpg and _t.jpg, moderation {report_id}.jpg.
-- Reads are allowed exactly when the matching table row is visible to the caller under its own RLS,
-- so a signed URL can only be minted for an item the caller may see.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',      'avatars',      false, 1048576, array['image/jpeg']),
  ('snaps',        'snaps',        false, 1572864, array['image/jpeg']),
  ('flare-photos', 'flare-photos', false, 1572864, array['image/jpeg']),
  ('moderation',   'moderation',   false, null,    array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- avatars: owner writes into their own folder; read follows profiles_read.
create policy avatars_write on storage.objects for insert to authenticated with check (
  objects.bucket_id = 'avatars'
  and objects.name ~ '^[0-9a-f-]{36}/[0-9]{1,13}\.jpg$'
  and (storage.foldername(objects.name))[1] = (select auth.uid())::text
);
create policy avatars_delete on storage.objects for delete to authenticated using (
  objects.bucket_id = 'avatars' and (storage.foldername(objects.name))[1] = (select auth.uid())::text
);
create policy avatars_read on storage.objects for select to authenticated using (
  objects.bucket_id = 'avatars'
  and exists (select 1 from public.profiles p
              where p.id::text = (storage.foldername(objects.name))[1])
);

-- snaps: owner uploads new files into their own folder (no overwrite: no update policy);
-- read when the snaps row is visible.
create policy snaps_write on storage.objects for insert to authenticated with check (
  objects.bucket_id = 'snaps'
  and objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(_t)?\.jpg$'
  and (storage.foldername(objects.name))[1] = (select auth.uid())::text
);
create policy snaps_read on storage.objects for select to authenticated using (
  objects.bucket_id = 'snaps'
  and exists (select 1 from public.snaps s where s.image_path = objects.name or s.thumb_path = objects.name)
);
-- The uploader can see (and so delete or retry) their own files before share-snap inserts the row.
create policy snaps_own on storage.objects for select to authenticated using (
  objects.bucket_id in ('snaps', 'flare-photos')
  and (storage.foldername(objects.name))[1] = (select auth.uid())::text
);
create policy snaps_delete on storage.objects for delete to authenticated using (
  objects.bucket_id in ('snaps', 'flare-photos')
  and (storage.foldername(objects.name))[1] = (select auth.uid())::text
);

-- flare photos: owner uploads; read when the flare_photos row is visible (same rule as the flare).
create policy flare_photos_write on storage.objects for insert to authenticated with check (
  objects.bucket_id = 'flare-photos'
  and objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(_t)?\.jpg$'
  and (storage.foldername(objects.name))[1] = (select auth.uid())::text
);
create policy flare_photos_read on storage.objects for select to authenticated using (
  objects.bucket_id = 'flare-photos'
  and exists (select 1 from public.flare_photos p where p.image_path = objects.name or p.thumb_path = objects.name)
);

-- moderation: no policy at all, so only the service role reaches it.
