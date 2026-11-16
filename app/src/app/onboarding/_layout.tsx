// Onboarding steps 2 to 6. The back button is the system one (COPY.md 4.3), from step 3 on.
import { Stack } from 'expo-router';

import { useTheme } from '@/ui/useTheme';

export default function OnboardingLayout() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: c.inkPrimary,
        headerStyle: { backgroundColor: c.surfaceBase },
        contentStyle: { backgroundColor: c.surfaceBase },
      }}
    >
      <Stack.Screen name="name" options={{ headerBackVisible: false, gestureEnabled: false }} />
    </Stack>
  );
}
