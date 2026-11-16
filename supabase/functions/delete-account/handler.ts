// delete-account (ARCHITECTURE.md 4.7; PRD.md 3.19; RISK_REVIEW.md M-09, M-10). App and web page.
// Every step is idempotent, so a retry finishes the job.
//   1. fresh session: signed in within 10 minutes, or a fresh Sign in with Apple code from the confirm step
//   2. database: end live flares, reverse recent invite XP, revoke widget tokens, delete devices
//      (private.prepare_account_deletion), which also lists files and friends' devices
//   3. Apple token revoked (fresh code, else the stored encrypted refresh token)
//   4. clear messages to friends' devices, so the user leaves their widgets now
//   5. files deleted through the Storage API
//   6. auth.admin.deleteUser: every table cascades from auth.users through profiles
//   7. audit log rows naming the user deleted
import { isFreshSession, requireUser } from '../_shared/auth.ts';
import { asService } from '../_shared/db.ts';
import type { Deps } from '../_shared/deps.ts';
import { fromBase64 } from '../_shared/crypto.ts';
import { handle, type Handler, HttpError, json, readJson } from '../_shared/http.ts';
import type { PushTarget } from '../_shared/push.ts';
import { deleteAccountInput } from '../_shared/schemas.ts';

type Prepared = {
  status: 'ready' | 'no_profile';
  clear_devices: PushTarget[];
  objects: { bucket: string; name: string }[];
  apple_refresh_token_enc: string | null;
};

export function deleteAccount(deps: Deps): Handler {
  return handle(
    async (req) => {
      const claims = await requireUser(req, deps.verifier);
      const parsed = deleteAccountInput.safeParse(await readJson(req));
      if (!parsed.success) throw new HttpError(400, 'bad_input');
      const userId = claims.sub;

      // 1. Fresh session, or a fresh Apple code (which also gives a token to revoke).
      let freshAppleToken: string | null = null;
      if (parsed.data.appleAuthorizationCode && deps.apple) {
        try {
          freshAppleToken = await deps.apple.exchangeCode(parsed.data.appleAuthorizationCode);
        } catch {
          throw new HttpError(401, 'reauth_required');
        }
      }
      if (!freshAppleToken && !isFreshSession(claims, Math.floor(deps.now().getTime() / 1000))) {
        throw new HttpError(401, 'reauth_required');
      }

      // 2. Database half.
      const prep = await asService(deps.sql, async (tx) => {
        const [r] = await tx<
          { j: Prepared }[]
        >`select private.prepare_account_deletion(${userId}) as j`;
        return r!.j;
      });

      // 3. Apple. A failure here doesn't stop deletion; support finishes it within 30 days (M-10).
      if (deps.apple) {
        try {
          if (freshAppleToken) {
            await deps.apple.revoke(freshAppleToken);
          } else if (prep.apple_refresh_token_enc) {
            await deps.apple.revoke(
              await deps.apple.openToken(fromBase64(prep.apple_refresh_token_enc)),
            );
          }
        } catch (e) {
          console.error('apple_revoke_failed', (e as Error).message);
        }
      }

      // 4. Friends' widgets drop this user's photo, snaps and flares now (3.3).
      if (prep.clear_devices.length > 0) {
        await deps.push.send(prep.clear_devices, { type: 'clear_user', userId });
      }

      // 5. Files, grouped by bucket.
      const byBucket = new Map<string, string[]>();
      for (const o of prep.objects)
        byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.name]);
      for (const [bucket, names] of byBucket) await deps.storage.remove(bucket, names);

      // 6 and 7.
      await deps.admin.deleteUser(userId);
      await asService(deps.sql, async (tx) => {
        await tx`select private.purge_auth_audit(${userId})`;
      });
      return json(200, { status: 'deleted' });
    },
    { cors: deps.corsOrigins },
  );
}
