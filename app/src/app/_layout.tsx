import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { DataProvider, useData } from '@/lib/store';
import { SnackbarHost, SnackbarProvider } from '@/ui/Snackbar';
import { fontFiles } from '@/ui/theme/typography';
import { useTheme } from '@/ui/useTheme';

export default function RootLayout() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

/** Waits for the fonts and the first data load, so screens read real defaults when they mount. */
function Shell() {
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const { state } = useData();
  const { c, mode } = useTheme();
  const ready = (fontsLoaded || !!fontError) && state.ready;
  return (
    <>
      <SnackbarProvider>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <View style={{ flex: 1, backgroundColor: c.surfaceBase }}>
          {ready ? (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: c.surfaceBase },
              }}
            >
              <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
              <Stack.Screen name="camera" options={{ gestureEnabled: false, animation: 'fade' }} />
            </Stack>
          ) : null}
          <SnackbarHost bottom={32} followInset />
        </View>
      </SnackbarProvider>
    </>
  );
}
