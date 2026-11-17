// Category tabs (DESIGN.md 4.14): all four categories in view on a 360 dp phone, wrapping instead
// of scrolling sideways, and names that wrap rather than being cut at large text. The usual 3
// editor stops pinning the tabs from 1.5x text, where the wrapped rows would cover the screen.
import { t, type FlareCategory } from '@clink/shared';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { useUsualEditor, type UsualEditorParts } from '@/features/usual/UsualEditor';
import { renderWithData } from '@/test/render';

import { CategoryTabs } from './Catalog';

const NAMES: [FlareCategory, string][] = [
  ['coffee', 'Coffee'],
  ['matcha', 'Matcha'],
  ['tea', 'Tea'],
  ['smoothie_juice', 'Smoothie & Juice'],
];

const atScale = (fontScale: number) =>
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 360, height: 780, scale: 2, fontScale });

afterEach(() => jest.restoreAllMocks());

describe('CategoryTabs', () => {
  it('shows all four categories in a wrapping row, never a sideways scroll', async () => {
    await render(<CategoryTabs value="coffee" onChange={() => undefined} />);
    const row = screen.getByTestId('cat-tabs');
    expect(row).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap' });
    expect(row.type).not.toBe('RCTScrollView');
    expect(row.parent?.type).not.toBe('RCTScrollView');
    for (const [cat, name] of NAMES) {
      const tab = within(row).getByTestId(`tab-${cat}`);
      expect(tab).toHaveTextContent(name);
      expect(tab).toHaveProp('accessibilityLabel', t('a11y.chip.cat', { cat_name: name }));
    }
    expect(within(row).getByText('Smoothie & Juice').props.numberOfLines).toBe(2);
  });

  it('switches to Smoothie & Juice in one tap', async () => {
    const onChange = jest.fn();
    await render(<CategoryTabs value="coffee" onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('tab-smoothie_juice'));
    expect(onChange).toHaveBeenCalledWith('smoothie_juice');
  });
});

describe('usual 3 editor tabs', () => {
  async function editorAt(fontScale: number): Promise<UsualEditorParts> {
    atScale(fontScale);
    let parts: UsualEditorParts | null = null;
    function Probe() {
      parts = useUsualEditor({ list: [], onChange: () => undefined, mode: 'onboarding' });
      return null;
    }
    await renderWithData(<Probe />);
    return parts!;
  }

  it('pins the tabs at text size 1.0', async () => {
    const e = await editorAt(1);
    expect(e.sticky).toEqual([e.tabsIndex + 1]);
  });

  it('stops pinning them from 1.5x text', async () => {
    const e = await editorAt(2);
    expect(e.sticky).toBeUndefined();
  });
});
