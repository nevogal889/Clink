// Snackbars belong to the screen or sheet that raised them (DESIGN.md 8 rule 9): they leave on
// navigation, never show over a sheet opened after them, never come back when it closes, and
// sit above the screen's action area.
import { t } from '@clink/shared';
import { Stack, router, usePathname } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMockApi } from '@/lib/api';
import { DataProvider } from '@/lib/store';
import { Sheet } from '@/ui/Sheet';
import { SnackbarHost, SnackbarProvider, useSnackbar, useSnackbarInset } from '@/ui/Snackbar';

import Camera from './camera';
import InviteStep from './onboarding/invite';
import UsualStep from './onboarding/usual';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function layout(api: ReturnType<typeof createMockApi>) {
  return function Layout() {
    const pathname = usePathname();
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <DataProvider api={api}>
          <SnackbarProvider routeKey={pathname}>
            <Stack screenOptions={{ headerShown: false }} />
            <SnackbarHost bottom={32} followInset />
          </SnackbarProvider>
        </DataProvider>
      </SafeAreaProvider>
    );
  };
}

const visible = (id: string) => screen.getAllByTestId(id).at(-1)!;
const presetText = () => t('usual.preset_set', { preset: t('preset.coffee') });

async function onUsualStep() {
  const api = createMockApi({ latencyMs: 0 });
  api.state.session = { userId: 'u_me', method: 'apple' };
  api.state.me = { ...api.state.me, displayName: 'Dana', onboarding: 'usual' };
  await renderRouter(
    {
      _layout: layout(api),
      index: UsualStep,
      'onboarding/usual': UsualStep,
      'onboarding/invite': InviteStep,
    },
    { initialUrl: '/onboarding/usual' },
  );
  await waitFor(() => expect(visible('screen-onb-usual')).toBeTruthy());
  await fireEvent.press(visible('preset-preset.coffee'));
  await waitFor(() => expect(screen.getByText(presetText())).toBeTruthy());
  return api;
}

describe('snackbar ownership', () => {
  it('a preset snackbar leaves when the details editor opens and stays gone after it closes', async () => {
    await onUsualStep();
    await fireEvent.press(visible('slot-1-details'));
    await waitFor(() => expect(screen.getByTestId('sheet-details')).toBeTruthy());
    expect(screen.queryByTestId('snackbar')).toBeNull();
    await fireEvent.press(screen.getByTestId('details-done'));
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });

  it('a preset snackbar does not follow Continue to the invite step', async () => {
    await onUsualStep();
    await fireEvent.press(visible('onb-continue'));
    await waitFor(() => expect(visible('screen-onb-invite')).toBeTruthy());
    expect(screen.queryByText(presetText())).toBeNull();
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });

  it('a tracker log shows its snackbar in the tracker sheet and drops it when the sheet closes', async () => {
    const api = createMockApi({ latencyMs: 0, scenario: 'setup' });
    await renderRouter({ _layout: layout(api), camera: Camera }, { initialUrl: '/camera' });
    await waitFor(() => expect(visible('screen-camera')).toBeTruthy());
    await fireEvent.press(visible('top-tracker'));
    await waitFor(() => expect(screen.getByTestId('quick-water')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('quick-water'));
    await waitFor(() => expect(screen.getAllByTestId('snackbar')).toHaveLength(1));
    expect(screen.getByText(t('today.logged', { drink: 'Water' }))).toBeTruthy();

    // "Something else": the picker sheet closes on a pick, and the snackbar lands on the tracker.
    await fireEvent.press(screen.getByTestId('quick-other'));
    await waitFor(() => expect(screen.getByTestId('sheet-log-other')).toBeTruthy());
    expect(screen.queryByTestId('snackbar')).toBeNull();
    await fireEvent.press(screen.getByTestId('drink-coffee.espresso'));
    await waitFor(() =>
      expect(screen.getByText(t('today.logged', { drink: 'Espresso' }))).toBeTruthy(),
    );
    expect(screen.getAllByTestId('snackbar')).toHaveLength(1);

    // The scrim sits behind the modal sheet, so it is hidden from the accessibility tree.
    const scrim = screen.getAllByTestId('sheet-tracker-scrim', { includeHiddenElements: true });
    await fireEvent.press(scrim.at(-1)!);
    await waitFor(() => expect(screen.queryByTestId('snackbar')).toBeNull());
  });
});

describe('snackbar host', () => {
  let raise: (text: string) => void = () => undefined;

  function Screen({ inset }: { inset: number }) {
    const snack = useSnackbar();
    raise = (text) => snack.show({ text, onAction: () => undefined });
    useSnackbarInset(inset, true);
    return <Text>screen</Text>;
  }

  function Other() {
    return <Text>other</Text>;
  }

  function WithSheet() {
    const snack = useSnackbar();
    raise = (text) => snack.show({ text });
    return (
      <Sheet visible onClose={() => undefined} testID="sheet-test">
        <Text>sheet body</Text>
      </Sheet>
    );
  }

  function routes(api: ReturnType<typeof createMockApi>) {
    return {
      _layout: layout(api),
      a: () => <Screen inset={120} />,
      b: Other,
      c: WithSheet,
    };
  }

  it('sits above the focused screen action area', async () => {
    await renderRouter(routes(createMockApi({ latencyMs: 0 })), { initialUrl: '/a' });
    await act(async () => raise('Hello'));
    const host = screen.getByTestId('snackbar').parent!;
    expect(host).toHaveStyle({ bottom: 128 });
  });

  it('dismisses on navigation', async () => {
    await renderRouter(routes(createMockApi({ latencyMs: 0 })), { initialUrl: '/a' });
    await act(async () => raise('Hello'));
    expect(screen.getByText('Hello')).toBeTruthy();
    await act(async () => router.push('/b'));
    await waitFor(() => expect(screen.getByText('other')).toBeTruthy());
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('a snackbar raised while a sheet is open shows in that sheet only', async () => {
    await renderRouter(routes(createMockApi({ latencyMs: 0 })), { initialUrl: '/c' });
    await waitFor(() => expect(screen.getByText('sheet body')).toBeTruthy());
    await act(async () => raise('In the sheet'));
    expect(screen.getAllByText('In the sheet')).toHaveLength(1);
  });
});
