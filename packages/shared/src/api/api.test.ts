import {
  WIDGET_API_ERRORS,
  WIDGET_TOKEN_RE,
  widgetApiAction,
  registerDeviceInput,
  registerDeviceResponse,
  widgetLogInput,
  widgetLogResponse,
  widgetStateQuery,
} from './index';

const log = {
  id: '6f1c2b2e-4a9f-4c3e-9d6b-0a1b2c3d4e5f',
  drinkId: 'coffee.flat_white',
  slot: 1,
  category: 'coffee',
  loggedAt: '2026-11-17T09:12:00Z',
};

describe('register-device', () => {
  it('defaults the action to register only when the caller adds it', () => {
    expect(
      registerDeviceInput.safeParse({
        action: 'register',
        installId: log.id,
        platform: 'android',
        appVersion: '1.0.0',
      }).success,
    ).toBe(true);
    expect(registerDeviceInput.safeParse({ action: 'register', installId: log.id }).success).toBe(
      false,
    );
  });

  it('refuses unknown fields such as a user id', () => {
    expect(
      registerDeviceInput.safeParse({
        action: 'signout',
        installId: log.id,
        userId: log.id,
      }).success,
    ).toBe(false);
  });

  it('describes the widget token as 43 base64url characters', () => {
    const token = 'A'.repeat(42) + '_';
    expect(WIDGET_TOKEN_RE.test(token)).toBe(true);
    expect(WIDGET_TOKEN_RE.test(token + '=')).toBe(false);
    expect(
      registerDeviceResponse.safeParse({
        status: 'registered',
        deviceId: log.id,
        widgetToken: token,
        inviteCode: 'ABCDEFGH',
        minIosBuild: 0,
        minAndroidBuild: 0,
      }).success,
    ).toBe(true);
  });
});

describe('widget-api state query', () => {
  it('takes instance and size together, or neither', () => {
    expect(widgetStateQuery.safeParse({}).success).toBe(true);
    expect(widgetStateQuery.safeParse({ instance: '17', size: 'small' }).success).toBe(true);
    expect(widgetStateQuery.safeParse({ instance: '17' }).success).toBe(false);
    expect(widgetStateQuery.safeParse({ size: 'medium' }).success).toBe(false);
  });

  it('refuses unknown keys and odd instance keys', () => {
    expect(widgetStateQuery.safeParse({ userId: log.id }).success).toBe(false);
    expect(widgetStateQuery.safeParse({ instance: 'a b', size: 'small' }).success).toBe(false);
    expect(widgetStateQuery.safeParse({ instance: 'x'.repeat(201), size: 'small' }).success).toBe(
      false,
    );
  });
});

describe('widget-api log', () => {
  it('accepts a catalog drink, a custom slot and water', () => {
    expect(widgetLogInput.safeParse(log).success).toBe(true);
    expect(
      widgetLogInput.safeParse({ ...log, drinkId: null, slot: 2, timeZone: 'Europe/London' })
        .success,
    ).toBe(true);
    expect(
      widgetLogInput.safeParse({ ...log, drinkId: 'water.still', slot: null, category: 'water' })
        .success,
    ).toBe(true);
  });

  it('refuses a log with neither drink nor slot, water with a slot, and no time zone in the time', () => {
    expect(widgetLogInput.safeParse({ ...log, drinkId: null, slot: null }).success).toBe(false);
    expect(
      widgetLogInput.safeParse({ ...log, drinkId: 'water.still', category: 'water', slot: 1 })
        .success,
    ).toBe(false);
    expect(widgetLogInput.safeParse({ ...log, loggedAt: '2026-11-17T09:12:00' }).success).toBe(
      false,
    );
    expect(widgetLogInput.safeParse({ ...log, id: 'not-a-uuid' }).success).toBe(false);
    expect(widgetLogInput.safeParse({ ...log, userId: log.id }).success).toBe(false);
    expect(widgetLogInput.safeParse({ ...log, drinkId: 'beer.lager' }).success).toBe(false);
  });

  it('answers with the status, the id and today', () => {
    expect(
      widgetLogResponse.safeParse({
        status: 'duplicate',
        id: log.id,
        today: {
          localDate: '2026-11-17',
          drinks: 1,
          water: 0,
          caffeinated: 1,
          lastDrinkAt: log.loggedAt,
        },
      }).success,
    ).toBe(true);
  });

  it('gives every error code a status and an outbox action', () => {
    for (const [code, e] of Object.entries(WIDGET_API_ERRORS)) {
      expect(code).toMatch(/^[a-z_]+$/);
      expect(e.status).toBeGreaterThanOrEqual(400);
      expect(['drop', 'retry', 'reauth']).toContain(e.then);
      expect(['retryable', 'malformed', 'stale']).toContain(e.kind);
    }
  });

  it('keeps every retryable code and drops only malformed or stale ones', () => {
    for (const e of Object.values(WIDGET_API_ERRORS)) {
      if (e.kind === 'retryable') expect(e.then).not.toBe('drop');
      else expect(e.then).toBe('drop');
    }
  });

  it('has no time-based code, so a log is never dropped for its loggedAt', () => {
    const codes = Object.keys(WIDGET_API_ERRORS);
    expect(codes).not.toContain('too_old');
    for (const c of codes) expect(c).not.toMatch(/old|future|time|late|early|clock/);
  });

  it('accepts a loggedAt hours ahead or months old: the server clamps it', () => {
    expect(widgetLogInput.safeParse({ ...log, loggedAt: '2099-01-01T00:00:00Z' }).success).toBe(
      true,
    );
    expect(
      widgetLogInput.safeParse({ ...log, loggedAt: '2020-01-01T00:00:00+02:00' }).success,
    ).toBe(true);
  });

  it('refuses impossible dates as malformed', () => {
    expect(widgetLogInput.safeParse({ ...log, loggedAt: '2026-02-30T09:12:00Z' }).success).toBe(
      false,
    );
    expect(widgetLogInput.safeParse({ ...log, loggedAt: '2026-11-17T25:00:00Z' }).success).toBe(
      false,
    );
  });

  it('tells the widget what to do by code, else by status', () => {
    expect(widgetApiAction(401, 'unauthorized')).toBe('reauth');
    expect(widgetApiAction(429, 'rate_limited')).toBe('retry');
    expect(widgetApiAction(409, 'usual_changed')).toBe('drop');
    expect(widgetApiAction(422, 'unknown_drink')).toBe('drop');
    // Unknown or missing codes fall back to the status rule, as the native ports do.
    expect(widgetApiAction(422, 'too_old')).toBe('drop');
    expect(widgetApiAction(503, null)).toBe('retry');
    expect(widgetApiAction(504)).toBe('retry');
    expect(widgetApiAction(408)).toBe('retry');
    expect(widgetApiAction(403)).toBe('retry');
    expect(widgetApiAction(401)).toBe('reauth');
    expect(widgetApiAction(400)).toBe('drop');
    expect(widgetApiAction(410, 'toString')).toBe('drop');
  });
});
