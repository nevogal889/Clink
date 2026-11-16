// Entry: sends the user where they belong. Signed out goes to sign-in, an unfinished setup
// resumes on its step (PRD 3.2 rule 7), everyone else lands on the camera.
import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useData } from '@/lib/store';
import { routeFor } from '@/features/onboarding/steps';
import { useTheme } from '@/ui/useTheme';

export default function Index() {
  const { state } = useData();
  const { c } = useTheme();
  if (!state.ready)
    return <View testID="booting" style={{ flex: 1, backgroundColor: c.surfaceBase }} />;
  if (!state.session || !state.me) return <Redirect href="/sign-in" />;
  return <Redirect href={routeFor(state.me.onboarding)} />;
}
