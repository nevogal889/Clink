-- 0014_safety: reports, moderation log, statements of reasons, suspensions
-- (ARCHITECTURE.md 4.2, 8.4; PRD.md 3.18; RISK_REVIEW.md M-06, S-06, S-17, S-20).
-- There is no client insert path for reports (S-06): only private.file_report() writes them.

create table private.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references public.profiles(id) on delete set null,
  target_kind    text not null check (target_kind in ('snap', 'flare_photo', 'user')),
  target_user    uuid not null,              -- no FK: kept after the target deletes their account
  target_snap    uuid,
  target_flare   uuid,
  evidence_path  text,                       -- {report_id}.jpg in bucket moderation, copied at report time
  reason         text not null check (reason in ('nudity', 'harassment', 'spam', 'other', 'not_consented')),
  note           text check (char_length(note) <= 200),
  priority       boolean not null default false,   -- true for not_consented and image-screening hits
  status         text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  legal_hold     boolean not null default false,   -- CSAM and legal requests: skipped by the retention job
  created_at     timestamptz not null default now(),
  closed_at      timestamptz,
  check ((status = 'open') = (closed_at is null)),
  check ((target_kind = 'snap') = (target_snap is not null)),
  check ((target_kind = 'flare_photo') = (target_flare is not null))
);
create index on private.reports (status, priority desc, created_at);
create index on private.reports (target_snap) where target_snap is not null;
create index on private.reports (target_flare) where target_flare is not null;

create table private.moderation_log (        -- who did what, when (S-20)
  id          bigint generated always as identity primary key,
  moderator   text not null,
  action      text not null check (action in ('hide', 'restore', 'suspend', 'lift', 'dismiss', 'legal_hold', 'auto_hide')),
  report_id   uuid,
  target_user uuid,
  created_at  timestamptz not null default now()
);

create table public.moderation_notices (     -- statement of reasons shown in the app (S-17)
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('content_removed', 'suspended')),
  target_kind  text check (target_kind in ('snap', 'flare_photo', 'profile', 'text')),
  reason       text not null check (reason in ('nudity', 'harassment', 'spam', 'other', 'not_consented', 'text')),
  created_at   timestamptz not null default now(),
  seen_at      timestamptz
);
create index on public.moderation_notices (user_id);

alter table public.moderation_notices enable row level security;
revoke all on public.moderation_notices from anon, authenticated;
grant select on public.moderation_notices to authenticated;
grant update (seen_at) on public.moderation_notices to authenticated;
create policy own on public.moderation_notices for select to authenticated
  using (moderation_notices.user_id = (select auth.uid()));
create policy own_seen on public.moderation_notices for update to authenticated
  using (moderation_notices.user_id = (select auth.uid()))
  with check (moderation_notices.user_id = (select auth.uid()));

-- report: derives target_user from the item (never from the client), hides it for the reporter at
-- once, auto-hides it for everyone at 3 distinct reporters. 20 per day. Returns the report id and
-- the object to copy into the moderation bucket (the edge function copies it, then calls
-- private.set_report_evidence).
create function private.file_report(p_reporter uuid, p_kind text, p_target uuid, p_reason text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid;
  v_id       uuid;
  v_object   text;
  v_bucket   text;
  v_count    int;
  v_hidden   boolean := false;
begin
  perform private.require_rate_limit(p_reporter, 'report', 20, interval '1 day');
  if p_kind = 'snap' then
    select s.sender_id, s.image_path into v_user, v_object from public.snaps s where s.id = p_target;
    v_bucket := 'snaps';
  elsif p_kind = 'flare_photo' then
    select p.sender_id, p.image_path into v_user, v_object from public.flare_photos p where p.flare_id = p_target;
    v_bucket := 'flare-photos';
  elsif p_kind = 'user' then
    select p.id into v_user from public.profiles p where p.id = p_target;
  else
    raise exception 'bad_input' using errcode = 'CLBAD', detail = 'kind';
  end if;
  -- You can only report what you can see: your friends' items, or a person you know.
  if v_user is null or v_user = p_reporter
     or not (private.are_friends(v_user, p_reporter)
             or exists (select 1 from public.friend_requests r where r.status = 'pending'
                        and ((r.from_id = v_user and r.to_id = p_reporter) or (r.to_id = v_user and r.from_id = p_reporter)))
             or (p_kind = 'flare_photo' and exists (select 1 from public.flare_recipients r
                        where r.flare_id = p_target and r.recipient_id = p_reporter))) then
    raise exception 'not_found' using errcode = 'CLNFD';
  end if;

  insert into private.reports (reporter_id, target_kind, target_user, target_snap, target_flare, reason, note, priority)
  values (p_reporter, p_kind, v_user,
          case when p_kind = 'snap' then p_target end,
          case when p_kind = 'flare_photo' then p_target end,
          p_reason, nullif(btrim(p_note), ''), p_reason = 'not_consented')
  returning id into v_id;

  if p_kind = 'snap' then
    insert into public.snap_hides (user_id, snap_id) values (p_reporter, p_target) on conflict do nothing;
    select count(distinct r.reporter_id) into v_count from private.reports r where r.target_snap = p_target;
    if v_count >= 3 then
      update public.snaps s set hidden_at = coalesce(s.hidden_at, now()) where s.id = p_target;
      v_hidden := true;
    end if;
  elsif p_kind = 'flare_photo' then
    insert into public.flare_photo_hides (user_id, flare_id) values (p_reporter, p_target) on conflict do nothing;
    select count(distinct r.reporter_id) into v_count from private.reports r where r.target_flare = p_target;
    if v_count >= 3 then
      update public.flare_photos p set hidden_at = coalesce(p.hidden_at, now()) where p.flare_id = p_target;
      v_hidden := true;
    end if;
  end if;
  if v_hidden then
    insert into private.moderation_log (moderator, action, report_id, target_user) values ('system', 'auto_hide', v_id, v_user);
  end if;
  perform private.log_event(p_reporter, 'report_submitted', jsonb_build_object(
    'target', case p_kind when 'user' then 'person' else p_kind end));
  return jsonb_build_object('report_id', v_id, 'bucket', v_bucket, 'object', v_object,
                            'priority', p_reason = 'not_consented', 'hidden_for_all', v_hidden);
end $$;

create function private.set_report_evidence(p_report uuid, p_path text)
returns void language sql security definer set search_path = '' as $$
  update private.reports r set evidence_path = p_path where r.id = p_report;
$$;

-- Studio snippets for named moderators. Each writes the moderation log and, where content or an
-- account is affected, the statement of reasons.
create function private.suspend_user(p_user uuid, p_reason text, p_moderator text, p_report uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into private.suspensions (user_id, reason) values (p_user, p_reason)
  on conflict (user_id) do update set reason = excluded.reason, created_at = now(), lifted_at = null;
  insert into private.moderation_log (moderator, action, report_id, target_user) values (p_moderator, 'suspend', p_report, p_user);
  insert into public.moderation_notices (user_id, kind, reason)
  values (p_user, 'suspended', case when p_reason in ('nudity', 'harassment', 'spam', 'not_consented', 'text')
                                    then p_reason else 'other' end);
end $$;

create function private.lift_suspension(p_user uuid, p_moderator text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.suspensions s set lifted_at = now() where s.user_id = p_user and s.lifted_at is null;
  insert into private.moderation_log (moderator, action, target_user) values (p_moderator, 'lift', p_user);
end $$;

-- Closes a report. 'actioned' hides the item for everyone and tells its owner why.
create function private.close_report(p_report uuid, p_outcome text, p_moderator text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_r private.reports;
begin
  select * into v_r from private.reports r where r.id = p_report and r.status = 'open' for update;
  if not found then
    raise exception 'not_found' using errcode = 'CLNFD';
  end if;
  if p_outcome = 'actioned' then
    if v_r.target_kind = 'snap' then
      update public.snaps s set hidden_at = coalesce(s.hidden_at, now()) where s.id = v_r.target_snap;
    elsif v_r.target_kind = 'flare_photo' then
      update public.flare_photos p set hidden_at = coalesce(p.hidden_at, now()) where p.flare_id = v_r.target_flare;
    end if;
    if v_r.target_kind <> 'user' and exists (select 1 from public.profiles p where p.id = v_r.target_user) then
      insert into public.moderation_notices (user_id, kind, target_kind, reason)
      values (v_r.target_user, 'content_removed', v_r.target_kind, v_r.reason);
    end if;
    insert into private.moderation_log (moderator, action, report_id, target_user)
    values (p_moderator, 'hide', p_report, v_r.target_user);
  elsif p_outcome = 'dismissed' then
    -- An auto-hidden item comes back when the review finds nothing wrong.
    if v_r.target_kind = 'snap' then
      update public.snaps s set hidden_at = null where s.id = v_r.target_snap;
    elsif v_r.target_kind = 'flare_photo' then
      update public.flare_photos p set hidden_at = null where p.flare_id = v_r.target_flare;
    end if;
    insert into private.moderation_log (moderator, action, report_id, target_user)
    values (p_moderator, 'dismiss', p_report, v_r.target_user);
  else
    raise exception 'bad_input' using errcode = 'CLBAD';
  end if;
  update private.reports r set status = p_outcome, closed_at = now() where r.id = p_report;
end $$;

-- Review queue for Studio (service role). security_invoker, so it never runs with owner rights.
create view private.open_reports with (security_invoker = true) as
  select r.id, r.created_at, r.priority, r.reason, r.target_kind, r.target_user, r.target_snap,
         r.target_flare, r.evidence_path, r.note,
         (select count(distinct r2.reporter_id) from private.reports r2
          where (r2.target_snap = r.target_snap) or (r2.target_flare = r.target_flare)
             or (r.target_kind = 'user' and r2.target_kind = 'user' and r2.target_user = r.target_user)) as reporters
  from private.reports r
  where r.status = 'open'
  order by r.priority desc, r.created_at;

grant execute on function private.file_report(uuid, text, uuid, text, text), private.set_report_evidence(uuid, text),
  private.suspend_user(uuid, text, text, uuid), private.lift_suspension(uuid, text),
  private.close_report(uuid, text, text) to service_role;
grant select on private.open_reports to service_role;
