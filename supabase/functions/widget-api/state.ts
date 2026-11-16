// Builds the widget state (ARCHITECTURE.md 3.1) for one user. Every query here runs inside asUser,
// so RLS decides what is visible exactly as it does for the app (RISK_REVIEW.md S-01): friends'
// names and avatars through profiles_read, flares through incoming_flares() and the flares policy,
// snaps through the snaps policy. Nothing here returns XP, other people's counts or water, phone
// numbers, or group fields of another person's flare. The result is checked against the shared
// zod schema before it leaves.
import type { Tx } from '../_shared/db.ts';
import { HttpError } from '../_shared/http.ts';
import {
  CUSTOM_DRINK_WORDS,
  type DrinkDetails,
  drinkWords,
  type FlareCategory,
} from '../_shared/shared/catalog/index.ts';
import {
  localDateAt,
  usualSlotFromRow,
  widgetDrinkShort,
  widgetFileName,
  widgetFirstName,
  widgetInitial,
  type WidgetState,
  widgetStateSchema,
} from '../_shared/shared/widget-state/index.ts';

/** ISO 8601 in UTC to the second ("2026-11-17T09:12:00Z"): what every decoder parses. */
export function isoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** True for an IANA zone this runtime knows. */
export function isTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone for "today": the device's when valid, else the account's saved zone, else UTC. */
export function pickZone(device: string | null | undefined, saved: string | null | undefined) {
  if (isTimeZone(device)) return device;
  if (isTimeZone(saved)) return saved;
  return 'UTC';
}

function words(drinkId: string | null, category: FlareCategory) {
  if (drinkId) {
    try {
      return drinkWords({ drinkId });
    } catch {
      // A drink no longer in the catalog reads like a custom drink of its category.
    }
  }
  return CUSTOM_DRINK_WORDS[category];
}

type Ctx = {
  now: Date;
  display_name: string;
  onboarding_step: string;
  timezone: string;
};

/** Server time, name, onboarding step and saved zone. Null when the profile is gone. */
export async function readContext(tx: Tx, uid: string): Promise<Ctx | null> {
  const rows = await tx<Ctx[]>`
    select private.app_now() as now, p.display_name, s.onboarding_step, s.timezone
    from public.profiles p join public.user_settings s on s.user_id = p.id
    where p.id = ${uid}`;
  return rows[0] ?? null;
}

export type Today = {
  localDate: string;
  drinks: number;
  water: number;
  caffeinated: number;
  lastDrinkAt: string | null;
};

/** Today's counts on the user's local day (PRD 3.11): drinks, water, caffeinated, last non-water. */
export async function readToday(tx: Tx, uid: string, localDate: string): Promise<Today> {
  const [t] = await tx<{ drinks: number; water: number; caffeinated: number; last: Date | null }[]>`
    select count(*) filter (where l.category <> 'water')::int as drinks,
           count(*) filter (where l.category = 'water')::int as water,
           count(*) filter (where l.caffeinated)::int as caffeinated,
           max(l.logged_at) filter (where l.category <> 'water') as last
    from public.drink_logs l
    where l.user_id = ${uid} and l.local_date = ${localDate}::date`;
  return {
    localDate,
    drinks: t?.drinks ?? 0,
    water: t?.water ?? 0,
    caffeinated: t?.caffeinated ?? 0,
    lastDrinkAt: t?.last ? isoSeconds(t.last) : null,
  };
}

type UsualDbRow = {
  slot: number;
  drink_id: string | null;
  custom_name: string | null;
  category: FlareCategory;
  details: DrinkDetails;
};

export async function readUsual(tx: Tx, uid: string): Promise<UsualDbRow[]> {
  return await tx<UsualDbRow[]>`
    select u.slot, u.drink_id, u.custom_name, u.category, u.details
    from public.usual_drinks u where u.user_id = ${uid} order by u.slot`;
}

type BringDrink = { drinkId?: string | null; name?: string | null; details?: DrinkDetails } | null;

function bringShort(drink: BringDrink): string {
  return widgetDrinkShort(drink?.drinkId ?? null, drink?.name ?? null) || '…';
}

/** The whole widget state for the caller. `tz` is the device zone from the request, if any. */
export async function buildState(
  tx: Tx,
  uid: string,
  tz: string | undefined,
): Promise<WidgetState> {
  const ctx = await readContext(tx, uid);
  const now = ctx ? new Date(ctx.now) : new Date();
  const header = { v: 1 as const, updatedAt: isoSeconds(now) };
  if (!ctx || ctx.onboarding_step !== 'done') return { ...header, state: 'setup' };

  const zone = pickZone(tz, ctx.timezone);
  const today = await readToday(tx, uid, localDateAt(now, zone));
  const usual = (await readUsual(tx, uid)).map((r) =>
    usualSlotFromRow({
      slot: r.slot,
      drinkId: r.drink_id,
      customName: r.custom_name,
      category: r.category,
      details: r.details ?? {},
    }),
  );

  const [friends] = await tx<{ n: number }[]>`
    select count(*)::int as n from public.friendships f
    where (f.user_a = ${uid} or f.user_b = ${uid})
      and not private.is_suspended(case when f.user_a = ${uid} then f.user_b else f.user_a end)`;

  // Groups: own rows only (RLS). Members count only while they are current, unsuspended friends.
  const groupRows = await tx<
    {
      id: string;
      name: string;
      emoji: string | null;
      auto_role: 'work' | 'home' | null;
      member_count: number;
      avatars: string[] | null;
    }[]
  >`
    select g.id, g.name, g.emoji, g.auto_role,
           (select count(*)::int from public.group_members m
            where m.group_id = g.id and private.are_friends(m.member_id, ${uid})
              and not private.is_suspended(m.member_id)) as member_count,
           (select array_agg(x.avatar_path order by x.added_at) from (
              select p.avatar_path, m.added_at from public.group_members m
              join public.profiles p on p.id = m.member_id
              where m.group_id = g.id and p.avatar_path is not null
                and private.are_friends(m.member_id, ${uid})
              order by m.added_at limit 3) x) as avatars
    from public.groups g where g.owner_id = ${uid}
    order by g.created_at, g.id limit 10`;
  const groups = groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    memberCount: Math.min(g.member_count, 20),
    avatarFiles: (g.avatars ?? []).map((p) => widgetFileName('a', p)),
  }));
  const auto = {
    daytimeGroupId: groupRows.find((g) => g.auto_role === 'work')?.id ?? null,
    otherGroupId: groupRows.find((g) => g.auto_role === 'home')?.id ?? null,
  };

  const [place] = await tx<{ place: string }[]>`
    select f.place from public.flares f
    where f.sender_id = ${uid} and f.place is not null
    order by f.created_at desc limit 1`;

  // My live flare and its standing replies (the sender sees every response, RLS).
  const [mine] = await tx<
    {
      id: string;
      category: FlareCategory;
      drink_id: string | null;
      drink_name: string;
      place: string | null;
      created_at: Date;
      meet_at: Date;
      expires_at: Date;
      audience: 'group' | 'everyone' | null;
      group_id: string | null;
    }[]
  >`
    select f.id, f.category, f.drink_id, f.drink_name, f.place, f.created_at, f.meet_at, f.expires_at,
           a.audience, a.group_id
    from public.flares f left join public.flare_audience a on a.flare_id = f.id
    where f.sender_id = ${uid} and f.status = 'live' and f.expires_at > ${now}
    limit 1`;
  let myFlare: Extract<WidgetState, { state: 'ready' }>['myFlare'] = null;
  if (mine) {
    const replies = await tx<
      {
        kind: 'in' | 'bring';
        drink: BringDrink;
        one_time_note: string | null;
        display_name: string;
      }[]
    >`
      select r.kind, r.drink, r.one_time_note, p.display_name
      from public.flare_responses r join public.profiles p on p.id = r.user_id
      where r.flare_id = ${mine.id} and r.withdrawn_at is null
      order by r.created_at limit 20`;
    myFlare = {
      id: mine.id,
      category: mine.category,
      label: words(mine.drink_id, mine.category).label,
      drinkName: mine.drink_name,
      place: mine.place,
      audience: {
        type: mine.audience === 'group' ? 'group' : 'everyone',
        groupId: mine.audience === 'group' ? mine.group_id : null,
      },
      createdAt: isoSeconds(mine.created_at),
      meetAt: isoSeconds(mine.meet_at),
      expiresAt: isoSeconds(mine.expires_at),
      replies: replies.map((r) =>
        r.kind === 'in'
          ? { name: widgetFirstName(r.display_name), kind: 'in' as const }
          : {
              name: widgetFirstName(r.display_name),
              kind: 'bring' as const,
              drinkShort: bringShort(r.drink),
              hasNotes: !!(r.drink?.details?.note || r.one_time_note),
            },
      ),
    };
  }

  // Friends' live flares sent to me: incoming_flares() applies the recipient rule (M-03).
  const incomingRows = await tx<
    {
      id: string;
      category: FlareCategory;
      drink_id: string | null;
      drink_name: string;
      place: string | null;
      meet_at: Date;
      expires_at: Date;
      created_at: Date;
      display_name: string;
      avatar_path: string | null;
      thumb_path: string | null;
      my_kind: 'in' | 'bring' | null;
      my_drink: BringDrink;
    }[]
  >`
    select i.id, i.category, i.drink_id, i.drink_name, i.place, i.meet_at, i.expires_at, i.created_at,
           p.display_name, p.avatar_path, ph.thumb_path, r.kind as my_kind, r.drink as my_drink
    from public.incoming_flares() i
    join public.profiles p on p.id = i.sender_id
    left join public.flare_photos ph on ph.flare_id = i.id and i.has_photo
    left join public.flare_responses r on r.flare_id = i.id and r.user_id = ${uid} and r.withdrawn_at is null
    order by i.created_at desc limit 20`;
  const incoming = incomingRows.map((f) => {
    const w = words(f.drink_id, f.category);
    return {
      flareId: f.id,
      senderName: widgetFirstName(f.display_name),
      avatarFile: f.avatar_path ? widgetFileName('a', f.avatar_path) : null,
      category: f.category,
      wants: w.wants,
      label: w.label,
      drinkName: f.drink_name,
      place: f.place,
      photoFile: f.thumb_path ? widgetFileName('fp', f.thumb_path) : null,
      sentAt: isoSeconds(f.created_at),
      meetAt: isoSeconds(f.meet_at),
      expiresAt: isoSeconds(f.expires_at),
      myResponse:
        f.my_kind === 'in'
          ? { kind: 'in' as const }
          : f.my_kind === 'bring'
            ? { kind: 'bring' as const, drinkShort: bringShort(f.my_drink) }
            : null,
    };
  });

  // Friends' live snaps (the snaps policy: friend, not hidden, not hidden for me, under 24 h).
  const snapRows = await tx<
    {
      id: string;
      thumb_path: string;
      place: string | null;
      created_at: Date;
      expires_at: Date;
      display_name: string;
    }[]
  >`
    select s.id, s.thumb_path, s.place, s.created_at, s.expires_at, p.display_name
    from public.snaps s join public.profiles p on p.id = s.sender_id
    where s.sender_id <> ${uid} and s.expires_at > ${now} and s.hidden_at is null
    order by s.created_at desc limit 20`;
  const snaps = snapRows.map((s) => ({
    id: s.id,
    senderName: widgetFirstName(s.display_name),
    thumbFile: widgetFileName('s', s.thumb_path),
    place: s.place,
    createdAt: isoSeconds(s.created_at),
    expiresAt: isoSeconds(s.expires_at),
  }));

  const state: WidgetState = {
    ...header,
    state: 'ready',
    me: { initial: widgetInitial(ctx.display_name), friendsCount: Math.min(friends?.n ?? 0, 20) },
    usual,
    today,
    groups,
    auto,
    lastPlace: place?.place ?? null,
    myFlare,
    incoming,
    snaps,
    outbox: [],
  };
  const checked = widgetStateSchema.safeParse(state);
  if (!checked.success) {
    // Paths only, never values (ARCHITECTURE.md 8.6).
    console.error(
      'widget_state_invalid',
      checked.error.issues.map((i) => i.path.join('.')),
    );
    throw new HttpError(500, 'internal');
  }
  return checked.data;
}
