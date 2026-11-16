import { PRESETS } from '@clink/shared';

import { applyPreset, cleanDetails, custom, fromCatalog, move, toggleDrink } from './usual';

const ids = (l: { drinkId: string | null; customName: string | null }[]) =>
  l.map((u) => u.drinkId ?? u.customName);

describe('usual 3 rules (PRD 3.7, DESIGN.md 4.14)', () => {
  it('adds to the next free slot, and a second tap removes', () => {
    let list = toggleDrink([], fromCatalog('coffee.latte')).list;
    list = toggleDrink(list, fromCatalog('tea.jasmine')).list;
    expect(ids(list)).toEqual(['coffee.latte', 'tea.jasmine']);
    expect(ids(toggleDrink(list, fromCatalog('coffee.latte')).list)).toEqual(['tea.jasmine']);
  });

  it('a 4th pick replaces #3 and reports what it replaced', () => {
    const three = applyPreset(PRESETS[0]);
    const { list, replaced } = toggleDrink(three, fromCatalog('smoothie_juice.mango'));
    expect(ids(list)).toEqual(['coffee.flat_white', 'matcha.latte', 'smoothie_juice.mango']);
    expect(replaced?.drinkId).toBe('tea.jasmine');
  });

  it('water never takes a slot', () => {
    expect(() => fromCatalog('water.still')).toThrow();
  });

  it('custom drinks keep their name and category', () => {
    expect(custom('  Office brew ', 'tea')).toEqual({
      drinkId: null,
      customName: 'Office brew',
      category: 'tea',
      details: {},
    });
  });

  it('reorders (drag or Move up / Move down)', () => {
    const three = applyPreset(PRESETS[0]);
    expect(ids(move(three, 2, 0))).toEqual(['tea.jasmine', 'coffee.flat_white', 'matcha.latte']);
    expect(ids(move(three, 0, 9))).toEqual(['matcha.latte', 'tea.jasmine', 'coffee.flat_white']);
    expect(ids(move(three, 1, 1))).toEqual(ids(three));
  });

  it('every preset is three catalog drinks, #1 first', () => {
    for (const p of PRESETS) expect(applyPreset(p)).toHaveLength(3);
  });

  it('stores "nothing set" as {}', () => {
    expect(cleanDetails({ milk: undefined, extras: [], note: '  ', planB: ' Almond ' })).toEqual({
      planB: 'Almond',
    });
  });
});
