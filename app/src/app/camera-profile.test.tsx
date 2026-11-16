// Layout rules from the screenshot review: the To: line names the group in full with its emoji,
// Who joins? is pinned outside the scrolling panel, and the profile reads "380 XP" with
// "320 more to reach Usual Order" under the bar (DESIGN.md 4.4, 4.5, 4.16).
import { t } from '@clink/shared';
import { Stack } from 'expo-router';
import { renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMockApi } from '@/lib/api';
import { DataProvider } from '@/lib/store';
import { SnackbarHost, SnackbarProvider } from '@/ui/Snackbar';

import Camera from './camera';
import Profile from './profile';

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
