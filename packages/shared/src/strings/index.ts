// String table generated from docs/COPY.md keys by scripts/gen-strings.mjs (table.generated.ts).
// Never type user-facing text anywhere else: call t(key, vars).
import { formatIcu, parseIcu, type IcuNode, type IcuVars } from './icu';
import {
  STRINGS,
  VARIABLE_BUDGETS,
  WIDGET_BUDGETS,
  type StringKey,
  type StringParams,
} from './table.generated';

export {
  BANNED_TERMS,
  LEVEL_STRING_KEYS,
  NOTIFICATIONS,
  STRINGS,
  STRING_META,
  STRING_REFERENCES,
  VARIABLE_BUDGETS,
  WIDGET_BUDGETS,
} from './table.generated';
export type { StringKey, StringParams } from './table.generated';
export { argNames, formatIcu, parseIcu, pluralCategory } from './icu';
export type { IcuNode, IcuVars } from './icu';

const parsed = new Map<StringKey, IcuNode[]>();

function nodesFor(key: StringKey): IcuNode[] {
  let nodes = parsed.get(key);
  if (!nodes) {
    const text: string | undefined = STRINGS[key];
    if (text === undefined) throw new Error(`Unknown string key: ${String(key)}`);
    nodes = parseIcu(text);
    parsed.set(key, nodes);
  }
  return nodes;
}

type VarsArg<K extends StringKey> =
  StringParams[K] extends Record<string, never> ? [] : [vars: StringParams[K]];

/**
 * Renders a COPY.md string. Variables are required exactly when the string has placeholders.
 * An empty plural branch ("=0 {}") would leave a double space; runs of spaces are collapsed.
 */
export function t<K extends StringKey>(key: K, ...args: VarsArg<K>): string {
  const vars = (args[0] ?? {}) as IcuVars;
  return formatIcu(nodesFor(key), vars).replace(/ {2,}/g, ' ').trim();
}

export function isStringKey(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}

/**
 * Cuts a value to its COPY.md 0.2 budget: budget - 1 characters plus "…" ("Truncate to 11 +
 * '…'"). Counts code points, so a surrogate pair is never split.
 */
export function truncateTo(value: string, budget: number): string {
  const chars = Array.from(value);
  if (chars.length <= budget) return value;
  return `${chars
    .slice(0, Math.max(0, budget - 1))
    .join('')
    .trimEnd()}…`;
}

/** Truncates a variable to its COPY.md 0.2 budget (notifications). */
export function truncateVar(name: keyof typeof VARIABLE_BUDGETS, value: string): string {
  const budget: number | null = VARIABLE_BUDGETS[name].budget;
  return budget == null ? value : truncateTo(value, budget);
}

/** Truncates a variable to its COPY.md 6 widget budget. */
export function truncateWidgetVar(name: keyof typeof WIDGET_BUDGETS, value: string): string {
  return truncateTo(value, WIDGET_BUDGETS[name]);
}

/** The first word of a display name: the `{name}` variable (COPY.md 0.2). */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? '';
}
