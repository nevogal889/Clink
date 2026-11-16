// register-device (ARCHITECTURE.md 3.6, 4.4, 5 S-04). Every launch, and on sign-out.
//   register -> device upserted (a push token from another account moves), time zone applied at
//               most once per 24 h, widget token rotated, invite code renewed when due, other
//               devices told about a new install. 200 { deviceId, widgetToken, inviteCode, min builds }
//   signout  -> the device row, its widget credentials and Live Activity tokens are deleted.
import { requireUser, signInMethod } from '../_shared/auth.ts';
import { asService } from '../_shared/db.ts';
import type { Deps } from '../_shared/deps.ts';
import { base64url, randomToken, sha256 } from '../_shared/crypto.ts';
import { handle, type Handler, HttpError, json, readJson } from '../_shared/http.ts';
import type { PushTarget } from '../_shared/push.ts';
import { registerDeviceInput } from '../_shared/schemas.ts';

type Registered = {
  device_id: string;
  new_install: boolean;
  notify_devices: PushTarget[];
  invite_code: string;
  min_ios_build: number;
  min_android_build: number;
};

export function registerDevice(deps: Deps): Handler {
  return handle(async (req) => {
    const claims = await requireUser(req, deps.verifier);
    const body = (await readJson(req)) as Record<string, unknown>;
    const parsed = registerDeviceInput.safeParse({ action: 'register', ...body });
    if (!parsed.success) throw new HttpError(400, 'bad_input');
    const input = parsed.data;
    const userId = claims.sub;

    if (input.action === 'signout') {
      const removed = await asService(deps.sql, async (tx) => {
        const [r] = await tx<
          { ok: boolean }[]
        >`select private.signout_device(${userId}, ${input.installId}) as ok`;
        return r!.ok;
      });
      return json(200, { status: 'signed_out', removed });
    }

    if (
      input.platform === 'android' &&
      (input.apnsEnv || input.laPushToStartToken || input.widgetPushToken)
    ) {
      throw new HttpError(400, 'bad_input');
    }
    // A fresh 256-bit widget token every launch; only its hash is stored (private.widget_credentials).
    const widgetToken = randomToken(32);
    const widgetHash = await sha256(widgetToken);

    const r = await asService(deps.sql, async (tx) => {
      const [row] = await tx<{ j: Registered }[]>`
        select private.register_device(
          ${userId}, ${input.platform}, ${input.installId}, ${input.appVersion}, ${input.pushToken ?? null},
          ${input.apnsEnv ?? null}, ${input.locale ?? null}, ${
            input.timezone ?? null
          }, ${input.notifPermission},
          ${input.laPushToStartToken ?? null}, ${input.widgetPushToken ?? null}, ${widgetHash},
          ${signInMethod(claims)}) as j`;
      return row!.j;
    });

    if (r.new_install && r.notify_devices.length > 0) {
      await deps.push.send(r.notify_devices, { type: 'new_signin' });
    }
    return json(200, {
      status: 'registered',
      deviceId: r.device_id,
      widgetToken: base64url(widgetToken),
      inviteCode: r.invite_code,
      minIosBuild: r.min_ios_build,
      minAndroidBuild: r.min_android_build,
    });
  });
}
