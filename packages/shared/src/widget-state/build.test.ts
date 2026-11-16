import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  drinkDisplayName,
  logCaffeinated,
  truncateText,
  usualSlotFromRow,
  usualSlotSchema,
  widgetDrinkShort,
  widgetFileName,
  widgetFirstName,
  widgetInitial,
} from './index';

describe('widget text builders (COPY.md 0.2)', () => {
  it('cuts by code points with one ellipsis character', () => {
    expect(truncateText('Flat White', 15)).toBe('Flat White');
    expect(truncateText('Grandma special blend', 15)).toBe('Grandma specia…');
    expect(Array.from(truncateText('Grandma special blend', 15))).toHaveLength(15);
    expect(truncateText('😀😀😀', 2)).toBe('😀…');
  });

  it('uses the first word of a display name, at most 12 characters', () => {
    expect(widgetFirstName('Maya Cohen')).toBe('Maya');
    expect(widgetFirstName('  Leo  ')).toBe('Leo');
    expect(widgetFirstName('Bartholomew-Alexander Smith')).toBe('Bartholomew…');
  });

  it('takes the initial from the display name', () => {
    expect(widgetInitial('dana')).toBe('D');
    expect(widgetInitial(' émile')).toBe('É');
  });

  it('uses the catalog widget name, or a cut custom name', () => {
    expect(widgetDrinkShort('matcha.ceremonial', null)).toBe('Ceremonial');
    expect(widgetDrinkShort(null, 'Grandma special blend')).toBe('Grandma specia…');
    expect(drinkDisplayName('matcha.ceremonial', null)).toBe('Ceremonial Matcha');
    expect(drinkDisplayName(null, 'My brew')).toBe('My brew');
  });

  it('builds a usual slot that the widget-state schema accepts', () => {
    const slot = usualSlotFromRow({
      slot: 1,
      drinkId: 'coffee.flat_white',
      customName: null,
      category: 'coffee',
      details: { temp: 'Iced', milk: 'Oat milk', shots: 'Double shot' },
    });
    expect(slot).toEqual({
      slot: 1,
      drinkId: 'coffee.flat_white',
      category: 'coffee',
      name: 'Flat White',
      drinkShort: 'Flat White',
      summary: 'Iced · Double shot · Oat milk',
      hasDetails: true,
    });
    expect(usualSlotSchema.safeParse(slot).success).toBe(true);
    const custom = usualSlotFromRow({
      slot: 2,
      drinkId: null,
      customName: 'Grandma special blend',
      category: 'tea',
      details: {},
    });
    expect(custom).toMatchObject({ name: 'Grandma special blend', summary: '', hasDetails: false });
    expect(usualSlotSchema.safeParse(custom).success).toBe(true);
    const odd = usualSlotFromRow({
      slot: 3,
      drinkId: null,
      customName: 'Mine',
      category: 'coffee',
      details: { milk: 'x'.repeat(500) },
    });
    expect(usualSlotSchema.safeParse(odd).success).toBe(true);
  });

  it('matches the fixtures: every usual slot rebuilds to the same name and short name', () => {
    const dir = path.join(__dirname, '../../fixtures/widget-states');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const fx = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
      for (const u of fx.state.usual ?? []) {
        if (!u.drinkId) continue;
        expect(drinkDisplayName(u.drinkId, null)).toBe(u.name);
        expect(widgetDrinkShort(u.drinkId, null)).toBe(u.drinkShort);
      }
    }
  });

  it('counts caffeine from the catalog unless the saved order is Decaf', () => {
    expect(logCaffeinated('coffee.flat_white', 'coffee')).toBe(true);
    expect(logCaffeinated('coffee.flat_white', 'coffee', { caf: 'Decaf' })).toBe(false);
    expect(logCaffeinated('tea.chamomile', 'tea')).toBe(false);
    expect(logCaffeinated('water.still', 'water')).toBe(false);
    expect(logCaffeinated(null, 'matcha')).toBe(true);
    expect(logCaffeinated(null, 'smoothie_juice')).toBe(false);
  });

  it('names cached files so the widget-state pattern accepts them', () => {
    const name = widgetFileName(
      's',
      '6f1c2b2e-4a9f-4c3e-9d6b-0a1b2c3d4e5f/0b1c2b2e-4a9f-4c3e-9d6b-0a1b2c3d4e5f_t.jpg',
    );
    expect(name).toMatch(/^[a-z]{1,3}_[A-Za-z0-9._-]{1,120}$/);
    expect(name.startsWith('s_6f1c2b2e')).toBe(true);
  });
});
