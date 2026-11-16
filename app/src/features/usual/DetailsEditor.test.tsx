import {
  TEXT_LIMITS,
  editorFields,
  orderSummary,
  t,
  type DrinkDetails,
  type OptionField,
} from '@clink/shared';
import { fireEvent, screen } from '@testing-library/react-native';

import type { UsualDrink } from '@/lib/api';
import { renderWithData } from '@/test/render';

import { DetailsEditor, detailsToSave, toggleValue } from './DetailsEditor';

const flatWhite: UsualDrink = {
  drinkId: 'coffee.flat_white',
  customName: null,
  category: 'coffee',
  details: {},
};
const field = (key: string, drinkId = 'coffee.flat_white'): OptionField => {
  const f = [...editorFields({ drinkId }).primary, ...editorFields({ drinkId }).more].find(
    (x) => x.key === key,
  );
  if (!f) throw new Error(key);
  return f;
};

async function openEditor(drink: UsualDrink = flatWhite) {
  const onClose = jest.fn<void, [DrinkDetails]>();
  await renderWithData(<DetailsEditor drink={drink} visible onClose={onClose} />);
  return onClose;
}

describe('toggleValue', () => {
  it('single choice: tap selects, tapping the selected value clears it', () => {
    const milk = field('milk');
    const on = toggleValue({}, milk, 'Oat milk');
    expect(on.milk).toBe('Oat milk');
    expect(toggleValue(on, milk, 'Oat milk').milk).toBeUndefined();
    expect(toggleValue(on, milk, 'Soy milk').milk).toBe('Soy milk');
  });

  it('"any" fields toggle each value', () => {
    const extras = field('extras');
    expect(extras.multi).toBe(true);
    const [a, b] = extras.values as readonly string[];
    const one = toggleValue({}, extras, a!);
    const two = toggleValue(one, extras, b!);
    expect(two.extras).toEqual([a, b]);
    expect(toggleValue(two, extras, a!).extras).toEqual([b]);
  });
});

describe('detailsToSave', () => {
  it('drops empty values and an Ice that is no longer shown', () => {
    const out = detailsToSave(flatWhite, {
      temp: 'Hot',
      ice: 'Light ice',
      milk: undefined,
      extras: [],
      note: '  ',
    });
    expect(out).toEqual({ temp: 'Hot' });
  });

  it('keeps Ice when the drink is iced', () => {
    expect(detailsToSave(flatWhite, { temp: 'Iced', ice: 'Light ice' })).toEqual({
      temp: 'Iced',
      ice: 'Light ice',
    });
  });
});

describe('DetailsEditor (Make it yours)', () => {
  it('shows the drink, a live summary, and saves on Done', async () => {
    const onClose = await openEditor();
    expect(screen.getByText(t('det.title', { drink: 'Flat White' }))).toBeTruthy();
    expect(screen.getByText(t('det.helper'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('opt-milk-Oat milk'));
    await fireEvent.press(screen.getByTestId('opt-size-Regular'));
    expect(screen.getByTestId('details-summary')).toHaveTextContent(
      orderSummary('coffee', { size: 'Regular', milk: 'Oat milk' }),
    );
    await fireEvent.press(screen.getByTestId('details-done'));
    expect(onClose).toHaveBeenCalledWith({ size: 'Regular', milk: 'Oat milk' });
  });

  it('closing the sheet any other way also saves (no discard dialog)', async () => {
    const onClose = await openEditor();
    await fireEvent.press(screen.getByTestId('opt-milk-Soy milk'));
    await fireEvent.press(
      screen.getByTestId('sheet-details-scrim', { includeHiddenElements: true }),
    );
    expect(onClose).toHaveBeenCalledWith({ milk: 'Soy milk' });
  });

  it('marks selection with state, not colour alone', async () => {
    await openEditor();
    await fireEvent.press(screen.getByTestId('opt-milk-Oat milk'));
    expect(screen.getByTestId('opt-milk-Oat milk')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByTestId('opt-milk-Soy milk')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: false }),
    );
  });

  it('shows Ice only when Temperature is Iced', async () => {
    await openEditor();
    const ice = [
      ...editorFields({ drinkId: 'coffee.flat_white' }).primary,
      ...editorFields({ drinkId: 'coffee.flat_white' }).more,
    ].some((f) => f.key === 'ice');
    expect(ice).toBe(true);
    // Open More options in case Ice lives there.
    if (screen.queryByTestId('details-more'))
      await fireEvent.press(screen.getByTestId('details-more'));
    expect(screen.queryByTestId('field-ice')).toBeNull();
    await fireEvent.press(screen.getByTestId('opt-temp-Iced'));
    expect(screen.getByTestId('field-ice')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('opt-temp-Iced'));
    expect(screen.queryByTestId('field-ice')).toBeNull();
  });

  // Espresso's own fields are shots, caffeine, sweetener and extras; size, milk and the rest of
  // Coffee sit under More options.
  const espresso: UsualDrink = {
    drinkId: 'coffee.espresso',
    customName: null,
    category: 'coffee',
    details: {},
  };

  it('keeps More options folded until opened', async () => {
    const more = editorFields({ drinkId: 'coffee.espresso' }).more.filter((f) => f.key !== 'ice');
    expect(more.length).toBeGreaterThan(0);
    const first = more[0]!;
    await openEditor(espresso);
    expect(screen.queryByTestId(`field-${first.key}`)).toBeNull();
    await fireEvent.press(screen.getByTestId('details-more'));
    expect(screen.getByTestId(`field-${first.key}`)).toBeTruthy();
  });

  it('opens More options when a folded field already has a value', async () => {
    const first = editorFields({ drinkId: 'coffee.espresso' }).more.filter(
      (f) => f.key !== 'ice',
    )[0]!;
    const value = (first.values as readonly string[])[0]!;
    await openEditor({
      ...espresso,
      details: { [first.key]: first.multi ? [value] : value } as DrinkDetails,
    });
    expect(screen.getByTestId(`field-${first.key}`)).toBeTruthy();
  });

  it('a custom drink shows every field of its category with no fold', async () => {
    await openEditor({ drinkId: null, customName: 'Office brew', category: 'tea', details: {} });
    expect(screen.queryByTestId('details-more')).toBeNull();
    for (const f of editorFields({ category: 'tea' }).primary.filter((x) => x.key !== 'ice')) {
      expect(screen.getByTestId(`field-${f.key}`)).toBeTruthy();
    }
  });

  it('Note and Plan B are capped and count down near the limit', async () => {
    const onClose = await openEditor();
    const long = 'x'.repeat(TEXT_LIMITS.note + 10);
    await fireEvent.changeText(screen.getByTestId('details-note'), long);
    expect(screen.getByText('0')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('details-planb'), 'Almond is fine');
    await fireEvent.press(screen.getByTestId('details-done'));
    const saved = onClose.mock.calls[0]![0];
    expect(Array.from(saved.note ?? '')).toHaveLength(TEXT_LIMITS.note);
    expect(saved.planB).toBe('Almond is fine');
  });

  it('Clear all empties every field', async () => {
    const onClose = await openEditor({
      ...flatWhite,
      details: { milk: 'Oat milk', note: 'Very hot' },
    });
    await fireEvent.press(screen.getByTestId('details-clear'));
    await fireEvent.press(screen.getByTestId('details-done'));
    expect(onClose).toHaveBeenCalledWith({});
  });
});
