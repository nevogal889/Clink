// Onboarding end to end over the real route files and the mock data layer (PRD 3.2 acceptance
// criteria 1, 2, 3 and 7; tap budget for step 3 with a preset).
import { t } from '@clink/shared';
import { Stack, usePathname } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMockApi } from '@/lib/api';
import { DataProvider } from '@/lib/store';
import { SnackbarHost, SnackbarProvider } from '@/ui/Snackbar';

import Camera from '@/app/camera';
import Index from '@/app/index';
import InviteStep from '@/app/onboarding/invite';
import NameStep from '@/app/onboarding/name';
import NotificationsStep from '@/app/onboarding/notifications';
import UsualStep from '@/app/onboarding/usual';
import WidgetStep from '@/app/onboarding/widget';
import SignIn from '@/app/sign-in';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function routes(api: ReturnType<typeof createMockApi>) {
  function Layout() {
    const pathname = usePathname();
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <DataProvider api={api}>
          <SnackbarProvider routeKey={pathname}>
            <Stack screenOptions={{ headerShown: false }} />
            <SnackbarHost />
          </SnackbarProvider>
        </DataProvider>
      </SafeAreaProvider>
    );
  }
  return {
    _layout: Layout,
    index: Index,
    'sign-in': SignIn,
    'onboarding/name': NameStep,
    'onboarding/usual': UsualStep,
    'onboarding/invite': InviteStep,
    'onboarding/notifications': NotificationsStep,
    'onboarding/widget': WidgetStep,
    camera: Camera,
  };
}

const visible = (id: string) => screen.getAllByTestId(id).at(-1)!;

describe('onboarding', () => {
  it('runs the six steps in order, skips 4 to 6, and lands on the camera', async () => {
    const api = createMockApi({ latencyMs: 0 });
    await renderRouter(routes(api), { initialUrl: '/' });

    await waitFor(() => expect(screen.getByTestId('screen-sign-in')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('signin-primary'));

    // Step 2: name pre-filled from the provider, so Continue is one tap.
    await waitFor(() => expect(visible('screen-onb-name')).toBeTruthy());
    expect(visible('onb-progress')).toHaveProp('accessibilityLabel', t('onb.progress', { n: 2 }));
    await fireEvent.press(visible('onb-continue'));

    // Step 3: Continue is disabled until a drink is picked; a preset fills all three.
    await waitFor(() => expect(visible('screen-onb-usual')).toBeTruthy());
    expect(visible('onb-continue')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
    await fireEvent.press(visible('preset-preset.coffee'));
    await waitFor(() =>
      expect(api.state.usual.map((u) => u.drinkId)).toEqual([
        'coffee.latte',
        'coffee.americano',
        'coffee.cold_brew',
      ]),
    );
    await fireEvent.press(visible('onb-continue'));

    // Step 4: Later with nothing shared. No invite URL anywhere on screen (guideline 6).
    await waitFor(() => expect(visible('screen-onb-invite')).toBeTruthy());
    expect(screen.queryByText(/https?:\/\//)).toBeNull();
    expect(screen.getByTestId('share-whatsapp')).toBeTruthy();
    expect(screen.getByTestId('share-messages')).toBeTruthy();
    expect(screen.getByTestId('share-more')).toBeTruthy();
    await fireEvent.press(visible('onb-later'));

    // Step 5: Not now never asks the system.
    await waitFor(() => expect(visible('screen-onb-notifications')).toBeTruthy());
    await fireEvent.press(visible('notif-no'));
    expect(api.state.notifications).toBeNull();

    // Step 6: "I added it" without a widget shows the retry guide; Skip for now moves on.
    await waitFor(() => expect(visible('screen-onb-widget')).toBeTruthy());
    await fireEvent.press(visible('widget-done'));
    await waitFor(() => expect(visible('widget-missing')).toBeTruthy());
    expect(visible('widget-later')).toHaveTextContent(t('onb.widget.retry.skip'));
    await fireEvent.press(visible('widget-later'));

    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    expect(api.state.me.onboarding).toBe('done');
  });

  it('asks for notifications only after Continue on our explainer', async () => {
    const api = createMockApi({ latencyMs: 0 });
    api.state.session = { userId: 'u_me', method: 'apple', phone: null };
    api.state.me = { ...api.state.me, displayName: 'Dana', onboarding: 'notifications' };
    await renderRouter(routes(api), { initialUrl: '/' });
    await waitFor(() => expect(visible('screen-onb-notifications')).toBeTruthy());
    expect(api.state.notifications).toBeNull();
    await fireEvent.press(visible('notif-yes'));
    await waitFor(() => expect(api.state.notifications).toBe('granted'));
  });

  it('resumes on the saved step after a restart (acceptance 5)', async () => {
    const api = createMockApi({ latencyMs: 0 });
    api.state.session = { userId: 'u_me', method: 'apple', phone: null };
    api.state.me = { ...api.state.me, displayName: 'Dana', onboarding: 'invite' };
    await renderRouter(routes(api), { initialUrl: '/' });
    await waitFor(() => expect(visible('screen-onb-invite')).toBeTruthy());
  });

  it('a set-up user lands on the camera with usual #1 and the last place as defaults', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api), { initialUrl: '/' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    expect(visible('cam-cat-coffee')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    expect(visible('cam-place')).toHaveProp('value', 'Kaffa Roastery');
    expect(visible('pill-0')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
  });
});

describe('camera composer', () => {
  it('Who joins? sends with the defaults in one tap (usual #1, last place, Now, Automatic)', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const send = jest.spyOn(api, 'sendFlare');
    await renderRouter(routes(api), { initialUrl: '/camera' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    await fireEvent.press(visible('cam-send'));
    await waitFor(() => expect(visible('live-bar')).toBeTruthy());
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'coffee',
        place: 'Kaffa Roastery',
        timingMin: 0,
        audience: { kind: 'auto' },
      }),
    );
  });

  it('Other offers 5 to 60 in steps of 5 and sends the picked value', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const send = jest.spyOn(api, 'sendFlare');
    await renderRouter(routes(api), { initialUrl: '/camera' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    await fireEvent.press(visible('pill-other'));
    await waitFor(() => expect(visible('sheet-other-time')).toBeTruthy());
    for (let m = 5; m <= 60; m += 5) expect(screen.getByTestId(`other-${m}`)).toBeTruthy();
    expect(screen.queryByTestId('other-65')).toBeNull();
    expect(screen.queryByTestId('other-0')).toBeNull();
    await fireEvent.press(screen.getByTestId('other-45'));
    expect(visible('pill-other')).toHaveTextContent(t('time.pill', { n: 45 }));
    await fireEvent.press(visible('cam-cat-tea'));
    await fireEvent.press(visible('cam-send'));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'tea', timingMin: 45 }),
      ),
    );
  });

  it('offers exactly the four flare categories, never Water', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api), { initialUrl: '/camera' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    for (const c of ['coffee', 'matcha', 'tea', 'smoothie_juice'])
      expect(visible(`cam-cat-${c}`)).toBeTruthy();
    expect(screen.queryByTestId('cam-cat-water')).toBeNull();
  });

  it('To: picker selects a row and closes in one tap', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const send = jest.spyOn(api, 'sendFlare');
    await renderRouter(routes(api), { initialUrl: '/camera' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    await fireEvent.press(visible('cam-to'));
    await waitFor(() => expect(screen.getByTestId('aud-g_work')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('aud-g_work'));
    expect(visible('cam-to')).toHaveProp('accessibilityLabel', t('a11y.to', { audience: 'Work' }));
    await fireEvent.press(visible('cam-send'));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ audience: { kind: 'group', id: 'g_work' } }),
      ),
    );
  });

  it('with no friends, Who joins? opens the invite sheet instead of sending', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.audience = {
      friendCount: 0,
      groups: [],
      auto: { daytimeGroupId: null, otherGroupId: null },
    };
    const send = jest.spyOn(api, 'sendFlare');
    await renderRouter(routes(api), { initialUrl: '/camera' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    expect(visible('cam-send')).toHaveTextContent(t('top.friends_none'));
    await fireEvent.press(visible('cam-send'));
    await waitFor(() => expect(screen.getByTestId('sheet-invite')).toBeTruthy());
    expect(send).not.toHaveBeenCalled();
  });

  it('an empty audience disables Who joins? and says why', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.audience.groups = [
      ...api.state.audience.groups,
      { id: 'g_empty', name: 'Gym', emoji: '🏋️', memberCount: 0 },
    ];
    await renderRouter(routes(api), { initialUrl: '/camera' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    await fireEvent.press(visible('cam-to'));
    await fireEvent.press(screen.getByTestId('aud-g_empty'));
    expect(visible('cam-send')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
    expect(screen.getByText(t('compose.audience_empty', { group: 'Gym' }))).toBeTruthy();
  });
});
