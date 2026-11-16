import {
  WIDGET_API_ERRORS,
  WIDGET_TOKEN_RE,
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
    }
  });
});
