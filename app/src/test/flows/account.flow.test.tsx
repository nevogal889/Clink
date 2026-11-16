// Account flows over the real route files and the mock data layer: phone sign-in with a code, the
// age check (PRD 3.1 rule 10, acceptance 2, 4 and 8), account deletion in 3 taps (PRD 3.19 AC 1),
// and the load error states (PRD 3.20, DESIGN.md 4.21).
import { t } from '@clink/shared';
import { Stack, usePathname } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError, createMockApi } from '@/lib/api';
import { MOCK_CODE } from '@/lib/api/mock';
import { memoryStore } from '@/lib/kv';
import { DataProvider } from '@/lib/store';
import { NoticeHost, SessionGuard } from '@/features/sync/Notices';
import { SnackbarHost, SnackbarProvider } from '@/ui/Snackbar';

import Age from '@/app/age';
import Camera from '@/app/camera';
import Code from '@/app/code';
import DeleteAccount from '@/app/delete-account';
import Index from '@/app/index';
import NameStep from '@/app/onboarding/name';
import UsualStep from '@/app/onboarding/usual';
import Phone from '@/app/phone';
import Settings from '@/app/settings';
import SignIn from '@/app/sign-in';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function routes(
  api: ReturnType<typeof createMockApi>,
  stores = { cache: memoryStore(), device: memoryStore() },
) {
  function Layout() {
    const pathname = usePathname();
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <DataProvider api={api} cache={stores.cache} device={stores.device}>
          <SnackbarProvider routeKey={pathname}>
            <Stack screenOptions={{ headerShown: false }} />
            <SnackbarHost />
            <NoticeHost />
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
    phone: Phone,
    code: Code,
    age: Age,
    'onboarding/name': NameStep,
    'onboarding/usual': UsualStep,
    camera: Camera,
    settings: Settings,
    'delete-account': DeleteAccount,
  };
}

const visible = (id: string) => screen.getAllByTestId(id).at(-1)!;

async function toCode(
  api: ReturnType<typeof createMockApi>,
  stores?: Parameters<typeof routes>[1],
) {
  await renderRouter(routes(api, stores), { initialUrl: '/' });
  await waitFor(() => expect(screen.getByTestId('screen-sign-in')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('signin-phone'));
  await waitFor(() => expect(visible('screen-phone')).toBeTruthy());
  expect(visible('phone-send')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ disabled: true }),
  );
  await fireEvent.changeText(visible('phone-number'), '201 555 0104');
  await fireEvent.press(visible('phone-send'));
  await waitFor(() => expect(visible('screen-code')).toBeTruthy());
  expect(screen.getByText(t('code.sub', { phone: '+1 201 555 0104' }))).toBeTruthy();
}

async function pickAge(month: number, year: number) {
  await waitFor(() => expect(visible('screen-age')).toBeTruthy());
  expect(visible('age-continue')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ disabled: true }),
  );
  await fireEvent.press(visible('age-month'));
  await fireEvent.press(visible(`sheet-month-${month}`));
  await fireEvent.press(visible('age-year'));
  await fireEvent.press(visible(`sheet-year-${year}`));
  await fireEvent.press(visible('age-continue'));
}

describe('phone sign-in and the age check', () => {
  it('a new number goes code, age, name, then usual 3', async () => {
    const api = createMockApi({ latencyMs: 0 });
    await toCode(api);

    // A wrong code shows the inline error and clears the field (PRD 3.1 AC 4).
    await fireEvent.changeText(visible('code-input'), '000000');
    await waitFor(() => expect(visible('code-error')).toHaveTextContent(t('err.code_wrong')));
    expect(visible('code-input')).toHaveProp('value', '');
    // Resend waits 30 s (AC 5).
    expect(visible('code-resend')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );

    // The 6th digit submits by itself.
    await fireEvent.changeText(visible('code-input'), MOCK_CODE);
    await pickAge(3, 1994);

    await waitFor(() => expect(visible('screen-onb-name')).toBeTruthy());
    expect(api.state.me.needsSignup).toBe(true);
    await fireEvent.changeText(visible('name-field'), 'Dana Kim');
    await fireEvent.press(visible('onb-continue'));
    await waitFor(() => expect(visible('screen-onb-usual')).toBeTruthy());
    expect(api.state.me).toMatchObject({
      needsSignup: false,
      displayName: 'Dana Kim',
      onboarding: 'usual',
    });
  });

  it('under the minimum: no account, and the refused screen stays on this device', async () => {
    const api = createMockApi({ latencyMs: 0 });
    const stores = { cache: memoryStore(), device: memoryStore() };
    await toCode(api, stores);
    await fireEvent.changeText(visible('code-input'), MOCK_CODE);
    const year = new Date().getFullYear() - 12;
    await pickAge(1, year);
    await waitFor(() => expect(visible('screen-onb-name')).toBeTruthy());
    await fireEvent.changeText(visible('name-field'), 'Kid');
    await fireEvent.press(visible('onb-continue'));

    await waitFor(() => expect(visible('screen-age-refused')).toBeTruthy());
    expect(screen.getByText(t('age.too_young', { min: 16 }))).toBeTruthy();
    expect(api.state.session).toBeNull();
    expect(JSON.parse(stores.device.data.get('age_refused')!).min).toBe(16);
    await fireEvent.press(visible('age-refused-close'));
    await waitFor(() => expect(visible('screen-sign-in')).toBeTruthy());
  });

  it('opens straight to the refused screen while the 24 hours run', async () => {
    const api = createMockApi({ latencyMs: 0 });
    const device = memoryStore({
      age_refused: JSON.stringify({ until: Date.now() + 3600_000, min: 16 }),
    });
    await renderRouter(routes(api, { cache: memoryStore(), device }), { initialUrl: '/' });
    await waitFor(() => expect(visible('screen-age-refused')).toBeTruthy());
  });

  it('a returning account skips onboarding and is welcomed back on the camera', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.session = null;
    await toCode(api);
    await fireEvent.changeText(visible('code-input'), MOCK_CODE);
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByText(t('signin.returning', { me: 'Dana' }))).toBeTruthy(),
    );
  });

  it('a restart between the age screen and the name step asks the age again', async () => {
    const api = createMockApi({ latencyMs: 0 });
    api.state.session = { userId: 'u_me', method: 'phone', phone: '+12015550104' };
    api.state.me.needsSignup = true;
    await renderRouter(routes(api), { initialUrl: '/onboarding/name' });
    await waitFor(() => expect(visible('screen-age')).toBeTruthy());
  });
});

describe('account deletion', () => {
  it('is 3 taps from Settings and ends on sign-in with the toast', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _b, buttons) => {
      buttons?.find((b) => b.text === t('del.confirm.yes'))?.onPress?.();
    });
    await renderRouter(routes(api), { initialUrl: '/settings' });
    await waitFor(() => expect(visible('screen-settings')).toBeTruthy());
    await fireEvent.press(visible('set-delete')); // 1
    await waitFor(() => expect(visible('screen-delete')).toBeTruthy());
    for (const key of ['del.1', 'del.2', 'del.3', 'del.4'] as const) {
      expect(screen.getByText(t(key))).toBeTruthy();
    }
    await fireEvent.press(visible('delete-confirm')); // 2, and the system confirm is 3
    await waitFor(() => expect(visible('screen-sign-in')).toBeTruthy());
    expect(alert).toHaveBeenCalledWith(
      t('del.confirm.title'),
      t('del.confirm.body'),
      expect.any(Array),
    );
    expect(api.state.session).toBeNull();
    await waitFor(() => expect(screen.getByText(t('del.done'))).toBeTruthy());
    alert.mockRestore();
  });

  it('asks a phone user for a fresh code when the session is old, then deletes', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.state.session = { userId: 'u_me', method: 'phone', phone: '+12015550104' };
    const realDelete = api.deleteAccount;
    let first = true;
    api.deleteAccount = async () => {
      if (first) {
        first = false;
        throw new ApiError('reauth_required');
      }
      return realDelete();
    };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _b, buttons) => {
      buttons?.find((b) => b.text === t('del.confirm.yes'))?.onPress?.();
    });
    await renderRouter(routes(api), { initialUrl: '/delete-account' });
    await waitFor(() => expect(visible('screen-delete')).toBeTruthy());
    await fireEvent.press(visible('delete-confirm'));
    await waitFor(() => expect(visible('screen-code')).toBeTruthy());
    expect(screen.queryByTestId('code-wrong-number')).toBeNull();
    await fireEvent.changeText(visible('code-input'), MOCK_CODE);
    await waitFor(() => expect(visible('screen-sign-in')).toBeTruthy());
    expect(api.state.session).toBeNull();
    alert.mockRestore();
  });

  it('keeps the account on Cancel and shows the error line when deletion fails', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    api.deleteAccount = async () => {
      throw new ApiError('network');
    };
    let answer = t('del.confirm.no');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _b, buttons) => {
      buttons?.find((b) => b.text === answer)?.onPress?.();
    });
    await renderRouter(routes(api), { initialUrl: '/delete-account' });
    await waitFor(() => expect(visible('screen-delete')).toBeTruthy());
    await fireEvent.press(visible('delete-confirm'));
    expect(screen.queryByTestId('delete-error')).toBeNull();
    answer = t('del.confirm.yes');
    await fireEvent.press(visible('delete-confirm'));
    await waitFor(() => expect(visible('delete-error')).toHaveTextContent(t('del.error')));
    expect(api.state.session).not.toBeNull();
    alert.mockRestore();
  });
});

describe('load errors', () => {
  it('shows the full-screen retry when nothing is cached, and recovers', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const getMe = api.getMe;
    api.getMe = async () => {
      throw new ApiError('network');
    };
    await renderRouter(routes(api), { initialUrl: '/' });
    await waitFor(() => expect(visible('screen-load-failed')).toBeTruthy());
    expect(screen.getByText(t('err.load_full.title'))).toBeTruthy();
    api.getMe = getMe;
    await fireEvent.press(visible('load-retry'));
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
  });

  it('shows the last copy with the retry line when a refresh fails', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    const cache = memoryStore({
      snapshot: JSON.stringify({
        userId: 'u_me',
        me: { ...api.state.me, displayName: 'Cached Dana' },
        usual: api.state.usual,
        today: [],
        xp: api.state.xp,
        audience: api.state.audience,
        lastPlace: 'Kaffa Roastery',
      }),
    });
    api.getToday = async () => {
      throw new ApiError('network');
    };
    await renderRouter(routes(api, { cache, device: memoryStore() }), { initialUrl: '/' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    expect(visible('retry-line')).toHaveTextContent(t('err.load'));
  });

  it('a session that ends on its own goes back to sign-in', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    let end: () => void = () => undefined;
    api.onSessionEnd = (l) => {
      end = l;
      return () => undefined;
    };
    await renderRouter(routes(api), { initialUrl: '/' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    end();
    await waitFor(() => expect(screen.getByTestId('screen-sign-in')).toBeTruthy());
  });
});
