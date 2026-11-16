-- 0018_advisor_fixes: findings from the Supabase security and performance advisors on clink-dev
-- (docs/build-notes/supabase-connect.md). No behaviour change.

-- 1. usual_drinks had two permissive SELECT policies for authenticated (own, for all; friends_read),
--    which Postgres evaluates both of for every row (advisor: multiple_permissive_policies). One
--    SELECT policy now covers both readers; the owner's writes get one policy per command.
drop policy own on public.usual_drinks;
drop policy friends_read on public.usual_drinks;

create policy read on public.usual_drinks for select to authenticated using (
  usual_drinks.user_id = (select auth.uid())
  or (private.are_friends(usual_drinks.user_id, (select auth.uid()))
      and not private.is_suspended(usual_drinks.user_id))
);
create policy own_insert on public.usual_drinks for insert to authenticated
  with check (usual_drinks.user_id = (select auth.uid()));
create policy own_update on public.usual_drinks for update to authenticated
  using (usual_drinks.user_id = (select auth.uid()))
  with check (usual_drinks.user_id = (select auth.uid()));
create policy own_delete on public.usual_drinks for delete to authenticated
  using (usual_drinks.user_id = (select auth.uid()));

-- 2. Foreign keys without a covering index (advisor: unindexed_foreign_keys). Each of these is on a
--    cascade path from account deletion (4.7) or a block, which otherwise scans the whole table.
create index if not exists app_events_user_id_idx on public.app_events (user_id);
create index if not exists flare_audience_group_id_idx on public.flare_audience (group_id);
create index if not exists flare_photo_hides_flare_id_idx on public.flare_photo_hides (flare_id);
create index if not exists flare_photos_sender_id_idx on public.flare_photos (sender_id);
create index if not exists snap_hides_snap_id_idx on public.snap_hides (snap_id);
create index if not exists snap_reactions_user_id_idx on public.snap_reactions (user_id);
create index if not exists invite_redemptions_invitee_id_idx on private.invite_redemptions (invitee_id);
create index if not exists live_activity_tokens_device_id_idx on private.live_activity_tokens (device_id);
create index if not exists reports_reporter_id_idx on private.reports (reporter_id);
create index if not exists widget_credentials_user_id_idx on private.widget_credentials (user_id);

-- 3. pg_cron keeps a row per run in cron.job_run_details forever; the per-minute flare expiry adds
--    1,440 a day. Keep 7 days. Only where pg_cron exists (Supabase), like 0017.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('clink-cron-history', '30 3 * * *',
      $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$);
  end if;
end $$;
