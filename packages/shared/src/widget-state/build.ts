// Builders for the widget state's derived text fields, shared by widget-api (which writes the
// state) and the app (which can patch it optimistically). Truncation follows COPY.md 0.2.
import {
  getDrink,
  hasDetails,
  isCaffeinated,
  orderSummary,
  type DrinkDetails,
  type FlareCategory,
  type LogCategory,
} from '../catalog';
import { charLength } from '../limits';

const ELLIPSIS = '…';

/** Cuts to `max` characters (code points): the first `max - 1` plus "…" when longer. */
export function truncateText(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max - 1).join('') + ELLIPSIS;
}

/** `{name}`: the first word of a display name, at most 12 characters (11 + "…"). */
export function widgetFirstName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? '';
  return truncateText(first === '' ? displayName.trim() : first, 12);
}

/** `me.initial`: the first character of the display name, upper-cased. */
export function widgetInitial(displayName: string): string {
  const first = Array.from(displayName.trim())[0] ?? '?';
  const upper = first.toLocaleUpperCase('en-US');
  return charLength(upper) <= 2 ? upper : first;
}

/** `{drink_short}`: the catalog widget name, or a custom name cut to 14 + "…". */
export function widgetDrinkShort(drinkId: string | null, customName: string | null): string {
  if (drinkId) {
    const d = getDrink(drinkId);
    if (d) return d.widgetName;
  }
  return truncateText(customName ?? '', 15);
}

/** The drink's name as the tracker stores it: catalog app name, or the custom name. */
export function drinkDisplayName(drinkId: string | null, customName: string | null): string {
  if (drinkId) {
    const d = getDrink(drinkId);
    if (d) return d.name;
  }
  return customName ?? '';
}

/** A `usual_drinks` row as the database returns it. */
export interface UsualRow {
  slot: number;
  drinkId: string | null;
  customName: string | null;
  category: FlareCategory;
  details: DrinkDetails;
}

/** One `usual[]` entry of the widget state (ARCHITECTURE.md 3.1). */
export function usualSlotFromRow(row: UsualRow) {
  return {
    slot: row.slot,
    drinkId: row.drinkId,
    category: row.category,
    name: drinkDisplayName(row.drinkId, row.customName),
    drinkShort: widgetDrinkShort(row.drinkId, row.customName),
    // Saved values come from the option sets, so this is short; the cap keeps a hand-edited row
    // inside the schema's 200 UTF-16 units (100 code points) instead of failing the state.
    summary: truncateText(orderSummary(row.category, row.details), 100),
    hasDetails: hasDetails(row.details),
  };
}

/** Caffeinated for a log made from the widget: catalog flag or category, unless the saved order is Decaf. */
export function logCaffeinated(
  drinkId: string | null,
  category: LogCategory,
  details: DrinkDetails = {},
): boolean {
  return drinkId ? isCaffeinated({ drinkId }, details) : isCaffeinated({ category }, details);
}

/**
 * The cached file name for a Storage path (`{owner}/{version}.jpg`): a prefix (`a` avatar,
 * `s` snap thumb, `fp` flare photo thumb) and the path with "/" turned into "_". The widget looks
 * files up by this name; it matches the widget state's file pattern.
 */
export function widgetFileName(prefix: 'a' | 's' | 'fp', storagePath: string): string {
  return `${prefix}_${storagePath.replaceAll('/', '_')}`;
}
