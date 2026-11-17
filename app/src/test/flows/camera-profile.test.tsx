// Layout rules from the screenshot review: the To: line names the group in full with its emoji,
// Who joins? is pinned outside the scrolling panel, and the profile reads "380 XP" with
// "320 more to reach Usual Order" under the bar (DESIGN.md 4.4, 4.5, 4.16).
import { t } from '@clink/shared';
import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMockApi } from '@/lib/api';
import { DataProvider } from '@/lib/store';
import { SnackbarHost, SnackbarProvider } from '@/ui/Snackbar';

import Camera from '@/app/camera';
import Profile from '@/app/profile';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function open(url: '/camera' | '/profile') {
  const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
  function Layout() {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <DataProvider api={api}>
          <SnackbarProvider>
            <Stack screenOptions={{ headerShown: false }} />
            <SnackbarHost />
          </SnackbarProvider>
        </DataProvider>
      </SafeAreaProvider>
    );
  }
  await renderRouter({ _layout: Layout, camera: Camera, profile: Profile }, { initialUrl: url });
  return api;
}

describe('camera send block', () => {
  it('names the Automatic group in full, with its emoji and the Auto marker', async () => {
    const api = await open('/camera');
    await waitFor(() => expect(screen.getByTestId('cam-to-label')).toBeTruthy());
    const label = screen.getByTestId('cam-to-label');
    const expected = api.state.audience.groups.map((g) =>
      t('compose.to', { audience: `${g.emoji} ${g.name}` }),
    );
    expect(expected).toContain(label.props.children);
    // Wraps at large text sizes instead of cutting the name.
    expect(label.props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId('cam-to-auto')).toHaveTextContent(t('compose.auto_tag'));
  });

  it('keeps Who joins? outside the scrolling panel, so it stays pinned', async () => {
    await open('/camera');
    await waitFor(() => expect(screen.getByTestId('who-joins-bar')).toBeTruthy());
    expect(within(screen.getByTestId('who-joins-bar')).getByTestId('cam-send')).toBeTruthy();
    expect(within(screen.getByTestId('flare-panel')).queryByTestId('cam-send')).toBeNull();
  });
});

describe('flare panel categories (DECISIONS.md, every flare category visible)', () => {
  it('shows all four category chips in a wrapping row, never a sideways scroll', async () => {
    await open('/camera');
    await waitFor(() => expect(screen.getByTestId('cam-cats')).toBeTruthy());
    const row = screen.getByTestId('cam-cats');
    expect(row).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap' });
    // The row is a plain view: nothing scrolls it sideways, so no chip can sit off screen.
    expect(row.type).not.toBe('RCTScrollView');
    expect(row.parent?.type).not.toBe('RCTScrollView');
    for (const [cat, name] of [
      ['coffee', 'Coffee'],
      ['matcha', 'Matcha'],
      ['tea', 'Tea'],
      ['smoothie_juice', 'Smoothie & Juice'],
    ] as const) {
      const chip = within(row).getByTestId(`cam-cat-${cat}`);
      expect(chip).toHaveTextContent(name);
      expect(chip).toHaveProp('accessibilityLabel', t('a11y.chip.cat', { cat_name: name }));
    }
    // At the largest text sizes a long name wraps to a second line instead of being cut.
    expect(within(row).getByText('Smoothie & Juice').props.numberOfLines).toBe(2);
  });

  it('switches the flare category from the fourth chip', async () => {
    await open('/camera');
    await waitFor(() => expect(screen.getByTestId('cam-cat-smoothie_juice')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('cam-cat-smoothie_juice'));
    expect(screen.getByTestId('cam-cat-smoothie_juice')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
  });
});

describe('flare panel at large text', () => {
  afterEach(() => jest.restoreAllMocks());
  const atScale = (fontScale: number) =>
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 360, height: 780, scale: 2, fontScale });

  it('shows the hero beside Meet and To: at text size 1.0', async () => {
    atScale(1);
    await open('/camera');
    await waitFor(() => expect(screen.getByTestId('cam-to')).toBeTruthy());
    expect(screen.getByTestId('cam-hero')).toBeTruthy();
  });

  it("gives the hero's width to the To: line from 1.5x text", async () => {
    atScale(2);
    await open('/camera');
    await waitFor(() => expect(screen.getByTestId('cam-to')).toBeTruthy());
    expect(screen.queryByTestId('cam-hero')).toBeNull();
    expect(screen.getByTestId('cam-cat-smoothie_juice')).toBeTruthy();
  });
});

describe('profile level', () => {
  it('shows your XP as the number and what is left as the hint', async () => {
    const api = await open('/profile');
    await waitFor(() => expect(screen.getByTestId('profile-total')).toBeTruthy());
    expect(api.state.xp.total).toBe(380);
    expect(screen.getByTestId('profile-total')).toHaveTextContent(t('profile.total', { xp: 380 }));
    expect(screen.getByTestId('profile-to-next')).toHaveTextContent(
      t('profile.to_next', { xp: 320, next_level_name: t('level.4') }),
    );
    expect(screen.getByTestId('profile-to-next')).toHaveTextContent(
      '320 more to reach Usual Order',
    );
  });
});
