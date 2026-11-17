import { t } from '@clink/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { renderWithData } from '@/test/render';

import { TrackerSheet, quickItems } from './TrackerSheet';

// 14:00 local, so the caffeine note uses the daytime line (COPY.md 4.15).
const NOW = new Date(2026, 10, 16, 14, 0, 0);
const now = () => NOW;

async function open(scenario: 'new' | 'setup') {
  const r = await renderWithData(<TrackerSheet visible onClose={() => undefined} now={now} />, {
    scenario,
    now,
  });
  await waitFor(() => expect(screen.getByTestId('count-drinks')).toBeTruthy());
  return r;
}

describe('TrackerSheet', () => {
  it('shows today in two counts with the last drink time', async () => {
    await open('setup');
    await waitFor(() => expect(screen.getByTestId('count-drinks')).toHaveTextContent('4'));
    expect(screen.getByTestId('count-water')).toHaveTextContent('2');
    expect(screen.getByText(t('today.footer'))).toBeTruthy();
    expect(screen.getByTestId('last-drink')).toHaveTextContent(t('today.last', { ago: '1h 42m' }));
  });

  it('shows the caffeine note after the 4th caffeinated drink, with no numbers', async () => {
    await open('setup');
    await waitFor(() => expect(screen.getByTestId('caffeine-note')).toBeTruthy());
    expect(within(screen.getByTestId('caffeine-note')).getByText(t('caff.day'))).toBeTruthy();
  });

  it('logs from the quick row, rolls the count and offers undo', async () => {
    await open('setup');
    await waitFor(() => expect(screen.getByTestId('count-water')).toHaveTextContent('2'));
    await fireEvent.press(screen.getByTestId('quick-water'));
    await waitFor(() => expect(screen.getByTestId('count-water')).toHaveTextContent('3'));
    expect(screen.getAllByText(t('today.logged', { drink: 'Water' })).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getAllByTestId('snackbar-undo')[0]!);
    await waitFor(() => expect(screen.getByTestId('count-water')).toHaveTextContent('2'));
  });

  it('logs a usual drink with its saved details', async () => {
    const r = await open('setup');
    await fireEvent.press(screen.getByTestId('quick-usual-1'));
    await waitFor(() => expect(screen.getByTestId('count-drinks')).toHaveTextContent('5'));
    const last = r.api.state.logs[r.api.state.logs.length - 1]!;
    expect(last.drinkId).toBe('coffee.flat_white');
    expect(last.details).toMatchObject({ milk: 'Oat milk', note: 'Very hot' });
  });

  it('Undo last removes only the most recent entry', async () => {
    const r = await open('setup');
    await waitFor(() => expect(screen.getByTestId('count-drinks')).toHaveTextContent('4'));
    const before = r.api.state.logs.map((l) => l.id);
    const newest = [...r.api.state.logs].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0]!;
    await fireEvent.press(screen.getByTestId('undo-last'));
    await waitFor(() => expect(screen.getByTestId('count-drinks')).toHaveTextContent('3'));
    expect(r.api.state.logs.map((l) => l.id)).toEqual(before.filter((id) => id !== newest.id));
  });

  it('removes any single entry, with undo to put it back', async () => {
    const r = await open('setup');
    const water = r.api.state.logs.find((l) => l.drinkId === 'water.still')!;
    await waitFor(() => expect(screen.getByTestId(`entry-${water.id}-remove`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`entry-${water.id}-remove`));
    await waitFor(() => expect(screen.getByTestId('count-water')).toHaveTextContent('1'));
    expect(screen.getAllByText(t('today.removed', { drink: 'Water' })).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getAllByTestId('snackbar-undo')[0]!);
    await waitFor(() => expect(screen.getByTestId('count-water')).toHaveTextContent('2'));
    expect(r.api.state.logs.some((l) => l.id === water.id)).toBe(true);
  });

  it('shows one empty line when nothing is logged, under the quick-log row', async () => {
    await open('new');
    expect(screen.getByTestId('today-empty')).toHaveTextContent(t('empty.today'));
    // DECISIONS.md "after placing the Android widget": one empty line, not two.
    expect(screen.queryByTestId('last-drink')).toBeNull();
    expect(screen.queryByText('No drinks yet today')).toBeNull();
  });

  it('shows no last-drink line while only water is logged', async () => {
    const r = await open('new');
    await fireEvent.press(screen.getByTestId('quick-water'));
    await waitFor(() => expect(screen.getByTestId('count-water')).toHaveTextContent('1'));
    expect(r.api.state.logs).toHaveLength(1);
    expect(screen.queryByTestId('today-empty')).toBeNull();
    expect(screen.queryByTestId('last-drink')).toBeNull();
  });

  it('"Something else" logs any catalog drink without touching the usual 3', async () => {
    const r = await open('setup');
    const usualBefore = JSON.stringify(r.api.state.usual);
    await fireEvent.press(screen.getByTestId('quick-other'));
    await waitFor(() => expect(screen.getByTestId('sheet-log-other')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('tab-smoothie_juice'));
    await fireEvent.press(screen.getByTestId('drink-smoothie_juice.green_juice'));
    await waitFor(() => expect(screen.getByTestId('count-drinks')).toHaveTextContent('5'));
    expect(JSON.stringify(r.api.state.usual)).toBe(usualBefore);
  });
});

describe('quickItems', () => {
  it('is the usual 3, still water, sparkling water, then Something else', () => {
    const items = quickItems([
      { drinkId: 'coffee.latte', customName: null, category: 'coffee', details: {} },
      { drinkId: null, customName: 'Office brew', category: 'tea', details: {} },
    ]);
    expect(items.map((i) => i.key)).toEqual(['usual-1', 'usual-2', 'water', 'sparkling', 'other']);
    expect(items[2]!.input).toMatchObject({ drinkId: 'water.still', category: 'water' });
    expect(items[3]!.input).toMatchObject({ drinkId: 'water.sparkling', category: 'water' });
    expect(items[4]!.input).toBeNull();
    expect(items[1]!.label).toBe('Office brew');
  });
});
