// The app and the home-screen widget, over the real route files, the mock data layer and the
// preview widget host (the native bridge mocked): the widget token after sign-in, a fresh state
// on every change and foreground, widget logs in Today with no duplicates, clearing on sign-out
// and deletion, F8 (onboarding step 6, the camera notice and its guide, "Add it for me"),
// Settings > Widgets and the dev-only "Widget states" screen.
import { t, type WidgetState } from '@clink/shared';
import { Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMockApi } from '@/lib/api';
import { DataProvider, useData } from '@/lib/store';
import { createPreviewHost, type PreviewHost } from '@/lib/widget/host';
import { deviceDate } from '@/lib/widget/state';
import { SnackbarHost, SnackbarProvider } from '@/ui/Snackbar';

import Camera from '@/app/camera';
import WidgetStates from '@/app/dev/widget-states';
import Index from '@/app/index';
import WidgetStep from '@/app/onboarding/widget';
import Settings from '@/app/settings';
import WidgetGuide from '@/app/widget-guide';

let mockDev = true;
jest.mock('@/lib/config', () => ({
  ...jest.requireActual('@/lib/config'),
  isDevVariant: () => mockDev,
}));
let mockLook: 'ios' | 'android' = 'android';
jest.mock('@/ui/theme/look', () => ({
  ...jest.requireActual('@/ui/theme/look'),
  lookPlatform: () => mockLook,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

type Ctx = ReturnType<typeof useData>;
const ctxRef: { current: Ctx | null } = { current: null };
function Capture() {
  const value = useData();
  useEffect(() => {
    ctxRef.current = value;
  });
  return null;
}

function routes(api: ReturnType<typeof createMockApi>, host: PreviewHost) {
  function Layout() {
    const pathname = usePathname();
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <DataProvider api={api} widgets={host} widgetDebounceMs={0}>
          <Capture />
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
    camera: Camera,
    settings: Settings,
    'widget-guide': WidgetGuide,
    'onboarding/widget': WidgetStep,
    'dev/widget-states': WidgetStates,
  };
}

const visible = (id: string) => screen.getAllByTestId(id).at(-1)!;
const pushed = (host: PreviewHost) => JSON.parse(host.state ?? 'null') as WidgetState | null;
const pushedToday = (host: PreviewHost) => {
  const s = pushed(host);
  return s && s.state === 'ready' ? s.today : null;
};

/** Plays the app coming back to the foreground, for every AppState listener the store added. */
async function foreground() {
  const calls = (AppState.addEventListener as jest.Mock).mock.calls as [
    string,
    (s: string) => void,
  ][];
  await act(async () => {
    for (const [event, fn] of calls) if (event === 'change') fn('active');
  });
}

const W_LOG = '9b2f0c4e-6a1d-4c3b-8e5f-0a1b2c3d4e5f';
function widgetLog(loggedAt: string) {
  return {
    id: W_LOG,
    op: 'log' as const,
    createdAt: loggedAt,
    dropAt: null,
    payload: { drinkId: 'coffee.flat_white', slot: 1, category: 'coffee' as const, loggedAt },
  };
}

beforeEach(() => {
  mockDev = true;
  mockLook = 'android';
  ctxRef.current = null;
  (AppState.addEventListener as jest.Mock).mockClear();
});

describe('the app keeps the widget in step', () => {
  it('hands over the token, pushes every change, merges widget logs once, clears on sign-out', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const host = createPreviewHost({ installed: [{ id: 1, size: 'medium' }] });
    await renderRouter(routes(api, host), { initialUrl: '/camera' });

    // After launch: register-device, the token to the widget, then the state.
    await waitFor(() => expect(host.hasToken).toBe(true));
    expect(api.state.registrations).toBe(1);
    await waitFor(() => expect(pushedToday(host)).toMatchObject({ drinks: 4, water: 2 }));
    expect(host.calls).toContain('reloadWidgets');
    expect(host.calls.indexOf('setWidgetToken')).toBeLessThan(host.calls.indexOf('setWidgetState'));

    // A log in the app reaches the widget.
    await act(async () => {
      await ctxRef.current!.actions.log({
        drinkId: 'coffee.latte',
        customName: null,
        category: 'coffee',
        details: {},
      });
    });
    await waitFor(() => expect(pushedToday(host)?.drinks).toBe(5));

    // So does a usual 3 change.
    await act(async () => {
      await ctxRef.current!.actions.setUsual([
        { drinkId: 'tea.jasmine', customName: null, category: 'tea', details: {} },
      ]);
    });
    await waitFor(() => {
      const s = pushed(host);
      expect(s?.state === 'ready' && s.usual.map((u) => u.drinkId)).toEqual(['tea.jasmine']);
    });

    // A log the widget made offline shows in Today at once, but is not sent back to the widget
    // (it counts its own unsent logs).
    const loggedAt = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    host.pending = [widgetLog(loggedAt)];
    await foreground();
    await waitFor(() =>
      expect(ctxRef.current!.state.today.filter((e) => e.id === W_LOG)).toHaveLength(1),
    );
    expect(pushedToday(host)?.drinks).toBe(5);

    // The widget sends it; the next foreground reads it from the server: still once.
    host.pending = [];
    api.state.logs.push({
      id: W_LOG,
      drinkId: 'coffee.flat_white',
      customName: null,
      category: 'coffee',
      details: {},
      loggedAt,
    });
    await foreground();
    await waitFor(() => expect(pushedToday(host)?.drinks).toBe(6));
    expect(ctxRef.current!.state.today.filter((e) => e.id === W_LOG)).toHaveLength(1);
    expect(ctxRef.current!.state.today.filter((e) => e.category !== 'water')).toHaveLength(6);

    // Sign-out clears the widget: no token, signed-out state.
    await act(async () => {
      await ctxRef.current!.actions.signOut();
    });
    expect(host.calls.at(-1)).toBe('clearAll');
    expect(host.hasToken).toBe(false);
    expect(pushed(host)?.state).toBe('signed_out');
  });

  it('clears the widget after account deletion', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const host = createPreviewHost();
    await renderRouter(routes(api, host), { initialUrl: '/camera' });
    await waitFor(() => expect(host.hasToken).toBe(true));
    await act(async () => {
      await ctxRef.current!.actions.deleteAccount();
    });
    expect(host.calls).toContain('clearAll');
    expect(pushed(host)?.state).toBe('signed_out');
  });

  it('shows the setup state while onboarding runs', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.me.onboarding = 'widget';
    const host = createPreviewHost();
    await renderRouter(routes(api, host), { initialUrl: '/onboarding/widget' });
    await waitFor(() => expect(pushed(host)?.state).toBe('setup'));
  });

  it('makes no widget call, and shows no widget UI, where the platform has none', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const host = createPreviewHost({ supported: false });
    await renderRouter(routes(api, host), { initialUrl: '/camera' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    expect(screen.queryByTestId('widget-notice')).toBeNull();
    // register-device still runs once per launch (ARCHITECTURE.md 4.4); no token reaches a bridge.
    await waitFor(() => expect(api.state.registrations).toBe(1));
    expect(host.calls).toEqual([]);
  });

  it('has no Widgets section in Settings where the platform has none', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api, createPreviewHost({ supported: false })), {
      initialUrl: '/settings',
    });
    await waitFor(() => expect(visible('screen-settings')).toBeTruthy());
    expect(screen.queryByText(t('set.sec.widgets'))).toBeNull();
    expect(screen.queryByTestId('set-widgets-guide')).toBeNull();
  });
});

describe('F8 Add the widget', () => {
  it('onboarding: "Add it for me" pins the medium widget and moves on once it is there', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.me.onboarding = 'widget';
    const host = createPreviewHost({ pinSupported: true, pinAdds: true });
    await renderRouter(routes(api, host), { initialUrl: '/onboarding/widget' });
    await waitFor(() => expect(visible('widget-pin')).toBeTruthy());
    expect(visible('widget-pin')).toHaveTextContent(t('onb.widget.and.pin'));
    await fireEvent.press(visible('widget-pin'));
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy(), { timeout: 4000 });
    expect(host.installed).toEqual([{ id: 100, size: 'medium' }]);
    expect(api.state.me.onboarding).toBe('done');
    // The widget is there, so the camera has no "Add the widget" notice.
    expect(screen.queryByTestId('widget-notice')).toBeNull();
  });

  it('onboarding: a launcher that cannot pin leaves the written steps only', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.me.onboarding = 'widget';
    const host = createPreviewHost({ pinSupported: false });
    await renderRouter(routes(api, host), { initialUrl: '/onboarding/widget' });
    await waitFor(() => expect(visible('widget-pin')).toBeTruthy());
    await fireEvent.press(visible('widget-pin'));
    await waitFor(() => expect(screen.queryByTestId('widget-pin')).toBeNull());
    expect(visible('screen-onb-widget')).toBeTruthy();
    expect(screen.getByText(t('onb.widget.and.3'))).toBeTruthy();
  });

  it('onboarding: no pin button on iOS-style guides', async () => {
    mockLook = 'ios';
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.me.onboarding = 'widget';
    await renderRouter(routes(api, createPreviewHost()), { initialUrl: '/onboarding/widget' });
    await waitFor(() => expect(visible('screen-onb-widget')).toBeTruthy());
    expect(screen.queryByTestId('widget-pin')).toBeNull();
  });

  it('onboarding: "I added it" finds a widget added by hand and moves on', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.me.onboarding = 'widget';
    const host = createPreviewHost();
    await renderRouter(routes(api, host), { initialUrl: '/onboarding/widget' });
    await waitFor(() => expect(visible('screen-onb-widget')).toBeTruthy());
    host.installed.push({ id: 5, size: 'small' });
    await fireEvent.press(visible('widget-done'));
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
  });

  it('onboarding: the step passes straight on where the platform has no widget', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.me.onboarding = 'widget';
    await renderRouter(routes(api, createPreviewHost({ supported: false })), {
      initialUrl: '/onboarding/widget',
    });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    expect(api.state.me.onboarding).toBe('done');
  });

  it('camera: the notice stays until a widget is found, and its guide pins one', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const host = createPreviewHost({ pinSupported: true, pinAdds: true });
    await renderRouter(routes(api, host), { initialUrl: '/camera' });
    await waitFor(() => expect(visible('widget-notice')).toBeTruthy());
    expect(visible('widget-notice-open')).toHaveProp(
      'accessibilityLabel',
      `${t('widget_card.title')}. ${t('widget_card.cta')}`,
    );
    await fireEvent.press(visible('widget-notice-open'));
    await waitFor(() => expect(visible('screen-widget-guide')).toBeTruthy());
    // Nothing yet: "I added it" says so.
    await fireEvent.press(visible('guide-done'));
    await waitFor(() => expect(visible('widget-missing')).toBeTruthy());
    await fireEvent.press(visible('widget-pin'));
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy(), { timeout: 4000 });
    await waitFor(() => expect(screen.queryByTestId('widget-notice')).toBeNull());
  });

  it('camera: a widget added while the app was away hides the notice on foreground', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const host = createPreviewHost();
    await renderRouter(routes(api, host), { initialUrl: '/camera' });
    await waitFor(() => expect(visible('widget-notice')).toBeTruthy());
    host.installed.push({ id: 9, size: 'medium' });
    await foreground();
    await waitFor(() => expect(screen.queryByTestId('widget-notice')).toBeNull());
  });
});

describe('Settings > Widgets', () => {
  it('lists each widget with where Who joins? goes, and the guide', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const host = createPreviewHost({
      installed: [
        { id: 41, size: 'medium' },
        { id: 42, size: 'small' },
      ],
    });
    await renderRouter(routes(api, host), { initialUrl: '/settings' });
    await waitFor(() => expect(visible('set-widget-41')).toBeTruthy());
    expect(screen.getByText(t('set.sec.widgets'))).toBeTruthy();
    const medium = t('set.widgets.row', {
      size: t('set.widgets.size.medium'),
      audience: t('wcfg.auto'),
    });
    expect(visible('set-widget-41')).toHaveTextContent(medium, { exact: false });
    // Automatic says where it lands right now: Work on weekday hours, else Home friends.
    expect(visible('set-widget-41').props.accessibilityLabel).toMatch(
      new RegExp(`^${medium}\\. Who joins\\? goes to (Work|Home friends) right now$`),
    );
    expect(visible('set-widget-42').props.accessibilityLabel).toBe(
      `${t('set.widgets.row_plain', { size: t('set.widgets.size.small') })}. ${t('set.widgets.small_note')}`,
    );
    await fireEvent.press(visible('set-widgets-guide'));
    await waitFor(() => expect(visible('screen-widget-guide')).toBeTruthy());
  });

  it('says when there is no widget yet', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api, createPreviewHost()), { initialUrl: '/settings' });
    await waitFor(() => expect(visible('set-widgets-none')).toBeTruthy());
    expect(visible('set-widgets-none')).toHaveTextContent(t('set.widgets.none'));
  });

  it('shows the "Widget states" row in dev builds only', async () => {
    mockDev = false;
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api, createPreviewHost()), { initialUrl: '/settings' });
    await waitFor(() => expect(visible('set-widgets-guide')).toBeTruthy());
    expect(screen.queryByTestId('set-widgets-debug')).toBeNull();
  });
});

describe('Widget states (dev builds)', () => {
  it('sends each fixture to the widget, moved to now, and brings the real data back', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const host = createPreviewHost({ installed: [{ id: 1, size: 'medium' }] });
    await renderRouter(routes(api, host), { initialUrl: '/settings' });
    await waitFor(() => expect(visible('set-widgets-debug')).toBeTruthy());
    await fireEvent.press(visible('set-widgets-debug'));
    await waitFor(() => expect(visible('screen-widget-states')).toBeTruthy());
    await waitFor(() => expect(pushedToday(host)?.drinks).toBe(4));

    // Every fixture is accepted by the same schema the native decoder ports.
    for (const id of ['W1', 'W2', 'W3', 'W9', 'W13', 'W22']) {
      await fireEvent.press(visible(`ws-${id}`));
      await waitFor(() => expect(screen.getByText(t('dev.ws.sent', { id }))).toBeTruthy());
    }
    await fireEvent.press(visible('ws-W4'));
    await waitFor(() => expect(pushedToday(host)?.localDate).toBe(deviceDate(new Date())));
    const w4 = pushed(host);
    expect(w4?.state === 'ready' && w4.today.drinks).toBe(3);
    await fireEvent.press(visible('ws-W1'));
    await waitFor(() => expect(pushed(host)?.state).toBe('signed_out'));

    // Fixtures with widget-local parts say so.
    expect(visible('ws-W8')).toHaveTextContent(t('dev.ws.needs_tap'), { exact: false });

    await fireEvent.press(visible('ws-live'));
    await waitFor(() => expect(pushedToday(host)?.drinks).toBe(4));
    await waitFor(() => expect(screen.getByText(t('dev.ws.live_done'))).toBeTruthy());
  });

  it('is not there in a store build', async () => {
    mockDev = false;
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter(routes(api, createPreviewHost()), { initialUrl: '/dev/widget-states' });
    await waitFor(() => expect(visible('screen-settings')).toBeTruthy());
  });
});
