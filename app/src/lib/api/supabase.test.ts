// The Supabase adapter against a fake client: every method, the queries it sends, and how each
// failure maps to an ApiError. The real project is exercised by e2e/real-backend.
import { filter, FakeSupabase } from '@/test/fakeSupabase';
import { memoryStore } from '@/lib/kv';

import { ApiError } from './errors';
import {
  CODE_LOCK_MS,
  CODE_VALID_MS,
  createSupabaseApi,
  entryFromRow,
  fromAuth,
  fromFunction,
  fromPostgrest,
  localDate,
  rowFromEntry,
  stepFromDb,
  type DrinkLogRow,
} from './supabase';
import type { LogEntry } from './types';

const UID = '00000000-0000-4000-8000-000000000001';
const PHONE = '+12015550104';
const NOW = new Date(2026, 10, 16, 9, 30); // local time, Monday 16 Nov 2026

function setup(opts: { platform?: 'ios' | 'android' | 'web'; now?: () => Date } = {}) {
  const fake = new FakeSupabase(UID);
  const sealed = memoryStore();
  const plain = memoryStore();
  let n = 0;
  let clock = NOW.getTime();
  const api = createSupabaseApi({
    client: fake.asClient(),
    sealed,
    plain,
    platform: opts.platform ?? 'web',
    appVersion: '0.1.0',
    now: opts.now ?? (() => new Date(clock)),
    uuid: () => `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    timezone: () => 'Europe/Dublin',
    prepareAvatar: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    inviteBase: 'https://clink.test',
  });
  const tick = (ms: number) => (clock += ms);
  return { fake, api, sealed, plain, tick };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof ApiError ? e.code : `not ApiError: ${String(e)}`;
  }
  return 'resolved';
}

const offline = { error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 };

describe('error mapping', () => {
  it('maps database SQLSTATEs from 0003 to API codes', () => {
    expect(fromPostgrest({ code: 'CLTXT', message: 'text_blocked' }, 422).code).toBe(
      'text_blocked',
    );
    expect(fromPostgrest({ code: 'CLSUS' }, 403).code).toBe('suspended');
    expect(fromPostgrest({ code: 'CLBLK' }, 404).code).toBe('not_found');
    const rl = fromPostgrest({ code: 'CLRTL', details: '120' }, 429);
    expect(rl.code).toBe('rate_limited');
    expect(rl.retryAfterSec).toBe(120);
    expect(fromPostgrest({ code: 'PGRST301' }, 401).code).toBe('unauthorized');
    expect(fromPostgrest({ code: '23514' }, 400).code).toBe('bad_input');
    expect(fromPostgrest({ code: '42501' }, 403).code).toBe('server');
  });

  it('treats a failed fetch as network', () => {
    expect(fromPostgrest(offline.error, 0).code).toBe('network');
    expect(fromPostgrest({ message: 'Network request failed' }).code).toBe('network');
  });

  it('maps Supabase Auth errors', () => {
    expect(fromAuth({ name: 'AuthRetryableFetchError', status: 0 }).code).toBe('network');
    expect(fromAuth({ status: 504, message: 'timeout' }).code).toBe('network');
    expect(fromAuth({ status: 400, code: 'validation_failed' }).code).toBe('phone_invalid');
    expect(fromAuth({ status: 429, code: 'over_sms_send_rate_limit' }).code).toBe('rate_limited');
    expect(fromAuth({ status: 422, code: 'phone_exists' }).code).toBe('phone_taken');
    expect(fromAuth({ status: 500, message: 'Unable to get SMS provider' }).code).toBe(
      'sms_failed',
    );
    expect(fromAuth({ status: 400, code: 'refresh_token_not_found' }).code).toBe('unauthorized');
    expect(fromAuth({ status: 500, message: 'boom' }).code).toBe('server');
  });

  it('maps edge function answers, including a function that is not deployed', async () => {
    const http = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
      name: 'FunctionsHttpError',
      context: new Response(JSON.stringify(body), { status, headers }),
    });
    expect((await fromFunction(http(403, { error: 'under_age', min: 16 }))).min).toBe(16);
    expect((await fromFunction(http(401, { error: 'reauth_required' }))).code).toBe(
      'reauth_required',
    );
    expect((await fromFunction(http(401, { error: 'unauthorized' }))).code).toBe('unauthorized');
    expect((await fromFunction(http(422, { error: 'text_blocked' }))).code).toBe('text_blocked');
    const rl = await fromFunction(http(429, { error: 'rate_limited' }, { 'retry-after': '90' }));
    expect([rl.code, rl.retryAfterSec]).toEqual(['rate_limited', 90]);
    expect((await fromFunction(http(404, { code: 'NOT_FOUND' }))).code).toBe('unsupported');
    expect((await fromFunction(http(500, { error: 'internal' }))).code).toBe('server');
    expect((await fromFunction({ name: 'FunctionsFetchError' })).code).toBe('network');
  });
});

describe('row mapping', () => {
  it('writes a catalog drink with its name, caffeine and the device-local date', () => {
    const e: LogEntry = {
      id: 'a',
      drinkId: 'coffee.flat_white',
      customName: null,
      category: 'coffee',
      details: { caf: 'Decaf' },
      loggedAt: NOW.toISOString(),
    };
    const row = rowFromEntry(UID, e);
    expect(row).toMatchObject({
      drink_name: 'Flat White',
      caffeinated: false,
      local_date: '2026-11-16',
      source: 'app',
      user_id: UID,
    });
    // Back from the server, a decaf row reads as Decaf so the caffeine count stays right.
    expect(entryFromRow(row).details).toEqual({ caf: 'Decaf' });
    expect(entryFromRow({ ...row, caffeinated: true }).details).toEqual({});
  });

  it('writes a custom drink under its own name and water as never caffeinated', () => {
    const custom = rowFromEntry(UID, {
      id: 'b',
      drinkId: null,
      customName: 'Dirty chai',
      category: 'tea',
      details: {},
      loggedAt: NOW.toISOString(),
    });
    expect([custom.drink_id, custom.drink_name, custom.caffeinated]).toEqual([
      null,
      'Dirty chai',
      true,
    ]);
    expect(entryFromRow(custom).customName).toBe('Dirty chai');
    const water = rowFromEntry(UID, {
      id: 'c',
      drinkId: 'water.still',
      customName: null,
      category: 'water',
      details: {},
      loggedAt: NOW.toISOString(),
    });
    expect(water.caffeinated).toBe(false);
  });

  it('reads the onboarding step, with the column default as the name step', () => {
    expect(stepFromDb('profile')).toBe('name');
    expect(stepFromDb('invite')).toBe('invite');
    expect(stepFromDb('done')).toBe('done');
    expect(stepFromDb(null)).toBe('name');
  });

  it('formats the local date', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('sign-in with phone', () => {
  it('has no session until a code is verified', async () => {
    const { api } = setup();
    expect(await api.getSession()).toBeNull();
  });

  it('refuses a number that is not E.164 without calling Auth', async () => {
    const { api, fake } = setup();
    expect(await codeOf(api.sendPhoneCode('2015550104'))).toBe('phone_invalid');
    expect(fake.otpSent).toEqual([]);
  });

  it('sends a code and maps the provider failures', async () => {
    const { api, fake } = setup();
    await api.sendPhoneCode(PHONE);
    expect(fake.otpSent).toEqual([PHONE]);
    fake.onOtp = () => ({ status: 500, message: 'Unable to get SMS provider' });
    expect(await codeOf(api.sendPhoneCode('+12025550199'))).toBe('sms_failed');
    fake.onOtp = () => ({ status: 429, message: 'later', code: 'over_sms_send_rate_limit' });
    expect(await codeOf(api.sendPhoneCode(PHONE))).toBe('rate_limited');
  });

  it('verifies a code into a session with the own number in E.164', async () => {
    const { api } = setup();
    await api.sendPhoneCode(PHONE);
    expect(await api.verifyPhoneCode(PHONE, '755243')).toEqual({
      userId: UID,
      method: 'phone',
      phone: PHONE,
    });
    expect(await api.getSession()).toMatchObject({ userId: UID, phone: PHONE });
  });

  it('registers the device on native when asked, never on the web build', async () => {
    const native = setup({ platform: 'android' });
    await native.api.verifyPhoneCode(PHONE, '755243');
    // Sign-in itself no longer registers: the store does, once the account exists.
    expect(native.fake.invokes.some((i) => i.name === 'register-device')).toBe(false);
    await native.api.registerDevice();
    const reg = native.fake.invokes.find((i) => i.name === 'register-device');
    expect(reg?.body).toMatchObject({
      action: 'register',
      platform: 'android',
      appVersion: '0.1.0',
      timezone: 'Europe/Dublin',
    });
    expect(reg?.body).not.toHaveProperty('userId');
    const web = setup({ platform: 'web' });
    await web.api.verifyPhoneCode(PHONE, '755243');
    expect(await web.api.registerDevice()).toBeNull();
    expect(web.fake.invokes.some((i) => i.name === 'register-device')).toBe(false);
  });

  it('calls a wrong code wrong, then locks the number after 5 for 15 minutes', async () => {
    const { api, fake, tick } = setup();
    fake.onVerify = () => ({
      error: { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' },
    });
    await api.sendPhoneCode(PHONE);
    for (let i = 0; i < 4; i++)
      expect(await codeOf(api.verifyPhoneCode(PHONE, '000000'))).toBe('code_wrong');
    expect(await codeOf(api.verifyPhoneCode(PHONE, '000000'))).toBe('code_locked');
    fake.onVerify = () => null;
    let locked: unknown;
    try {
      await api.verifyPhoneCode(PHONE, '755243');
    } catch (e) {
      locked = e;
    }
    expect((locked as ApiError).code).toBe('code_locked');
    expect((locked as ApiError).retryAfterSec).toBe(CODE_LOCK_MS / 1000);
    tick(CODE_LOCK_MS + 1000);
    expect((await api.verifyPhoneCode(PHONE, '755243')).userId).toBe(UID);
  });

  it('calls a code older than 10 minutes expired', async () => {
    const { api, fake, tick } = setup();
    await api.sendPhoneCode(PHONE);
    tick(CODE_VALID_MS + 1000);
    fake.onVerify = () => ({ error: { status: 403, code: 'otp_expired', message: 'expired' } });
    expect(await codeOf(api.verifyPhoneCode(PHONE, '755243'))).toBe('code_expired');
  });

  it('reports no connection as network, not as a wrong code', async () => {
    const { api, fake } = setup();
    fake.onVerify = () => ({ error: { status: 0, message: 'Failed to fetch' } });
    expect(await codeOf(api.verifyPhoneCode(PHONE, '755243'))).toBe('network');
  });

  it('signs in with Apple or Google only once they exist', async () => {
    const { api } = setup();
    expect(await codeOf(api.signIn('apple'))).toBe('unsupported');
  });
});

describe('account', () => {
  it('sends the age answer, name, time zone and install id to complete-signup, never a user id', async () => {
    const { api, fake, plain } = setup();
    fake.signedIn();
    await api.completeSignup({ birthMonth: 3, birthYear: 1994 }, '  Dana Kim ');
    const call = fake.invokes.find((i) => i.name === 'complete-signup');
    expect(call?.body).toEqual({
      birthMonth: 3,
      birthYear: 1994,
      displayName: 'Dana Kim',
      timezone: 'Europe/Dublin',
      installId: await plain.getItem('install_id'),
    });
  });

  it('signs out locally when complete-signup refuses the age', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onInvoke = () => ({ status: 403, body: { error: 'under_age', min: 16 } });
    let err: unknown;
    try {
      await api.completeSignup({ birthMonth: 1, birthYear: 2015 }, 'Kid');
    } catch (e) {
      err = e;
    }
    expect((err as ApiError).code).toBe('under_age');
    expect((err as ApiError).min).toBe(16);
    expect(fake.signOuts).toEqual([{ scope: 'local' }]);
  });

  it('maps complete-signup offline and text refusals', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onInvoke = () => 'offline';
    expect(await codeOf(api.completeSignup({ birthMonth: 1, birthYear: 1990 }, 'Dana'))).toBe(
      'network',
    );
    fake.onInvoke = () => ({ status: 422, body: { error: 'text_blocked' } });
    expect(await codeOf(api.completeSignup({ birthMonth: 1, birthYear: 1990 }, 'x'))).toBe(
      'text_blocked',
    );
  });

  it('deletes the account, then clears this device', async () => {
    const { api, fake, sealed, plain } = setup();
    fake.signedIn();
    await sealed.setItem(`outbox.${UID}`, '[]');
    await plain.setItem(`level_seen.${UID}`, '3');
    await api.deleteAccount();
    expect(fake.invokes.map((i) => [i.name, i.body])).toEqual([['delete-account', {}]]);
    expect(fake.signOuts).toEqual([{ scope: 'local' }]);
    expect(sealed.data.size).toBe(0);
    expect(plain.data.has(`level_seen.${UID}`)).toBe(false);
  });

  it('asks for a fresh sign-in when delete-account wants one', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onInvoke = () => ({ status: 401, body: { error: 'reauth_required' } });
    expect(await codeOf(api.deleteAccount())).toBe('reauth_required');
    expect(fake.signOuts).toEqual([]);
  });

  it('signs out of register-device on native, and locally even offline', async () => {
    const { api, fake } = setup({ platform: 'ios' });
    fake.signedIn();
    fake.onInvoke = () => 'offline';
    await api.signOut();
    expect(fake.invokes[0]).toMatchObject({ name: 'register-device', body: { action: 'signout' } });
    expect(fake.signOuts).toEqual([{ scope: 'local' }]);
  });

  const registered = (token: string) => ({
    status: 200,
    body: {
      status: 'registered',
      deviceId: '20000000-0000-4000-8000-000000000001',
      widgetToken: token,
      inviteCode: 'K7Q2M9XD',
      minIosBuild: 0,
      minAndroidBuild: 0,
    },
  });

  it('keeps an offline sign-out pending with the install id only, and sends it on the next launch', async () => {
    const { api, fake, plain } = setup({ platform: 'android' });
    fake.signedIn();
    fake.onInvoke = () => 'offline';
    await api.signOut();
    const install = await plain.getItem('install_id');
    expect(JSON.parse((await plain.getItem('signout_pending'))!)).toEqual({ installId: install });
    expect(fake.signOuts).toEqual([{ scope: 'local' }]);

    // Next launch, still offline: nothing is lost.
    fake.signedIn();
    expect(await api.registerDevice()).toBeNull();
    expect(await plain.getItem('signout_pending')).not.toBeNull();

    // Next launch online: the sign-out goes first, then this launch's registration.
    fake.invokes.length = 0;
    fake.onInvoke = (name, body) =>
      (body as { action?: string }).action === 'signout'
        ? { status: 200, body: { status: 'signed_out', removed: true } }
        : registered('B'.repeat(43));
    expect(await api.registerDevice()).toEqual({ widgetToken: 'B'.repeat(43) });
    expect(fake.invokes.map((i) => (i.body as { action: string }).action)).toEqual([
      'signout',
      'register',
    ]);
    expect(fake.invokes[0]!.body).toEqual({ action: 'signout', installId: install });
    expect(await plain.getItem('signout_pending')).toBeNull();

    // Once sent, the next launch only registers.
    fake.invokes.length = 0;
    await api.registerDevice();
    expect(fake.invokes.map((i) => (i.body as { action: string }).action)).toEqual(['register']);
  });

  it('drops a pending sign-out the server refuses for good, and clears it on an online sign-out', async () => {
    const { api, fake, plain } = setup({ platform: 'ios' });
    fake.signedIn();
    fake.onInvoke = () => 'offline';
    await api.signOut();
    expect(await plain.getItem('signout_pending')).not.toBeNull();
    fake.signedIn();
    fake.onInvoke = (name, body) =>
      (body as { action?: string }).action === 'signout'
        ? { status: 400, body: { error: 'bad_input' } }
        : registered('C'.repeat(43));
    expect(await api.registerDevice()).toEqual({ widgetToken: 'C'.repeat(43) });
    expect(await plain.getItem('signout_pending')).toBeNull();

    await plain.setItem('signout_pending', JSON.stringify({ installId: 'not-an-id' }));
    fake.invokes.length = 0;
    await api.registerDevice();
    expect(fake.invokes.map((i) => (i.body as { action: string }).action)).toEqual(['register']);
    expect(await plain.getItem('signout_pending')).toBeNull();

    fake.onInvoke = () => 'offline';
    await api.signOut();
    fake.signedIn();
    fake.onInvoke = () => ({ status: 200, body: { status: 'signed_out', removed: false } });
    await api.signOut();
    expect(await plain.getItem('signout_pending')).toBeNull();
  });

  it('never keeps a pending sign-out on the web', async () => {
    const { api, fake, plain } = setup({ platform: 'web' });
    fake.signedIn();
    fake.onInvoke = () => 'offline';
    await api.signOut();
    expect(await plain.getItem('signout_pending')).toBeNull();
  });

  it('tells the app when the session ends on its own', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    const ended = jest.fn();
    const off = api.onSessionEnd!(ended);
    await fake.asClient().auth.signOut();
    expect(ended).toHaveBeenCalledTimes(1);
    off();
  });

  it('refuses every call that needs a user while signed out', async () => {
    const { api } = setup();
    expect(await codeOf(api.getMe())).toBe('unauthorized');
    expect(await codeOf(api.getToday())).toBe('unauthorized');
  });
});

describe('profile', () => {
  it('reads a new identity with no profile as needing sign-up', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    const me = await api.getMe();
    expect(me).toEqual({
      displayName: '',
      photoUri: null,
      providerName: null,
      hasPhone: true,
      onboarding: 'name',
      needsSignup: true,
    });
    expect(filter(fake.on('profiles')[0]!, 'eq', 'id')).toBe(UID);
  });

  it('reads the profile, a signed avatar URL and the saved step', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = (c) =>
      c.table === 'profiles'
        ? { data: { display_name: 'Dana Kim', avatar_path: `${UID}/1.jpg` } }
        : c.table === 'user_settings'
          ? { data: { onboarding_step: 'usual' } }
          : {};
    const me = await api.getMe();
    expect(me.displayName).toBe('Dana Kim');
    expect(me.photoUri).toBe(`https://signed.test/avatars/${UID}/1.jpg?e=3600`);
    expect(me.onboarding).toBe('usual');
    expect(me.needsSignup).toBe(false);
  });

  it('updates the name and the step as the user, on their own rows', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    await api.updateMe({ displayName: ' Dana ', onboarding: 'invite' });
    const [nameUpdate] = fake.on('profiles').filter((q) => q.op === 'update');
    expect(nameUpdate?.values).toEqual({ display_name: 'Dana' });
    expect(filter(nameUpdate!, 'eq', 'id')).toBe(UID);
    const step = fake.on('user_settings').find((q) => q.op === 'update');
    expect(step?.values).toEqual({ onboarding_step: 'invite' });
    expect(filter(step!, 'eq', 'user_id')).toBe(UID);
  });

  it('uploads a new photo into the own folder as JPEG and removes the old one', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = (c) =>
      c.table === 'profiles' && c.op === 'select'
        ? { data: { display_name: 'Dana', avatar_path: `${UID}/1.jpg` } }
        : {};
    await api.updateMe({ photoUri: 'file:///picked.heic' });
    expect(fake.uploads).toHaveLength(1);
    const up = fake.uploads[0]!;
    expect(up.bucket).toBe('avatars');
    expect(up.path).toMatch(new RegExp(`^${UID}/\\d{1,13}\\.jpg$`));
    expect(up.options).toEqual({ contentType: 'image/jpeg', upsert: false });
    const set = fake.on('profiles').find((q) => q.op === 'update');
    expect(set?.values).toEqual({ avatar_path: up.path });
    expect(fake.removed).toEqual([{ bucket: 'avatars', paths: [`${UID}/1.jpg`] }]);
  });

  it('clears the photo', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = (c) =>
      c.table === 'profiles' && c.op === 'select'
        ? { data: { display_name: 'Dana', avatar_path: `${UID}/1.jpg` } }
        : {};
    await api.updateMe({ photoUri: null });
    expect(fake.on('profiles').find((q) => q.op === 'update')?.values).toEqual({
      avatar_path: null,
    });
  });

  it('maps a blocked name to text_blocked', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = (c) =>
      c.op === 'update' ? { error: { code: 'CLTXT', message: 'text_blocked' }, status: 400 } : {};
    expect(await codeOf(api.updateMe({ displayName: 'bad' }))).toBe('text_blocked');
  });

  it('starts adding a phone number through Auth', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    await api.addPhone(PHONE);
    expect(fake.invokes).toContainEqual({ name: 'auth.updateUser', body: { phone: PHONE } });
  });
});

describe('usual 3', () => {
  it('reads only the caller’s rows, in slot order', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = () => ({
      data: [
        {
          slot: 1,
          drink_id: 'coffee.flat_white',
          custom_name: null,
          category: 'coffee',
          details: { milk: 'Oat milk' },
        },
        { slot: 2, drink_id: null, custom_name: 'Dirty chai', category: 'tea', details: null },
      ],
    });
    const usual = await api.getUsual();
    expect(usual).toEqual([
      {
        drinkId: 'coffee.flat_white',
        customName: null,
        category: 'coffee',
        details: { milk: 'Oat milk' },
      },
      { drinkId: null, customName: 'Dirty chai', category: 'tea', details: {} },
    ]);
    const q = fake.on('usual_drinks')[0]!;
    expect(filter(q, 'eq', 'user_id')).toBe(UID);
  });

  it('updates existing slots, inserts new ones and deletes the rest', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = (c) =>
      c.op === 'update' ? { data: filter(c, 'eq', 'slot') === 1 ? [{ slot: 1 }] : [] } : {};
    await api.setUsual([
      { drinkId: 'matcha.latte', customName: null, category: 'matcha', details: { temp: 'Iced' } },
      { drinkId: null, customName: 'Dirty chai', category: 'tea', details: {} },
    ]);
    const ops = fake
      .on('usual_drinks')
      .map((q) => [q.op, filter(q, 'eq', 'slot') ?? filter(q, 'gt', 'slot')]);
    expect(ops).toEqual([
      ['update', 1],
      ['update', 2],
      ['insert', undefined],
      ['delete', 2],
      ['select', undefined],
    ]);
    const insert = fake.on('usual_drinks').find((q) => q.op === 'insert');
    expect(insert?.values).toEqual({
      user_id: UID,
      slot: 2,
      drink_id: null,
      custom_name: 'Dirty chai',
      category: 'tea',
      details: {},
    });
  });

  it('runs overlapping saves one after the other, so slots never race', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    const rows = new Set<number>();
    fake.onQuery = async (c) => {
      await new Promise((r) => setTimeout(r, 5));
      const slot = filter(c, 'eq', 'slot') as number | undefined;
      if (c.op === 'update') return { data: slot && rows.has(slot) ? [{ slot }] : [] };
      if (c.op === 'insert') {
        const s = (c.values as { slot: number }).slot;
        if (rows.has(s)) return { error: { code: '23505', message: 'duplicate' }, status: 409 };
        rows.add(s);
      }
      return {};
    };
    const d = {
      drinkId: 'coffee.latte',
      customName: null,
      category: 'coffee' as const,
      details: {},
    };
    const first = api.setUsual([d, d]);
    const second = api.setUsual([d, { ...d, details: { size: 'Large' } }]);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fake.on('usual_drinks').filter((q) => q.op === 'insert')).toHaveLength(2);
  });

  it('never puts water in a slot and never takes a 4th drink', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    const d = {
      drinkId: 'coffee.latte',
      customName: null,
      category: 'coffee' as const,
      details: {},
    };
    expect(await codeOf(api.setUsual([d, d, d, d]))).toBe('bad_input');
    expect(await codeOf(api.setUsual([{ ...d, drinkId: 'water.still' }]))).toBe('bad_input');
    expect(fake.queries).toEqual([]);
  });
});

describe('tracker', () => {
  const row = (id: string, over: Partial<DrinkLogRow> = {}): DrinkLogRow => ({
    id,
    user_id: UID,
    drink_id: 'coffee.americano',
    drink_name: 'Americano',
    category: 'coffee',
    caffeinated: true,
    logged_at: new Date(NOW.getTime() - 3600_000).toISOString(),
    local_date: '2026-11-16',
    source: 'app',
    ...over,
  });

  it('reads today by the device-local date, own rows only', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = () => ({ data: [row('r1')] });
    const today = await api.getToday();
    expect(today.map((e) => e.id)).toEqual(['r1']);
    const q = fake.on('drink_logs')[0]!;
    expect(filter(q, 'eq', 'local_date')).toBe('2026-11-16');
    expect(filter(q, 'eq', 'user_id')).toBe(UID);
  });

  it('logs with an id made on the device, idempotent on retry', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    const e = await api.logDrink({
      drinkId: 'water.still',
      customName: null,
      category: 'water',
      details: {},
    });
    expect(e.id).toMatch(/^10000000-/);
    const up = fake.on('drink_logs')[0]!;
    expect(up.op).toBe('upsert');
    expect(up.options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect(up.values).toMatchObject({
      id: e.id,
      category: 'water',
      caffeinated: false,
      source: 'app',
    });
  });

  it('keeps a log made offline and sends it later with its original time', async () => {
    const { api, fake, tick } = setup();
    fake.signedIn();
    fake.onQuery = () => offline;
    const e = await api.logDrink({
      drinkId: 'tea.jasmine',
      customName: null,
      category: 'tea',
      details: {},
    });
    tick(5 * 60_000);
    // Still offline: today shows it from the queue.
    expect(await codeOf(api.getToday())).toBe('network');
    // Back online: the queue goes first, then today's read.
    const sent: unknown[] = [];
    fake.onQuery = (c) => {
      if (c.op === 'upsert') sent.push(c.values);
      return c.op === 'select' ? { data: [] } : {};
    };
    const today = await api.getToday();
    expect(sent).toEqual([expect.objectContaining({ id: e.id, logged_at: e.loggedAt })]);
    expect(today).toEqual([]);
  });

  it('shows queued logs in today while the server has not got them yet', async () => {
    const { api, fake, sealed } = setup();
    fake.signedIn();
    const queued: LogEntry = {
      id: 'q1',
      drinkId: 'coffee.latte',
      customName: null,
      category: 'coffee',
      details: {},
      loggedAt: NOW.toISOString(),
    };
    await sealed.setItem(`outbox.${UID}`, JSON.stringify([{ op: 'insert', entry: queued }]));
    // The queued insert fails again (offline for writes), the read works.
    fake.onQuery = (c) => (c.op === 'upsert' ? offline : { data: [row('r1')] });
    const today = await api.getToday();
    expect(today.map((x) => x.id)).toEqual(['r1', 'q1']);
  });

  it('undoes a queued log without a request, and queues a delete made offline', async () => {
    const { api, fake, sealed } = setup();
    fake.signedIn();
    fake.onQuery = () => offline;
    const e = await api.logDrink({
      drinkId: 'coffee.latte',
      customName: null,
      category: 'coffee',
      details: {},
    });
    await api.removeLog(e.id);
    expect(JSON.parse((await sealed.getItem(`outbox.${UID}`))!)).toEqual([]);
    const before = fake.queries.length;
    await api.removeLog('r1');
    expect(fake.queries.length).toBe(before + 1);
    expect(JSON.parse((await sealed.getItem(`outbox.${UID}`))!)).toEqual([
      { op: 'delete', id: 'r1' },
    ]);
    // Undo of that delete cancels it; the row never left the server.
    await api.restoreLog(entryFromRow(row('r1')));
    expect(JSON.parse((await sealed.getItem(`outbox.${UID}`))!)).toEqual([]);
  });

  it('deletes and restores online by id', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    await api.removeLog('r1');
    const del = fake.on('drink_logs')[0]!;
    expect([del.op, filter(del, 'eq', 'id'), filter(del, 'eq', 'user_id')]).toEqual([
      'delete',
      'r1',
      UID,
    ]);
    const entry = entryFromRow(row('r1'));
    await api.restoreLog(entry);
    expect(fake.on('drink_logs')[1]!.values).toMatchObject({ id: 'r1', logged_at: entry.loggedAt });
  });

  it('throws a refusal that is not about the connection', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = () => ({ error: { code: 'CLBAD', message: 'bad_input' }, status: 400 });
    expect(
      await codeOf(
        api.logDrink({
          drinkId: 'coffee.latte',
          customName: null,
          category: 'coffee',
          details: {},
        }),
      ),
    ).toBe('bad_input');
  });
});

describe('XP', () => {
  it('reads the own total and history, naming friends by first name', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    const friend = '00000000-0000-4000-8000-0000000000f1';
    const stranger = '00000000-0000-4000-8000-0000000000f2';
    fake.onQuery = (c) => {
      if (c.table === 'xp_totals') return { data: { total: 380 } };
      if (c.table === 'xp_events')
        return {
          data: [
            {
              id: 9,
              kind: 'flare_joined',
              amount: 10,
              counterpart: friend,
              created_at: '2026-11-15T10:00:00Z',
            },
            {
              id: 8,
              kind: 'invite_accepted',
              amount: 50,
              counterpart: stranger,
              created_at: '2026-11-14T10:00:00Z',
            },
            {
              id: 7,
              kind: 'daily_log',
              amount: 5,
              counterpart: null,
              created_at: '2026-11-13T10:00:00Z',
            },
          ],
        };
      if (c.table === 'profiles') return { data: [{ id: friend, display_name: 'Maya Lin' }] };
      return {};
    };
    const xp = await api.getXp();
    expect(xp.total).toBe(380);
    expect(xp.levelSeen).toBe(1);
    expect(xp.history.map((h) => [h.id, h.kind, h.name])).toEqual([
      ['9', 'flare_joined', 'Maya'],
      ['8', 'invite_accepted', null],
      ['7', 'daily_log', null],
    ]);
    expect(filter(fake.on('xp_totals')[0]!, 'eq', 'user_id')).toBe(UID);
    expect(filter(fake.on('xp_events')[0]!, 'eq', 'user_id')).toBe(UID);
  });

  it('starts at zero and keeps the level already seen on this device', async () => {
    const { api, fake, plain } = setup();
    fake.signedIn();
    expect((await api.getXp()).total).toBe(0);
    await api.markLevelSeen(3);
    await api.markLevelSeen(2);
    expect(await plain.getItem(`level_seen.${UID}`)).toBe('3');
    expect((await api.getXp()).levelSeen).toBe(3);
  });
});

describe('camera data', () => {
  it('counts friends and reads own groups with the Automatic roles', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = (c) =>
      c.table === 'friendships'
        ? { count: 4 }
        : c.table === 'groups'
          ? {
              data: [
                {
                  id: 'g1',
                  name: 'Work',
                  emoji: '💼',
                  auto_role: 'work',
                  group_members: [{ count: 3 }],
                },
                { id: 'g2', name: 'Home', emoji: null, auto_role: null, group_members: [] },
              ],
            }
          : {};
    expect(await api.getAudience()).toEqual({
      friendCount: 4,
      groups: [
        { id: 'g1', name: 'Work', emoji: '💼', memberCount: 3 },
        { id: 'g2', name: 'Home', emoji: '', memberCount: 0 },
      ],
      auto: { daytimeGroupId: 'g1', otherGroupId: null },
    });
    expect(filter(fake.on('groups')[0]!, 'eq', 'owner_id')).toBe(UID);
  });

  it('reads the own live flare and last place', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    expect(await api.getLiveFlare()).toBeNull();
    expect(await api.getLastPlace()).toBe('');
    fake.onQuery = (c) =>
      c.columns === 'place'
        ? { data: { place: 'Kaffa' } }
        : {
            data: {
              id: 'f1',
              category: 'tea',
              place: null,
              created_at: '2026-11-16T09:00:00Z',
              expires_at: '2026-11-16T09:15:00Z',
            },
          };
    expect(await api.getLastPlace()).toBe('Kaffa');
    expect(await api.getLiveFlare()).toEqual({
      id: 'f1',
      category: 'tea',
      place: '',
      createdAt: '2026-11-16T09:00:00Z',
      expiresAt: '2026-11-16T09:15:00Z',
    });
    const live = fake.on('flares').at(-1)!;
    expect([filter(live, 'eq', 'sender_id'), filter(live, 'eq', 'status')]).toEqual([UID, 'live']);
  });

  it('says plainly what is not built on this backend yet', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    const req = {
      category: 'coffee' as const,
      place: '',
      timingMin: 0,
      audience: { kind: 'auto' as const },
      tappedAt: NOW.toISOString(),
    };
    expect(await codeOf(api.sendFlare(req))).toBe('unsupported');
    expect(await codeOf(api.shareSnap({ photoUri: 'file:///a.jpg', place: '' }))).toBe(
      'unsupported',
    );
    expect(await codeOf(api.addContact('c1'))).toBe('unsupported');
    expect(await api.requestNotifications()).toBe('denied');
    expect(await api.requestContacts()).toBe('denied');
    expect(await api.getContactMatches()).toEqual([]);
  });
});

describe('invites', () => {
  it('builds the invite URL from the active code, for share messages only', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = () => ({ data: { code: 'K7Q2M9XD' } });
    expect(await api.getInviteUrl()).toBe('https://clink.test/i/K7Q2M9XD');
    const q = fake.on('invites')[0]!;
    expect([filter(q, 'eq', 'inviter_id'), filter(q, 'is', 'revoked_at')]).toEqual([UID, null]);
  });

  it('records a share tap as a first-party event and never fails the share', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = () => ({ error: { code: '42501', message: 'rls' }, status: 403 });
    await expect(api.recordInviteShare('whatsapp')).resolves.toBeUndefined();
    expect(fake.on('app_events')[0]?.values).toEqual({
      user_id: UID,
      name: 'invite_share_tapped',
      props: { channel: 'whatsapp', surface: 'onboarding' },
    });
  });

  it('records where the share buttons were', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    await api.recordInviteShare('messages', 'widget');
    expect(fake.on('app_events')[0]?.values).toMatchObject({
      props: { channel: 'messages', surface: 'widget' },
    });
  });
});

describe('widget_log_rejected (ARCHITECTURE.md 3.2)', () => {
  const props = { code: 'unknown_drink', kind: 'malformed', category: 'tea' } as const;

  it('writes the enums only, as the signed-in user', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    await api.recordWidgetLogRejected(props);
    expect(fake.on('app_events')[0]?.values).toEqual({
      user_id: UID,
      name: 'widget_log_rejected',
      props,
    });
  });

  it('resolves when RLS refuses it (usage stats off), and throws only when offline', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    fake.onQuery = () => ({ error: { code: '42501', message: 'rls' }, status: 403 });
    await expect(api.recordWidgetLogRejected(props)).resolves.toBeUndefined();
    fake.onQuery = () => ({ error: { message: 'Network request failed' }, status: 0 });
    await expect(api.recordWidgetLogRejected(props)).rejects.toMatchObject({ code: 'network' });
  });

  it('never sends a prop the event schema does not list', async () => {
    const { api, fake } = setup();
    fake.signedIn();
    await api.recordWidgetLogRejected({ ...props, drinkId: 'tea.jasmine' } as never);
    expect(fake.on('app_events')).toHaveLength(0);
  });
});

describe('widget token and widget-api/state', () => {
  const TOKEN = 'Ab3_-'.repeat(8) + 'xyz'; // 43 base64url characters, test value
  const TOKEN2 = 'Zz9-_'.repeat(8) + 'abc';
  const URL_BASE = 'https://proj.supabase.test';
  const registered = (token: string) => ({
    status: 200,
    body: {
      status: 'registered',
      deviceId: '20000000-0000-4000-8000-000000000001',
      widgetToken: token,
      inviteCode: 'K7Q2M9XD',
      minIosBuild: 0,
      minAndroidBuild: 0,
    },
  });
  const readyState = {
    v: 1,
    state: 'ready',
    updatedAt: '2026-11-16T09:30:00Z',
    me: { initial: 'D', friendsCount: 0 },
    usual: [],
    today: { localDate: '2026-11-16', drinks: 0, water: 0, caffeinated: 0, lastDrinkAt: null },
    groups: [],
    auto: { daytimeGroupId: null, otherGroupId: null },
    lastPlace: null,
    myFlare: null,
    incoming: [],
    snaps: [],
    outbox: [],
  };

  function widgetSetup(answer: (url: string, init: RequestInit) => Response | 'offline') {
    const fake = new FakeSupabase(UID).signedIn();
    const sealed = memoryStore();
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: { ...(init.headers as Record<string, string>) } });
      const r = answer(url, init);
      if (r === 'offline') throw new TypeError('Network request failed');
      return r;
    }) as unknown as typeof fetch;
    const api = createSupabaseApi({
      client: fake.asClient(),
      sealed,
      plain: memoryStore(),
      platform: 'android',
      appVersion: '0.1.0',
      now: () => NOW,
      uuid: () => '10000000-0000-4000-8000-000000000009',
      timezone: () => 'Europe/Dublin',
      widgetApi: { url: URL_BASE, region: 'eu-west-1' },
      fetch: fetchFn,
    });
    return { api, fake, sealed, calls };
  }
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('returns the widget token from register-device and keeps it sealed per user', async () => {
    const { api, fake, sealed } = widgetSetup(() => json(200, readyState));
    fake.onInvoke = () => registered(TOKEN);
    expect(await api.registerDevice()).toEqual({ widgetToken: TOKEN });
    expect(await sealed.getItem(`widget_token.${UID}`)).toBe(TOKEN);
  });

  it('answers null when register-device fails or answers something else', async () => {
    const { api, fake } = widgetSetup(() => json(200, readyState));
    fake.onInvoke = () => 'offline';
    expect(await api.registerDevice()).toBeNull();
    fake.onInvoke = () => ({ status: 404, body: { error: 'not_found' } });
    expect(await api.registerDevice()).toBeNull();
    fake.onInvoke = () => ({ status: 200, body: { status: 'registered', widgetToken: 'short' } });
    expect(await api.registerDevice()).toBeNull();
  });

  it('reads widget-api/state with the widget token, the region and the zone only', async () => {
    const { api, fake, calls } = widgetSetup(() => json(200, readyState));
    expect(await api.getWidgetState('Europe/Dublin')).toBeNull(); // no token yet: no call
    expect(calls).toHaveLength(0);
    fake.onInvoke = () => registered(TOKEN);
    await api.registerDevice();
    expect(await api.getWidgetState('Europe/Dublin')).toEqual(readyState);
    expect(calls[0]!.url).toBe(`${URL_BASE}/functions/v1/widget-api/state?tz=Europe%2FDublin`);
    expect(calls[0]!.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      'x-region': 'eu-west-1',
    });
    // Never the user id, never the publishable key.
    expect(JSON.stringify(calls)).not.toContain(UID);
    expect(calls[0]!.headers).not.toHaveProperty('apikey');
  });

  it('forgets a rotated token on 401 and maps the other failures', async () => {
    let next: Response | 'offline' = json(401, { error: 'unauthorized' });
    const { api, fake, sealed } = widgetSetup(() => next);
    fake.onInvoke = () => registered(TOKEN);
    await api.registerDevice();
    expect(await codeOf(api.getWidgetState('UTC'))).toBe('unauthorized');
    expect(await sealed.getItem(`widget_token.${UID}`)).toBeNull();
    expect(await api.getWidgetState('UTC')).toBeNull();
    fake.onInvoke = () => registered(TOKEN2);
    await api.registerDevice();
    next = 'offline';
    expect(await codeOf(api.getWidgetState('UTC'))).toBe('network');
    next = json(429, { error: 'rate_limited', retryAfter: 120 });
    const e = await api.getWidgetState('UTC').catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'rate_limited', retryAfterSec: 120 });
    next = json(500, { error: 'internal' });
    expect(await codeOf(api.getWidgetState('UTC'))).toBe('server');
    // Add fields only (ARCHITECTURE.md 3.1): a newer server's extra key is ignored and dropped,
    // but a field of the wrong type is still refused.
    next = json(200, { ...readyState, extra: 1 });
    expect(await api.getWidgetState('UTC')).toEqual(readyState);
    next = json(200, { ...readyState, updatedAt: 42 });
    expect(await codeOf(api.getWidgetState('UTC'))).toBe('server');
  });

  it('drops the widget token on sign-out and on account deletion', async () => {
    const a = widgetSetup(() => json(200, readyState));
    a.fake.onInvoke = () => registered(TOKEN);
    await a.api.registerDevice();
    a.fake.onInvoke = () => ({ status: 200, body: { status: 'signed_out', removed: true } });
    await a.api.signOut();
    expect(await a.sealed.getItem(`widget_token.${UID}`)).toBeNull();

    const b = widgetSetup(() => json(200, readyState));
    b.fake.onInvoke = () => registered(TOKEN);
    await b.api.registerDevice();
    b.fake.onInvoke = () => ({ status: 200, body: { status: 'deleted' } });
    await b.api.deleteAccount();
    expect(await b.sealed.getItem(`widget_token.${UID}`)).toBeNull();
    expect(await b.api.getWidgetState('UTC').catch(() => 'threw')).not.toEqual(readyState);
  });
});
