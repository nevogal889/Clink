// complete-signup (ARCHITECTURE.md 4.4, 5; PRD.md 3.1 rule 10; RISK_REVIEW.md M-05).
// Called once after a new identity signs in, before any profile exists.
//   old enough  -> profile, settings, private row (age_confirmed_at, min_age_version), first invite,
//                  Apple refresh token stored encrypted. 200 { status: 'created', inviteCode }
//   under age   -> the auth user is deleted, the Apple token revoked. 403 { error: 'under_age', min }
//   returning   -> 200 { status: 'exists' } with no age check (returning users never see it again)
// The birth month and year are compared and dropped. They are never stored or logged.
import { isOldEnough, todayUtc } from '../_shared/age.ts';
import { requireUser, signInMethod } from '../_shared/auth.ts';
import { asService } from '../_shared/db.ts';
import type { Deps } from '../_shared/deps.ts';
import { phoneHmac } from '../_shared/crypto.ts';
import { handle, type Handler, HttpError, json, readJson } from '../_shared/http.ts';
import { completeSignupInput } from '../_shared/schemas.ts';

export function completeSignup(deps: Deps): Handler {
  return handle(
    async (req) => {
      const claims = await requireUser(req, deps.verifier);
      const parsed = completeSignupInput.safeParse(await readJson(req));
      if (!parsed.success) throw new HttpError(400, 'bad_input');
      const input = parsed.data;
      const userId = claims.sub;
      const method = signInMethod(claims);

      const state = await asService(deps.sql, async (tx) => {
        const [row] = await tx<{ exists: boolean; min: { age: number; version: number } }[]>`
        select exists (select 1 from public.profiles p where p.id = ${userId}) as exists,
               (select c.value from public.app_config c where c.key = 'min_age') as min`;
        return row!;
      });
      if (state.exists) {
        const code = await asService(deps.sql, async (tx) => {
          const [r] = await tx<{ code: string }[]>`select private.ensure_invite(${userId}) as code`;
          return r!.code;
        });
        return json(200, { status: 'exists', inviteCode: code });
      }

      const min = state.min;
      if (
        !isOldEnough(
          { year: input.birthYear, month: input.birthMonth },
          todayUtc(deps.now()),
          min.age,
        )
      ) {
        // No account: revoke Apple first (a code exchanges for a token that is then revoked), then
        // delete the identity. The device keeps the refused screen for 24 h (app side).
        if (method === 'apple' && input.appleAuthorizationCode && deps.apple) {
          try {
            await deps.apple.revoke(await deps.apple.exchangeCode(input.appleAuthorizationCode));
          } catch (e) {
            console.error('apple_revoke_failed', (e as Error).message);
          }
        }
        await deps.admin.deleteUser(userId);
        return json(403, { error: 'under_age', min: min.age });
      }

      let appleSealed: Uint8Array | null = null;
      if (method === 'apple' && input.appleAuthorizationCode && deps.apple) {
        try {
          appleSealed = await deps.apple.sealToken(
            await deps.apple.exchangeCode(input.appleAuthorizationCode),
          );
        } catch (e) {
          // Sign-up still succeeds; deletion then revokes with a fresh code from the confirm step.
          console.error('apple_exchange_failed', (e as Error).message);
        }
      }
      const hmac =
        claims.phone && deps.phonePepper ? await phoneHmac(deps.phonePepper, claims.phone) : null;

      const result = await asService(deps.sql, async (tx) => {
        const [r] = await tx<{ j: { status: string; invite_code: string } }[]>`
        select private.complete_signup(${userId}, ${input.displayName}, ${min.version}::smallint,
                                       ${input.installId}, ${input.timezone}, ${method},
                                       ${hmac}, ${appleSealed}) as j`;
        return r!.j;
      });
      return json(200, { status: result.status, inviteCode: result.invite_code });
    },
    { cors: deps.corsOrigins },
  );
}
