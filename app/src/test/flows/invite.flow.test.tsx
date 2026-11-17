// The invite screen the widget's Invite friends button opens (`<scheme>:///invite`, DECISIONS.md
// "Invite friends on the widget", PRD 3.15 rule 9): share buttons only, the onboarding words, a
// close button that goes home, and the sign-in gate for a signed-out phone.
import { t } from '@clink/shared';
import { Stack, usePathname } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMockApi } from '@/lib/api';
import { DataProvider } from '@/lib/store';
import { SessionGuard } from '@/features/sync/Notices';
import { SnackbarHost, SnackbarProvider } from '@/ui/Snackbar';

import Camera from '@/app/camera';
import Index from '@/app/index';
import Invite from '@/app/invite';
import UsualStep from '@/app/onboarding/usual';
import SignIn from '@/app/sign-in';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 780 },
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
            <SessionGuard />
          </SnackbarProvider>
        </DataProvider>
      </SafeAreaProvider>
    );
  }
  return {
    _layout: Layout,
    index: Index,
    'sign-in': SignIn,
    'onboarding/usual': UsualStep,
    camera: Camera,
    invite: Invite,
  };
}

const visible = (id: string) => screen.getAllByTestId(id).at(-1)!;

describe('invite screen (/invite)', () => {
  it('shows the onboarding words, the meter and the three share buttons, and no URL', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api), { initialUrl: '/invite' });
    await waitFor(() => expect(visible('screen-invite')).toBeTruthy());
    expect(screen.getByText(t('onb.invite.title'))).toBeTruthy();
    expect(screen.getByText(t('onb.invite.sub'))).toBeTruthy();
    expect(screen.getByText(t('onb.invite.meter', { n: 0 }))).toBeTruthy();
    for (const ch of ['whatsapp', 'messages', 'more']) {
      expect(screen.getByTestId(`share-${ch}`)).toBeTruthy();
    }
    expect(screen.getByText(t('onb.invite.on_clink'))).toBeTruthy();
    // CEO guideline 6: no URL, no "link" wording, no copy button.
    expect(screen.queryAllByText(/https?:\/\/|example\.invalid|\/i\//)).toHaveLength(0);
    expect(screen.queryAllByText(/\blink\b/i)).toHaveLength(0);
    expect(screen.queryAllByText(/\bcopy\b/i)).toHaveLength(0);
    expect(visible('invite-close')).toHaveProp('accessibilityLabel', t('a11y.w.close'));
  });

  it('counts each share on the meter and records it from the widget surface', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api), { initialUrl: '/invite' });
    await waitFor(() => expect(visible('screen-invite')).toBeTruthy());
    await fireEvent.press(visible('share-messages'));
    await waitFor(() => expect(screen.getByText(t('onb.invite.meter', { n: 1 }))).toBeTruthy());
    await waitFor(() => expect(api.state.shares).toBe(1));
    await fireEvent.press(visible('share-messages'));
    await waitFor(() => expect(api.state.shares).toBe(2));
    await fireEvent.press(visible('share-messages'));
    await waitFor(() =>
      expect(screen.getByText(t('onb.invite.meter_more', { n: 3 }))).toBeTruthy(),
    );
    expect(api.state.shares).toBe(3);
    expect(api.state.shareSurfaces).toEqual(['widget', 'widget', 'widget']);
  });

  it('adds contacts already on Clink, which also fills the meter', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api), { initialUrl: '/invite' });
    await waitFor(() => expect(visible('screen-invite')).toBeTruthy());
    await fireEvent.press(visible('find-contacts'));
    await waitFor(() => expect(visible('contact-c_ana-add')).toBeTruthy());
    await fireEvent.press(visible('contact-c_ana-add'));
    await waitFor(() => expect(screen.getByText(t('onb.invite.meter', { n: 1 }))).toBeTruthy());
    expect(api.state.contacts.find((c) => c.id === 'c_ana')?.state).toBe('requested');
  });

  it('close goes home to the camera', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api), { initialUrl: '/invite' });
    await waitFor(() => expect(visible('screen-invite')).toBeTruthy());
    await fireEvent.press(visible('invite-close'));
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    expect(screen.queryByTestId('screen-invite')).toBeNull();
  });

  it('Android back on the invite screen goes home instead of leaving the app', async () => {
    type Listener = Parameters<typeof BackHandler.addEventListener>[1];
    const listeners: Listener[] = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, fn) => {
      listeners.push(fn);
      return { remove: () => listeners.splice(listeners.indexOf(fn), 1) };
    });
    try {
      const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
      await renderRouter(routes(api), { initialUrl: '/invite' });
      await waitFor(() => expect(visible('screen-invite')).toBeTruthy());
      expect(listeners.length).toBeGreaterThan(0);
      let handled: boolean | null | undefined = false;
      await waitFor(() => {
        handled = listeners.at(-1)!({} as Parameters<Listener>[0]);
      });
      expect(handled).toBe(true);
      await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    } finally {
      spy.mockRestore();
    }
  });

  it('signed out, the link goes through sign-in like any other route', async () => {
    const api = createMockApi({ latencyMs: 0 });
    await renderRouter(routes(api), { initialUrl: '/invite' });
    await waitFor(() => expect(visible('screen-sign-in')).toBeTruthy());
    expect(screen.queryByTestId('screen-invite')).toBeNull();
  });

  it('with setup unfinished, the link resumes the setup step instead', async () => {
    const api = createMockApi({ latencyMs: 0 });
    api.state.session = { userId: 'u_me', method: 'apple', phone: null };
    api.state.me = { ...api.state.me, displayName: 'Dana', onboarding: 'usual' };
    await renderRouter(routes(api), { initialUrl: '/invite' });
    await waitFor(() => expect(visible('screen-onb-usual')).toBeTruthy());
    expect(screen.queryByTestId('screen-invite')).toBeNull();
  });
});
