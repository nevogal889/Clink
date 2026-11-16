import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BANNED_TERMS,
  NOTIFICATIONS,
  STRINGS,
  STRING_META,
  STRING_REFERENCES,
  argNames,
  firstName,
  isStringKey,
  parseIcu,
  t,
  truncateTo,
  truncateVar,
  truncateWidgetVar,
  type StringKey,
} from './index';

const COPY = readFileSync(join(__dirname, '../../../../docs/COPY.md'), 'utf8');
const KEYS = Object.keys(STRINGS) as StringKey[];

describe('string table generated from COPY.md', () => {
  it('has the keys the screens and widgets use', () => {
    expect(KEYS.length).toBeGreaterThan(700);
    for (const k of [
      'splash.tagline',
      'onb.progress',
      'cat.smoothie_juice',
      'in.btn.bring',
      'xp.e.adjust',
      'a11y.w.tracker',
      'n.flare.title',
      'n.flare.body',
      'n.action.im_in',
      'la.title',
      'ws.log',
      'wm.flare',
      'share.msg.whatsapp',
      'web.title',
      'level.8',
      'level.8.desc',
      'preset.mix',
      'NSCameraUsageDescription',
    ]) {
      expect(isStringKey(k)).toBe(true);
    }
  });

  it('has no duplicate keys in COPY.md with different text', () => {
    // The generator fails on a conflicting duplicate; this re-checks the doc directly.
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const line of COPY.split('\n')) {
      const m = /^\| `([A-Za-z][A-Za-z0-9_.]*)` \| [^|]+ \| ([^|]+) \| [^|]+ \|$/.exec(line);
      if (!m || !m[1] || !m[2]) continue;
      const [, key, text] = m;
      const prev = seen.get(key);
      if (prev !== undefined && prev !== text.trim()) conflicts.push(key);
      seen.set(key, text.trim());
    }
    expect(seen.size).toBeGreaterThan(500);
    expect(conflicts).toEqual([]);
  });

  it('records rows that point at other strings instead of inventing text', () => {
    expect(STRING_REFERENCES.map((r) => r.key)).toEqual([
      'profile.level_desc',
      'empty.requests',
      'a11y.w.confirm',
      'a11y.react',
    ]);
  });

  it('expands compound rows', () => {
    expect(STRINGS['cam.flash.on.a11y']).toBe('Flash on');
    expect(STRINGS['cam.flash.off.a11y']).toBe('Flash off');
    expect(STRINGS['set.widgets.size.medium']).toBe('Medium');
    expect(STRINGS['a11y.act.prev_order']).toBe('Previous order');
    expect(STRINGS['mod.item.text']).toBe('text');
    expect(STRINGS['order.label.temp']).toBe('Temperature');
    expect(STRINGS['order.label.addins']).toBe('Add-ins');
    expect(STRINGS['snapv.react.a11y.laughing']).toBe('React with laughing');
    expect(STRINGS['mod.reason.not_consented']).toBe("I'm in it and didn't agree");
    expect(STRINGS['mod.reason.nudity']).toBe('nudity or sexual content');
    expect(STRINGS['mod.reason.text']).toBe("a word that isn't allowed");
    expect(STRINGS['wm.counts']).toBe('{drinks} · {water}');
  });

  it('keeps max lengths as metadata ("system" and "n/a" become null)', () => {
    expect(STRING_META['splash.tagline'].max).toBe(32);
    expect(STRING_META['signin.apple'].max).toBeNull();
    expect(STRING_META['order.label.size'].max).toBe(12);
    expect(STRING_META['n.flare.title'].max).toBe(40);
    expect(STRING_META['n.flare.body'].max).toBe(90);
    expect(STRING_META['n.action.bring_me_one'].max).toBe(16);
    expect(STRING_META['level.1'].max).toBe(16);
    expect(STRING_META['level.1.desc'].max).toBe(70);
    expect(STRING_META['onb.progress'].max).toBe(8);
    expect(STRING_META['preset.mix'].max).toBe(22);
    expect(STRING_META['a11y.w.log'].max).toBeNull();
  });

  it('fits every string without variables inside its max', () => {
    const over = KEYS.filter((k) => {
      const m = STRING_META[k];
      return m.max !== null && m.placeholders.length === 0 && Array.from(STRINGS[k]).length > m.max;
    });
    expect(over).toEqual([]);
  });

  it('parses placeholders as written, and the TS parser agrees with the generator', () => {
    expect(STRING_META['code.sub'].placeholders).toEqual([{ name: 'phone', type: 'simple' }]);
    expect(STRING_META['live.countdown'].placeholders).toEqual([{ name: 'mm:ss', type: 'simple' }]);
    expect(STRING_META['live.summary'].placeholders).toEqual([
      { name: 'in', type: 'simple' },
      { name: 'orders', type: 'plural' },
    ]);
    expect(STRING_META['in.others.named'].placeholders.map((p) => p.name)).toEqual([
      'names',
      'rest',
      'total',
    ]);
    for (const k of KEYS) {
      expect([k, argNames(parseIcu(STRINGS[k]))]).toEqual([k, STRING_META[k].placeholders]);
    }
  });

  it('ties notifications to their keys and sound settings', () => {
    const flare = NOTIFICATIONS.find((n) => n.key === 'n.flare');
    expect(flare).toEqual({
      key: 'n.flare',
      titleKey: 'n.flare.title',
      bodyKey: 'n.flare.body',
      actionKeys: ['n.action.im_in', 'n.action.bring_me_one'],
      sound: true,
    });
    const pub = NOTIFICATIONS.find((n) => n.key === 'n.flare_public');
    expect(pub?.bodyKey).toBeNull();
    expect(pub?.sound).toBeNull();
    expect(NOTIFICATIONS.find((n) => n.key === 'n.request')?.actionKeys).toEqual([
      'n.action.accept',
    ]);
    expect(NOTIFICATIONS.find((n) => n.key === 'n.snap')?.sound).toBe(false);
  });
});

describe('t()', () => {
  it('renders plain strings and simple variables', () => {
    expect(t('splash.tagline')).toBe('Drink breaks with your people.');
    expect(t('in.title', { name: 'Maya', wants: 'matcha' })).toBe('Maya wants matcha');
    expect(t('code.resend_wait', { 'm:ss': '0:24' })).toBe('Resend in 0:24');
  });

  it('renders plurals with #', () => {
    expect(t('today.drinks', { n: 1 })).toBe('1 drink');
    expect(t('today.drinks', { n: 0 })).toBe('0 drinks');
    expect(t('today.drinks', { n: 3 })).toBe('3 drinks');
    expect(t('live.summary', { in: 2, orders: 1 })).toBe('2 in · 1 drink to bring');
    expect(t('in.others.n', { n: 1 })).toBe('1 other is in');
    expect(t('in.others.n', { n: 4 })).toBe('4 others are in');
  });

  it('uses exact =0 branches and collapses the space an empty branch leaves', () => {
    expect(t('in.others.named', { names: 'Leo', rest: 0, total: 1 })).toBe('Leo is in');
    expect(t('in.others.named', { names: 'Leo, Sam', rest: 2, total: 4 })).toBe(
      'Leo, Sam and 2 others are in',
    );
    expect(t('snapv.mine.reacts', { first: 'Maya', rest: 0 })).toBe('Maya reacted');
    expect(t('snapv.mine.reacts', { first: 'Maya', rest: 1 })).toBe('Maya and 1 other reacted');
  });

  it('renders multi-variable accessibility labels', () => {
    expect(t('a11y.w.tracker', { drinks: 3, water: 1, ago_words: '1 hour 42 minutes' })).toBe(
      '3 drinks and 1 water today. Last drink 1 hour 42 minutes ago.',
    );
  });

  it('throws on a missing variable and an unknown key', () => {
    // @ts-expect-error: wants is required
    expect(() => t('in.title', { name: 'Maya' })).toThrow('{wants}');
    // @ts-expect-error: not a key
    expect(() => t('no.such.key')).toThrow('Unknown string key');
  });

  it('renders every string at its variable budget without throwing', () => {
    for (const k of KEYS) {
      const vars: Record<string, string | number> = {};
      for (const p of STRING_META[k].placeholders) vars[p.name] = p.type === 'plural' ? 2 : 'x';
      expect(() => (t as (key: string, v: object) => string)(k, vars)).not.toThrow();
    }
  });
});

describe('copy rules (COPY.md 0.3 and 1.3)', () => {
  const lower = (s: string) => s.toLocaleLowerCase('en-US');
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * A banned term matches as whole words. Terms with X / Y in them ("whether you're X or Y")
   * match any words in those places.
   */
  function termRegex(phrase: string): RegExp {
    const words = phrase.split(/\s+/).map((w) => (w === 'X' || w === 'Y' ? '\\S+' : escape(w)));
    return new RegExp(`(^|[^\\p{L}'])${words.join('\\s+')}($|[^\\p{L}])`, 'iu');
  }

  /**
   * Context-qualified terms that COPY.md uses on purpose. Each is checked by hand against the
   * qualifier in 1.3; anything not listed here fails.
   */
  const REVIEWED: Record<string, string> = {
    // "just (as a softener)": these mean "only", not "just tap".
    'empty.groups::just': 'Just Everyone for now: "only Everyone"',
    'in.withdrawn.toast::just': '"just sees one fewer": "only sees", the point of the line',
    'order.label.once::just': '"Just this time" is the COPY.md 1.4 term for a one-time note',
    'n.bring_once.body::just': 'Same 1.4 term, "Just this time: {once}"',
    'perm.notif.again.body::just': '"You just got a flare": recency, not a softener',
  };

  it('parses the banned list from COPY.md 1.3', () => {
    const phrases = BANNED_TERMS.map((b) => lower(b.phrase));
    for (const p of ['seamless', 'unlock', 'journey', 'oops', 'declined', 'seen', 'just']) {
      expect(phrases).toContain(p);
    }
  });

  it('no string contains a banned word or phrase', () => {
    const hits: string[] = [];
    for (const k of KEYS) {
      for (const term of BANNED_TERMS) {
        if (!termRegex(term.phrase).test(STRINGS[k])) continue;
        const id = `${k}::${lower(term.phrase)}`;
        if (!term.qualifier || !REVIEWED[id]) hits.push(`${id} -> ${STRINGS[k]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('every reviewed exception still exists, so the list cannot rot', () => {
    for (const id of Object.keys(REVIEWED)) {
      const [key, phrase] = id.split('::') as [StringKey, string];
      expect(isStringKey(key)).toBe(true);
      expect(termRegex(phrase).test(STRINGS[key])).toBe(true);
    }
  });

  it('the check catches a banned word', () => {
    expect(termRegex('unlock').test('Unlock the full Clink experience')).toBe(true);
    expect(termRegex('seen').test('Seen by Leo')).toBe(true);
    expect(termRegex('seen').test('Unseen')).toBe(false);
    expect(termRegex("whether you're X or Y").test("whether you're busy or bored")).toBe(true);
  });

  it('has no exclamation marks, em dashes or double hyphens', () => {
    for (const k of KEYS) {
      expect([k, /[!—]|--/.test(STRINGS[k])]).toEqual([k, false]);
    }
  });

  it('never says "link" next to an invite, or mentions quiet hours (CEO guidelines 5 and 6)', () => {
    for (const k of KEYS) {
      const s = lower(STRINGS[k]);
      expect([k, /invite link|copy link/.test(s)]).toEqual([k, false]);
      expect([k, /quiet hours|do not disturb/.test(s)]).toEqual([k, false]);
    }
  });

  it('uses the ellipsis character, never three periods', () => {
    for (const k of KEYS) expect([k, STRINGS[k].includes('...')]).toEqual([k, false]);
  });
});

describe('truncation helpers (COPY.md 0.2 and 6)', () => {
  it('cuts to budget - 1 plus an ellipsis', () => {
    expect(truncateTo('Christopherson', 12)).toBe('Christopher…');
    expect(Array.from(truncateTo('Christopherson', 12))).toHaveLength(12);
    expect(truncateTo('Maya', 12)).toBe('Maya');
    expect(truncateVar('name', 'Maximiliana-Rose')).toBe('Maximiliana…');
    expect(truncateWidgetVar('place', 'The Very Long Coffee Place')).toBe('The Very Long Cof…');
    expect(truncateWidgetVar('group', 'Climbing gym crew')).toBe('Climbing gym…');
  });

  it('takes the first word of a display name', () => {
    expect(firstName('  Dana Levi ')).toBe('Dana');
  });
});
