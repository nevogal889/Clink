// What the To: chip says (DESIGN.md 4.5, PRD 3.10). Automatic resolves at this moment in the
// device zone with the shared rule, so the label matches where the flare will go on tap.
import { EVERYONE, resolveAutomaticAt, t } from '@clink/shared';

import type { Audience, AudienceChoice, Group } from '@/lib/api';

export interface ResolvedAudience {
  /** Group name or "Everyone". */
  label: string;
  /** The group it lands on, or null for Everyone. */
  group: Group | null;
  /** Number of friends it reaches. */
  count: number;
  auto: boolean;
}

export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function resolveChoice(
  choice: AudienceChoice,
  audience: Audience,
  at: Date,
  zone = deviceZone(),
): ResolvedAudience {
  const everyone: ResolvedAudience = {
    label: t('aud.everyone'),
    group: null,
    count: audience.friendCount,
    auto: false,
  };
  if (choice.kind === 'everyone') return everyone;
  if (choice.kind === 'group') {
    const g = audience.groups.find((x) => x.id === choice.id);
    return g ? { label: g.name, group: g, count: g.memberCount, auto: false } : everyone;
  }
  const id = resolveAutomaticAt(at, zone, audience.auto, audience.groups);
  const g = id === EVERYONE ? null : (audience.groups.find((x) => x.id === id) ?? null);
  return g
    ? { label: g.name, group: g, count: g.memberCount, auto: true }
    : { ...everyone, auto: true };
}
