// My usual 3, pushed from the profile and from Settings (DESIGN.md 4.14). Changes save as they
// happen; there is no Save button.
import { t } from '@clink/shared';
import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from '@/lib/store';
import { useUsualEditor } from '@/features/usual/UsualEditor';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export default function UsualScreen() {
  const { state, actions } = useData();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const editor = useUsualEditor({ list: state.usual, onChange: (next) => void actions.setUsual(next), mode: 'settings' });
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceBase }} testID="screen-usual">
      <Stack.Screen options={{ headerShown: true, title: '', headerShadowVisible: false, headerStyle: { backgroundColor: c.surfaceBase }, headerTintColor: c.inkPrimary, headerBackButtonDisplayMode: 'minimal' }} />
      <ScrollView stickyHeaderIndices={[editor.tabsIndex + 1]} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s8 }}>
        <View style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.s2 }}>
          <Txt variant="displayL" accessibilityRole="header">
            {t('usual.title')}
          </Txt>
          <Txt variant="body" tone="secondary" style={{ marginTop: spacing.s2 }}>
            {t('usual.sub')}
          </Txt>
        </View>
        {editor.blocks}
      </ScrollView>
      {editor.overlays}
    </View>
  );
}
