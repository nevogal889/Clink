import type { LogEntry } from './api';
import { lastEntry, summarizeToday } from './tracker';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).toISOString();
let n = 0;
const entry = (drinkId: string, loggedAt: string, details = {}): LogEntry => ({
  id: `e${++n}`,
  drinkId,
  customName: null,
  category: drinkId.split('.')[0] as LogEntry['category'],
  details,
  loggedAt,
});

describe('summarizeToday (PRD 3.11)', () => {
  const day = new Date(2026, 10, 16, 14, 0);

  it('counts drinks and water apart', () => {
    const s = summarizeToday(
      [
        entry('coffee.latte', at(9)),
        entry('water.still', at(10)),
        entry('water.sparkling', at(11)),
      ],
      day,
    );
    expect(s).toMatchObject({ drinks: 1, water: 2 });
    expect(s.lastDrinkAt?.toISOString()).toBe(at(9));
  });

  it('shows the note on the 4th caffeinated drink, daytime wording before 17:00', () => {
    const three = [
      entry('coffee.latte', at(8)),
      entry('coffee.americano', at(9)),
      entry('matcha.latte', at(10)),
    ];
    expect(summarizeToday(three, day).caffeineNoteKey).toBeNull();
    const four = [...three, entry('tea.english_breakfast', at(11))];
    expect(summarizeToday(four, day).caffeineNoteKey).toBe('caff.day');
    expect(summarizeToday(four, new Date(2026, 10, 16, 17, 0)).caffeineNoteKey).toBe(
      'caff.evening',
    );
  });

  it('does not count an herbal tea, a decaf, water or a smoothie (acceptance 4)', () => {
    const list = [
      entry('coffee.latte', at(8)),
      entry('coffee.americano', at(9)),
      entry('coffee.espresso', at(10)),
      entry('tea.chamomile', at(11)),
      entry('coffee.flat_white', at(12), { caf: 'Decaf' }),
      entry('smoothie_juice.berry', at(12, 30)),
      entry('water.still', at(13)),
    ];
    const s = summarizeToday(list, day);
    expect(s.caffeinated).toBe(3);
    expect(s.caffeineNoteKey).toBeNull();
  });

  it('Undo last picks the most recent entry only', () => {
    const list = [
      entry('coffee.latte', at(8)),
      entry('water.still', at(12)),
      entry('tea.green', at(10)),
    ];
    expect(lastEntry(list)?.drinkId).toBe('water.still');
    expect(lastEntry([])).toBeNull();
  });
});
