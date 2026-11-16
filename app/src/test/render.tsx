// Test helper: renders a screen piece with the data layer (mock), snackbars and safe areas, the
// same providers the root layout gives it.
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMockApi } from '@/lib/api';
import type { MockOptions } from '@/lib/api/mock';
import { DataProvider } from '@/lib/store';
import { createPreviewHost, type WidgetHost } from '@/lib/widget/host';
import { SnackbarHost, SnackbarProvider } from '@/ui/Snackbar';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export async function renderWithData(
  ui: ReactElement,
  opts: MockOptions & { widgets?: WidgetHost } = {},
) {
  const { widgets = createPreviewHost(), ...mockOpts } = opts;
  const api = createMockApi({ latencyMs: 0, ...mockOpts });
  const utils = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DataProvider api={api} widgets={widgets} widgetDebounceMs={0}>
        <SnackbarProvider>
          {ui}
          <SnackbarHost />
        </SnackbarProvider>
      </DataProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, api, widgets };
}
