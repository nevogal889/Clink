// widget-api (ARCHITECTURE.md 3, 4.4; PRD.md 3.3, 3.11, 3.20). Called by the widgets, and by the
// app for the same state. Auth is the widget token only (../_shared/widget-auth.ts); reads run as
// the user (RLS), writes as service_role through private functions (migration 0019).
//
//   GET  /widget-api/state?instance=&size=&audience=&tz=
//        200 the widget state JSON (packages/shared/src/widget-state, validated before it leaves).
//        A new instance records widget_added once (3.5).
//   POST /widget-api/log   { id, drinkId, slot, category, loggedAt, timeZone? }
//        200 { status: 'logged' | 'duplicate', id, today }. Idempotent on the device-made id.
//        loggedAt is clamped, never refused: later than server now becomes now, older than the
//        90-day tracker window becomes its oldest edge (migration 0020).
//
// Errors are `{ error: code }` (plus retryAfter on 429); the codes and what the widget does with
// each are WIDGET_API_ERRORS in packages/shared/src/api.
import { asService, asUser } from '../_shared/db.ts';
import type { Deps } from '../_shared/deps.ts';
import { handle, type Handler, HttpError, json, readJson } from '../_shared/http.ts';
import { getDrink } from '../_shared/shared/catalog/index.ts';
import { widgetLogInput, widgetStateQuery } from '../_shared/shared/api/index.ts';
import {
  drinkDisplayName,
  localDateAt,
  logCaffeinated,
} from '../_shared/shared/widget-state/index.ts';
import { requireWidgetCaller, type WidgetCaller } from '../_shared/widget-auth.ts';
import { buildState, pickZone, readContext, readToday, readUsual } from './state.ts';

const NO_STORE = { 'cache-control': 'no-store' };

function route(req: Request): 'state' | 'log' | null {
  const last = new URL(req.url).pathname.replace(/\/+$/, '').split('/').pop();
  return last === 'state' || last === 'log' ? last : null;
}

async function getState(deps: Deps, req: Request, caller: WidgetCaller): Promise<Response> {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = widgetStateQuery.safeParse(params);
  if (!parsed.success) throw new HttpError(400, 'bad_input');
  const q = parsed.data;

  if (q.instance && q.size) {
    const audience = q.size === 'medium' ? (q.audience ?? 'auto') : null;
    await asService(
      deps.sql,
      (tx) =>
        tx`select private.widget_record_instance(${caller.userId}, ${caller.deviceId}, ${q.instance!},
                                               ${q.size!}, ${audience})`,
    );
  }
  const state = await asUser(deps.sql, caller.userId, (tx) => buildState(tx, caller.userId, q.tz));
  return json(200, state, NO_STORE);
}

async function postLog(deps: Deps, req: Request, caller: WidgetCaller): Promise<Response> {
  const parsed = widgetLogInput.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'bad_input');
  const b = parsed.data;

  // Catalog drinks and water must exist and match their category. Water never has a slot.
  if (b.drinkId !== null) {
    const drink = getDrink(b.drinkId);
    if (!drink) throw new HttpError(422, 'unknown_drink');
    if (drink.category !== b.category) throw new HttpError(400, 'bad_input');
  }

  // The caller's own usual 3 and zone, read as the caller.
  const { ctx, usual } = await asUser(deps.sql, caller.userId, async (tx) => ({
    ctx: await readContext(tx, caller.userId),
    usual: b.slot === null ? [] : await readUsual(tx, caller.userId),
  }));
  if (!ctx) throw new HttpError(401, 'unauthorized');
  const slot = b.slot === null ? undefined : usual.find((u) => u.slot === b.slot);

  let name: string;
  let caffeinated: boolean;
  if (b.drinkId !== null) {
    // A catalog drink picked from a usual slot keeps that slot's Decaf; otherwise the catalog flag.
    const details = slot && slot.drink_id === b.drinkId ? (slot.details ?? {}) : {};
    name = drinkDisplayName(b.drinkId, null);
    caffeinated = logCaffeinated(b.drinkId, b.category, details);
  } else {
    // A custom drink exists only in its usual slot. If the slot changed since the tap, the log
    // can't be named and is refused for good (the widget drops it).
    if (!slot || slot.drink_id !== null || !slot.custom_name || slot.category !== b.category) {
      throw new HttpError(409, 'usual_changed');
    }
    name = slot.custom_name;
    caffeinated = logCaffeinated(null, b.category, slot.details ?? {});
  }

  // The server owns time (ARCHITECTURE.md 3.2 "Log time"): widget_log_drink clamps loggedAt into
  // the 90-day window ending at server now and works out the local date in this zone. A
  // well-formed log is never refused for its time.
  const zone = pickZone(b.timeZone, ctx.timezone);
  const loggedAt = new Date(b.loggedAt);
  if (Number.isNaN(loggedAt.getTime())) throw new HttpError(400, 'bad_input');
  const status = await asService(deps.sql, async (tx) => {
    const [r] = await tx<{ status: 'logged' | 'duplicate' }[]>`
      select private.widget_log_drink(${caller.userId}, ${b.id}, ${b.drinkId}, ${name}, ${b.category},
                                      ${caffeinated}, ${loggedAt}, ${zone}::text) as status`;
    return r!.status;
  });

  const today = await asUser(deps.sql, caller.userId, async (tx) => {
    const c = await readContext(tx, caller.userId);
    return readToday(tx, caller.userId, localDateAt(new Date(c?.now ?? Date.now()), zone));
  });
  return json(200, { status, id: b.id, today }, NO_STORE);
}

export function widgetApi(deps: Deps): Handler {
  return handle(async (req) => {
    const which = route(req);
    if (!which) throw new HttpError(404, 'not_found');
    const method = which === 'state' ? 'GET' : 'POST';
    if (req.method !== method) throw new HttpError(405, 'method_not_allowed');
    // Auth comes first: a stranger gets 401 before any body is read.
    const caller = await requireWidgetCaller(req, deps.sql);
    return which === 'state' ? await getState(deps, req, caller) : await postLog(deps, req, caller);
  });
}
