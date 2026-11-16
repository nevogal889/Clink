import {
  DRINKS,
  FLARE_CATEGORIES,
  OPTION_SETS,
  PRESETS,
  detailsSchema,
  drinkWords,
  drinksIn,
  editorFields,
  fieldValues,
  flareDrinkIdSchema,
  getDrink,
  isCaffeinated,
  isFlareDrink,
  isIceVisible,
  optionSet,
  orderSummary,
  searchDrinks,
  WIDGET_WATER_ID,
} from './index';

describe('catalog shape (COPY.md 2, CEO guidelines 7 and 8)', () => {
  it('has exactly the four flare categories, Smoothie & Juice as smoothie_juice', () => {
    expect([...FLARE_CATEGORIES]).toEqual(['coffee', 'matcha', 'tea', 'smoothie_juice']);
  });

  it.each(FLARE_CATEGORIES)('has exactly 10 drinks in %s', (cat) => {
    expect(drinksIn(cat)).toHaveLength(10);
  });

  it('has 42 drinks: 40 plus 2 water (DESIGN.md 3.4 image count)', () => {
    expect(DRINKS).toHaveLength(42);
    expect(drinksIn('water').map((d) => d.id)).toEqual(['water.still', 'water.sparkling']);
  });

  it('has unique ids of the form category.slug matching the drink category', () => {
    const ids = DRINKS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DRINKS) {
      expect(d.id).toMatch(/^[a-z_]+\.[a-z0-9_]+$/);
      expect(d.id).toBe(`${d.category}.${d.slug}`);
    }
  });

  it('keeps names, descriptions and widget names inside COPY.md 2.1 limits', () => {
    for (const d of DRINKS) {
      expect(Array.from(d.name).length).toBeLessThanOrEqual(20);
      expect(Array.from(d.widgetName).length).toBeLessThanOrEqual(15);
      expect(d.description.split(/\s+/).length).toBeLessThanOrEqual(8);
    }
  });

  it('has unique app names and widget names', () => {
    const names = DRINKS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    const widget = DRINKS.map((d) => d.widgetName);
    expect(new Set(widget).size).toBe(widget.length);
  });
});

describe('water', () => {
  it('is never a flare type: no water category, no flare words, no option fields', () => {
    expect(FLARE_CATEGORIES as readonly string[]).not.toContain('water');
    for (const d of drinksIn('water')) {
      expect(d.wants).toBeNull();
      expect(d.label).toBeNull();
      expect(d.fields).toEqual([]);
      expect(d.caffeine).toBe(false);
      expect(isFlareDrink(d.id)).toBe(false);
    }
  });

  it('is rejected as a flare or usual 3 drink id', () => {
    expect(flareDrinkIdSchema.safeParse('water.still').success).toBe(false);
    expect(flareDrinkIdSchema.safeParse('coffee.cortado').success).toBe(true);
    expect(flareDrinkIdSchema.safeParse('coffee.frappuccino').success).toBe(false);
  });

  it('logs still water from the widget', () => {
    expect(WIDGET_WATER_ID).toBe('water.still');
  });
});

describe('fields and option sets (COPY.md 2.7, PRD 3.7)', () => {
  it('every field a drink references exists in its category option set', () => {
    for (const d of DRINKS) {
      if (d.category === 'water') continue;
      const keys = optionSet(d.category).map((f) => f.key as string);
      expect(d.fields.length).toBeGreaterThan(0);
      for (const f of d.fields) expect(keys).toContain(f);
    }
  });

  it('matches the PRD 3.7 field table per category', () => {
    const keys = (c: (typeof FLARE_CATEGORIES)[number]) => OPTION_SETS[c].map((f) => f.key);
    expect(keys('coffee')).toEqual([
      'size',
      'temp',
      'ice',
      'shots',
      'caf',
      'milk',
      'sweet',
      'extras',
    ]);
    expect(keys('matcha')).toEqual([
      'size',
      'temp',
      'ice',
      'milk',
      'sweet',
      'strength',
      'grade',
      'extras',
    ]);
    expect(keys('tea')).toEqual(['size', 'temp', 'ice', 'milk', 'sweet', 'strength', 'extras']);
    expect(keys('smoothie_juice')).toEqual(['size', 'base', 'ice', 'sweet', 'extras']);
  });

  it('marks only extras as multi-choice', () => {
    for (const c of FLARE_CATEGORIES) {
      for (const f of OPTION_SETS[c]) expect(f.multi).toBe(f.key === 'extras');
    }
  });

  it('labels Smoothie & Juice extras "Add-ins"', () => {
    expect(OPTION_SETS.smoothie_juice.find((f) => f.key === 'extras')?.label).toBe('Add-ins');
  });

  it('expands the shared lists and the coffee Caffeine field', () => {
    const coffee = OPTION_SETS.coffee;
    expect(coffee.find((f) => f.key === 'milk')?.values).toContain('Coconut milk');
    expect(coffee.find((f) => f.key === 'caf')?.values).toEqual([
      'Full caffeine',
      'Half-caf',
      'Decaf',
    ]);
    expect(coffee.find((f) => f.key === 'shots')?.values).toContain('Triple shot');
  });

  it('shows Tapioca pearls for Bubble Tea only', () => {
    const extras = OPTION_SETS.tea.find((f) => f.key === 'extras');
    if (!extras) throw new Error('tea extras missing');
    expect(fieldValues(extras, 'tea.bubble')).toContain('Tapioca pearls');
    expect(fieldValues(extras, 'tea.green')).not.toContain('Tapioca pearls');
    expect(fieldValues(extras, null)).not.toContain('Tapioca pearls');
  });

  it('"All coffee fields" expands to the whole set', () => {
    expect(getDrink('coffee.latte')?.fields).toEqual(OPTION_SETS.coffee.map((f) => f.key));
  });

  it('splits the editor into own fields and More options; custom drinks get no fold', () => {
    const cortado = editorFields({ drinkId: 'coffee.cortado' });
    expect(cortado.primary.map((f) => f.key)).toEqual(['temp', 'shots', 'caf', 'milk', 'sweet']);
    expect(cortado.more.map((f) => f.key)).toEqual(['size', 'ice', 'extras']);
    const custom = editorFields({ category: 'tea' });
    expect(custom.more).toEqual([]);
    expect(custom.primary).toHaveLength(OPTION_SETS.tea.length);
    expect(() => editorFields({ drinkId: 'water.still' })).toThrow();
  });
});

describe('details schema', () => {
  const coffee = detailsSchema('coffee', 'coffee.flat_white');

  it('accepts empty details and valid values', () => {
    expect(coffee.safeParse({}).success).toBe(true);
    expect(
      coffee.safeParse({ milk: 'Oat milk', caf: 'Decaf', extras: ['Cold foam'], note: 'Very hot' })
        .success,
    ).toBe(true);
  });

  it('rejects unknown keys, values from another category and over-long notes', () => {
    expect(coffee.safeParse({ grade: 'Ceremonial grade' }).success).toBe(false);
    expect(coffee.safeParse({ milk: 'Splash of milk' }).success).toBe(false);
    expect(coffee.safeParse({ extras: 'Cold foam' }).success).toBe(false);
    expect(coffee.safeParse({ note: 'x'.repeat(121) }).success).toBe(false);
    expect(coffee.safeParse({ planB: 'x'.repeat(81) }).success).toBe(false);
    expect(coffee.safeParse({ note: 'x'.repeat(120), planB: 'y'.repeat(80) }).success).toBe(true);
  });

  it('rejects Tapioca pearls on a tea that is not Bubble Tea', () => {
    expect(
      detailsSchema('tea', 'tea.bubble').safeParse({ extras: ['Tapioca pearls'] }).success,
    ).toBe(true);
    expect(
      detailsSchema('tea', 'tea.green').safeParse({ extras: ['Tapioca pearls'] }).success,
    ).toBe(false);
  });
});

describe('rules that read the catalog', () => {
  it('counts caffeine from the flag, except Decaf (PRD 3.11 rule 5)', () => {
    expect(isCaffeinated({ drinkId: 'coffee.latte' })).toBe(true);
    expect(isCaffeinated({ drinkId: 'coffee.latte' }, { caf: 'Decaf' })).toBe(false);
    expect(isCaffeinated({ drinkId: 'coffee.latte' }, { caf: 'Half-caf' })).toBe(true);
    expect(isCaffeinated({ drinkId: 'matcha.hojicha' })).toBe(true);
    expect(isCaffeinated({ drinkId: 'tea.chamomile' })).toBe(false);
    expect(isCaffeinated({ drinkId: 'smoothie_juice.berry' })).toBe(false);
    expect(isCaffeinated({ drinkId: 'water.still' })).toBe(false);
    expect(isCaffeinated({ category: 'tea' })).toBe(true);
    expect(isCaffeinated({ category: 'smoothie_juice' })).toBe(false);
  });

  it('herbal teas are exactly Peppermint, Chamomile and Ginger & Lemon', () => {
    expect(
      drinksIn('tea')
        .filter((d) => !d.caffeine)
        .map((d) => d.name),
    ).toEqual(['Peppermint', 'Chamomile', 'Ginger & Lemon']);
  });

  it('shows Ice when Iced, for always-iced drinks, and always for Smoothie & Juice', () => {
    expect(isIceVisible({ drinkId: 'coffee.latte' }, {})).toBe(false);
    expect(isIceVisible({ drinkId: 'coffee.latte' }, { temp: 'Iced' })).toBe(true);
    expect(isIceVisible({ drinkId: 'coffee.cold_brew' }, {})).toBe(true);
    expect(isIceVisible({ drinkId: 'matcha.tonic' }, {})).toBe(true);
    expect(isIceVisible({ drinkId: 'tea.bubble' }, { temp: 'Hot' })).toBe(false);
    expect(isIceVisible({ drinkId: 'smoothie_juice.mango' }, {})).toBe(true);
    expect(isIceVisible({ category: 'coffee' }, {})).toBe(false);
    const alwaysIced = DRINKS.filter((d) => d.alwaysIced).map((d) => d.id);
    expect(alwaysIced).toEqual([
      'coffee.cold_brew',
      'matcha.coconut',
      'matcha.lemonade',
      'matcha.tonic',
      'tea.bubble',
    ]);
  });

  it('builds {summary}: three values in field order, then +n', () => {
    expect(orderSummary('coffee', {})).toBe('');
    expect(
      orderSummary('coffee', { milk: 'Oat milk', temp: 'Extra hot', shots: 'Double shot' }),
    ).toBe('Extra hot · Double shot · Oat milk');
    expect(
      orderSummary('coffee', {
        size: 'Large',
        milk: 'Oat milk',
        temp: 'Iced',
        extras: ['Vanilla syrup', 'Cold foam'],
        note: 'not counted',
      }),
    ).toBe('Large · Iced · Oat milk · +2');
  });

  it('gives {wants} and {cat} words, with "a drink" for a custom Smoothie & Juice', () => {
    expect(drinkWords({ drinkId: 'coffee.cortado' })).toEqual({ wants: 'coffee', label: 'coffee' });
    expect(drinkWords({ drinkId: 'smoothie_juice.berry' })).toEqual({
      wants: 'a smoothie',
      label: 'smoothie',
    });
    expect(drinkWords({ drinkId: 'smoothie_juice.lemonade' })).toEqual({
      wants: 'lemonade',
      label: 'lemonade',
    });
    expect(drinkWords({ category: 'smoothie_juice' })).toEqual({
      wants: 'a drink',
      label: 'drink',
    });
    expect(drinkWords({ category: 'matcha' })).toEqual({ wants: 'matcha', label: 'matcha' });
  });

  it('keeps {wants} and {cat} inside their 10 character budget (COPY.md 0.2)', () => {
    for (const d of DRINKS) {
      if (d.wants) expect(d.wants.length).toBeLessThanOrEqual(10);
      if (d.label) expect(d.label.length).toBeLessThanOrEqual(10);
    }
  });

  it('searches without accents ("acai" finds Açaí Smoothie) and leaves water out', () => {
    expect(searchDrinks('acai').map((d) => d.id)).toEqual(['smoothie_juice.acai']);
    expect(searchDrinks('water').map((d) => d.id)).toEqual(['smoothie_juice.watermelon']);
    expect(searchDrinks('water', { includeWater: true }).map((d) => d.id)).toContain('water.still');
  });
});

describe('presets (COPY.md 2.8)', () => {
  it('has four presets of three flare drinks each', () => {
    expect(PRESETS.map((p) => p.key)).toEqual([
      'preset.mix',
      'preset.coffee',
      'preset.matcha',
      'preset.tea',
    ]);
    for (const p of PRESETS) {
      expect(p.drinkIds).toHaveLength(3);
      for (const id of p.drinkIds) expect(isFlareDrink(id)).toBe(true);
    }
    expect(PRESETS[0]?.drinkIds).toEqual(['coffee.flat_white', 'matcha.latte', 'tea.jasmine']);
  });
});
