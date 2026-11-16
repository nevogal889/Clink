// Usual 3 rules (PRD 3.7, DESIGN.md 4.14): up to three drinks in order, #1 on the widget, a 4th
// pick replaces #3, water never takes a slot. Pure functions, so the editor and tests share them.
import {
  CAPS,
  PRESETS,
  getDrink,
  isFlareDrink,
  type DrinkDetails,
  type FlareCategory,
  type Preset,
} from '@clink/shared';

import type { UsualDrink } from './api';

export function fromCatalog(drinkId: string): UsualDrink {
  if (!isFlareDrink(drinkId)) throw new Error('Water never takes a usual 3 slot');
  const d = getDrink(drinkId);
  return { drinkId, customName: null, category: d?.category as FlareCategory, details: {} };
}

export function custom(name: string, category: FlareCategory): UsualDrink {
  return { drinkId: null, customName: name.trim(), category, details: {} };
}

export function slotOf(list: readonly UsualDrink[], drinkId: string): number {
  return list.findIndex((u) => u.drinkId === drinkId);
}

/**
 * Adds a drink to the next free slot. A drink already picked is removed instead (a second tap
 * undoes the first). With three picked, the new drink replaces #3.
 */
export function toggleDrink(
  list: readonly UsualDrink[],
  drink: UsualDrink,
): { list: UsualDrink[]; replaced: UsualDrink | null } {
  if (drink.drinkId) {
    const at = slotOf(list, drink.drinkId);
    if (at >= 0) return { list: list.filter((_, i) => i !== at), replaced: null };
  }
  if (list.length < CAPS.usualDrinks) return { list: [...list, drink], replaced: null };
  const replaced = list[CAPS.usualDrinks - 1] ?? null;
  return { list: [...list.slice(0, CAPS.usualDrinks - 1), drink], replaced };
}

export function applyPreset(preset: Preset): UsualDrink[] {
  return preset.drinkIds.map((id) => fromCatalog(id));
}

export function presetByKey(key: string): Preset | undefined {
  return PRESETS.find((p) => p.key === key);
}

export function move(list: readonly UsualDrink[], from: number, to: number): UsualDrink[] {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const target = Math.max(0, Math.min(list.length - 1, to));
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item) next.splice(target, 0, item);
  return next;
}

export function withDetails(list: readonly UsualDrink[], index: number, details: DrinkDetails): UsualDrink[] {
  return list.map((u, i) => (i === index ? { ...u, details: cleanDetails(details) } : u));
}

/** Drops empty values so "nothing set" is stored as {} (every field is optional). */
export function cleanDetails(details: DrinkDetails): DrinkDetails {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (Array.isArray(v)) {
      if (v.length) out[k] = v;
    } else if (typeof v === 'string') {
      if (k === 'note' || k === 'planB' ? v.trim() : v) out[k] = k === 'note' || k === 'planB' ? v.trim() : v;
    }
  }
  return out as DrinkDetails;
}
