import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { DataProvider } from '@/lib/store';
import { SnackbarHost, SnackbarProvider } from '@/ui/Snackbar';
import { fontFiles } from '@/ui/theme/typography';
import { useTheme } from '@/ui/useTheme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const { c, mode } = useTheme();
  const ready = fontsLoaded || !!fontError;
  return (
    <DataProvider>
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
          <SnackbarHost bottom={32} />
        </View>
      </SnackbarProvider>
    </DataProvider>
  );
}
