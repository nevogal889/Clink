-- 0017_retention_jobs: the daily retention job and the pg_cron schedule (ARCHITECTURE.md 4.4
-- scheduled jobs, 4.8; RISK_REVIEW.md M-08, S-05).
-- Files in Storage (snaps, flare photos, moderation evidence) are deleted by edge functions through
-- the Storage API, never with SQL: deleting storage.objects rows leaves the files behind.

create function private.run_daily_retention()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now  timestamptz := private.app_now();
  v_out  jsonb := '{}'::jsonb;
  v_n    bigint;
begin
  -- Silences the drink_logs triggers (no XP reversal, no events) for this transaction.
  perform set_config('clink.retention', 'on', true);

  update public.flares f set place = null
  where f.place is not null and f.ended_at < v_now - interval '24 hours';
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('flare_places_cleared', v_n);

  update public.flare_responses r set drink = null, one_time_note = null
  from public.flares f
  where f.id = r.flare_id and f.ended_at < v_now - interval '24 hours'
    and (r.drink is not null or r.one_time_note is not null);
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('orders_cleared', v_n);

  delete from public.flares f where f.ended_at < v_now - interval '90 days';
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('flares_deleted', v_n);

  delete from private.live_activity_tokens t
  using public.flares f where f.id = t.flare_id and f.status <> 'live';

  delete from public.drink_logs l where l.logged_at < v_now - interval '90 days';
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('drink_logs_deleted', v_n);

  -- Pending requests expire after 30 days, silently. Closed ones go 30 days after their last change.
  update public.friend_requests r set status = 'expired'
  where r.status = 'pending' and r.created_at < v_now - interval '30 days';
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('requests_expired', v_n);
  delete from public.friend_requests r
  where r.status <> 'pending' and r.updated_at < v_now - interval '30 days';

  delete from private.reports r
  where r.status <> 'open' and not r.legal_hold and r.closed_at < v_now - interval '1 year';
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('reports_deleted', v_n);

  delete from auth.audit_log_entries a where a.created_at < v_now - interval '90 days';
  delete from public.app_events e where e.created_at < v_now - interval '13 months';
  delete from public.push_devices d where d.last_seen_at < v_now - interval '90 days';
  delete from public.moderation_notices n where n.created_at < v_now - interval '1 year';
  delete from private.rate_counters c where c.window_start < v_now - interval '2 days';
  delete from private.widget_credentials c where c.revoked_at < v_now - interval '30 days';
  delete from private.install_history h where h.seen_at < v_now - interval '30 days';

  -- Abandoned or under-age sign-ups: an auth user with no profile after 24 h.
  delete from auth.users u
  where u.created_at < v_now - interval '24 hours'
    and not exists (select 1 from public.profiles p where p.id = u.id);
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('abandoned_signups_deleted', v_n);

  return v_out;
end $$;

-- Moderation evidence due for deletion: 90 days after close, except legal holds. The cleanup edge
-- function deletes each file through the Storage API, then clears evidence_path.
create function private.due_evidence_files()
returns table (report_id uuid, path text) language sql stable security definer set search_path = '' as $$
  select r.id, r.evidence_path from private.reports r
  where r.evidence_path is not null and not r.legal_hold and r.status <> 'open'
    and r.closed_at < private.app_now() - interval '90 days';
$$;

create function private.clear_evidence_path(p_report uuid)
returns void language sql security definer set search_path = '' as $$
  update private.reports r set evidence_path = null where r.id = p_report;
$$;

grant execute on function private.run_daily_retention(), private.due_evidence_files(),
                          private.clear_evidence_path(uuid) to service_role;

-- Schedules, only where pg_cron exists (Supabase). The test database has no pg_cron.
-- flare-tick: until the M4 flare-tick edge function exists (it also ends Live Activities and sends
-- background clears), the database expires and settles due flares itself every minute. M4 replaces
-- this job with a pg_net call to the function. snap-cleanup (hourly) is scheduled with its function.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('clink-daily-retention', '0 3 * * *', 'select private.run_daily_retention()');
    perform cron.schedule('clink-flare-expiry', '* * * * *', 'select count(*) from private.expire_due_flares()');
  end if;
end $$;
