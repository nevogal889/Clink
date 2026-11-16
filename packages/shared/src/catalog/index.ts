// Drink catalog: ids (`category.slug`), names, categories, caffeine flags, option sets, presets.
// Data is generated from docs/COPY.md section 2 by scripts/gen-catalog.mjs (catalog.generated.ts).
// This file adds types and the rules that read it.
import { z } from 'zod';
import {
  CUSTOM_DRINK_WORDS,
  DRINKS,
  FLARE_CATEGORIES,
  FREE_TEXT_FIELDS,
  OPTION_SETS,
  PRESETS,
  SHARED_LISTS,
} from './catalog.generated';

export {
  CUSTOM_DRINK_WORDS,
  DRINKS,
  FLARE_CATEGORIES,
  FREE_TEXT_FIELDS,
  OPTION_SETS,
  PRESETS,
  SHARED_LISTS,
};

/** A flare category. Water is never one (DECISIONS.md). */
export type FlareCategory = (typeof FLARE_CATEGORIES)[number];
/** Every category a drink log can carry: the four flare categories plus water. */
export const LOG_CATEGORIES = [...FLARE_CATEGORIES, 'water'] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

export type Drink = (typeof DRINKS)[number];
export type DrinkId = Drink['id'];
export type FlareDrink = Extract<Drink, { category: FlareCategory }>;
export type FlareDrinkId = FlareDrink['id'];
export type WaterDrinkId = Extract<Drink, { category: 'water' }>['id'];

export type OptionField = (typeof OPTION_SETS)[FlareCategory][number];
export type OptionKey = OptionField['key'];

export const flareCategorySchema = z.enum(FLARE_CATEGORIES);
export const logCategorySchema = z.enum(LOG_CATEGORIES);

const DRINK_BY_ID = new Map<string, Drink>(DRINKS.map((d) => [d.id, d]));
export const DRINK_IDS = DRINKS.map((d) => d.id) as DrinkId[];
export const drinkIdSchema = z.enum(DRINK_IDS as [DrinkId, ...DrinkId[]]);
export const flareDrinkIdSchema = drinkIdSchema.refine((id) => !id.startsWith('water.'), {
  message: 'Water is never a flare drink or a usual 3 slot',
});

/** `water.still` is what the widget's water button logs (COPY.md 2.6, PRD 3.11 rule 8). */
export const WIDGET_WATER_ID: WaterDrinkId = 'water.still';

export function isFlareCategory(value: string): value is FlareCategory {
  return (FLARE_CATEGORIES as readonly string[]).includes(value);
}

export function getDrink(id: string): Drink | undefined {
  return DRINK_BY_ID.get(id);
}

export function drinksIn(category: LogCategory): Drink[] {
  return DRINKS.filter((d) => d.category === category);
}

/** Can this drink take a usual 3 slot or start a flare? Water never can. */
export function isFlareDrink(id: string): id is FlareDrinkId {
  const d = DRINK_BY_ID.get(id);
  return !!d && d.category !== 'water';
}

export function optionSet(category: FlareCategory): readonly OptionField[] {
  return OPTION_SETS[category];
}

/**
 * The editor's field split (PRD 3.7 rule 1): the drink's own Fields first, the rest of the
 * category's fields under "More options". A custom drink shows every field with no fold (rule 2).
 * Fields keep the category's order from COPY.md 2.7.
 */
export function editorFields(drink: { drinkId: string } | { category: FlareCategory }): {
  primary: OptionField[];
  more: OptionField[];
} {
  if ('drinkId' in drink) {
    const d = DRINK_BY_ID.get(drink.drinkId);
    if (!d || d.category === 'water') throw new Error(`No option set for ${drink.drinkId}`);
    const own = new Set<string>(d.fields);
    const all = OPTION_SETS[d.category] as readonly OptionField[];
    return { primary: all.filter((f) => own.has(f.key)), more: all.filter((f) => !own.has(f.key)) };
  }
  return { primary: [...OPTION_SETS[drink.category]], more: [] };
}

/** Values a field offers for one drink ("Tapioca pearls" only for Bubble Tea, PRD 3.7 rule 3). */
export function fieldValues(field: OptionField, drinkId: string | null): string[] {
  const onlyFor = field.onlyFor as Record<string, readonly string[]>;
  return (field.values as readonly string[]).filter((v) => {
    const allowed = onlyFor[v];
    return !allowed || (drinkId !== null && allowed.includes(drinkId));
  });
}

/** `usual_drinks.details`: option keys from COPY.md 2.7 plus Note and Plan B. */
export type DrinkDetails = Partial<Record<Exclude<OptionKey, 'extras'>, string>> & {
  extras?: string[];
  note?: string;
  planB?: string;
};

const FREE = Object.fromEntries(FREE_TEXT_FIELDS.map((f) => [f.key, f.max])) as Record<
  (typeof FREE_TEXT_FIELDS)[number]['key'],
  number
>;

/**
 * zod schema for one drink's details. Every field is optional (PRD 3.7 rule 4); values must
 * come from the category's option set; multi fields take an array; Note and Plan B are capped.
 */
export function detailsSchema(category: FlareCategory, drinkId: string | null = null) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of OPTION_SETS[category] as readonly OptionField[]) {
    const values = fieldValues(f, drinkId) as [string, ...string[]];
    const one = z.enum(values);
    shape[f.key] = (f.multi ? z.array(one).max(values.length) : one).optional();
  }
  shape.note = z.string().max(FREE.note).optional();
  shape.planB = z.string().max(FREE.planB).optional();
  return z.strictObject(shape);
}

/**
 * Does the Ice field show? COPY.md 2.7: when Temperature is Iced, or the drink is always iced.
 * Smoothie & Juice has no Temperature, so Ice always shows there. A picked Temperature wins.
 */
export function isIceVisible(
  drink: { drinkId: string } | { category: FlareCategory },
  details: DrinkDetails,
): boolean {
  const category =
    'drinkId' in drink ? (DRINK_BY_ID.get(drink.drinkId)?.category ?? null) : drink.category;
  if (!category || category === 'water') return false;
  const hasTemp = (OPTION_SETS[category] as readonly OptionField[]).some((f) => f.key === 'temp');
  if (!hasTemp) return true;
  if (details.temp) return details.temp === 'Iced';
  if ('drinkId' in drink) return DRINK_BY_ID.get(drink.drinkId)?.alwaysIced ?? false;
  return false;
}

/**
 * Caffeinated for the tracker (PRD 3.7, 3.11 rule 5): the catalog flag, except Caffeine = Decaf.
 * A custom drink counts when its category is coffee, matcha or tea (not herbal by definition).
 */
export function isCaffeinated(
  drink: { drinkId: string } | { category: LogCategory },
  details: DrinkDetails = {},
): boolean {
  if (details.caf === 'Decaf') return false;
  if ('drinkId' in drink) return DRINK_BY_ID.get(drink.drinkId)?.caffeine ?? false;
  return drink.category === 'coffee' || drink.category === 'matcha' || drink.category === 'tea';
}

/**
 * `{summary}` (COPY.md 4.9): up to three set values joined by " · " in field order, then
 * " · +{n}" for the rest. Multi-choice values count one each. Note and Plan B are not included.
 */
export function orderSummary(category: FlareCategory, details: DrinkDetails): string {
  const values: string[] = [];
  for (const f of OPTION_SETS[category] as readonly OptionField[]) {
    const v = (details as Record<string, string | string[] | undefined>)[f.key];
    if (Array.isArray(v)) values.push(...v);
    else if (v) values.push(v);
  }
  if (values.length <= 3) return values.join(' · ');
  return `${values.slice(0, 3).join(' · ')} · +${values.length - 3}`;
}

export function hasDetails(details: DrinkDetails): boolean {
  return Object.values(details).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
}

/** `{wants}` and `{cat}` words for a drink (COPY.md 0.2 and 2.5). */
export function drinkWords(drink: { drinkId: string } | { category: FlareCategory }): {
  wants: string;
  label: string;
} {
  if ('drinkId' in drink) {
    const d = DRINK_BY_ID.get(drink.drinkId);
    if (!d || d.wants === null || d.label === null) {
      throw new Error(`${drink.drinkId} is not a flare drink`);
    }
    return { wants: d.wants, label: d.label };
  }
  return CUSTOM_DRINK_WORDS[drink.category];
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Catalog search by app name, accent-insensitive ("acai" finds Açaí, COPY.md 2.5). */
export function searchDrinks(query: string, opts: { includeWater?: boolean } = {}): Drink[] {
  const q = fold(query.trim());
  return DRINKS.filter(
    (d) => (opts.includeWater || d.category !== 'water') && (q === '' || fold(d.name).includes(q)),
  );
}

export type Preset = (typeof PRESETS)[number];
