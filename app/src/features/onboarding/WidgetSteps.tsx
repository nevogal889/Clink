// The add-widget guide rows (DESIGN.md 4.3 step 6), shared by onboarding and the camera's
// "Add the widget" notice. iOS 17 opens the gallery with +; iOS 18 and later with Edit.
import { t } from '@clink/shared';
import { Platform, View } from 'react-native';

import { lookPlatform } from '@/ui/theme/look';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

import { WidgetStepArt } from './WidgetStepArt';

type StepKey =
  | 'onb.widget.and.1'
  | 'onb.widget.and.2'
  | 'onb.widget.and.3'
  | 'onb.widget.ios.1'
  | 'onb.widget.ios.2'
  | 'onb.widget.ios.3'
  | 'onb.widget.ios17.1'
  | 'onb.widget.ios17.2'
  | 'onb.widget.ios17.3';

export function widgetStepKeys(look: 'ios' | 'android', iosMajor: number): StepKey[] {
  if (look === 'android') return ['onb.widget.and.1', 'onb.widget.and.2', 'onb.widget.and.3'];
  if (iosMajor > 0 && iosMajor < 18)
    return ['onb.widget.ios17.1', 'onb.widget.ios17.2', 'onb.widget.ios17.3'];
  return ['onb.widget.ios.1', 'onb.widget.ios.2', 'onb.widget.ios.3'];
}

function iosMajor(): number {
  if (Platform.OS !== 'ios') return 0;
  return Number.parseInt(String(Platform.Version), 10) || 0;
}

export function WidgetSteps() {
  const { c } = useTheme();
  const look = lookPlatform();
  return (
    <View>
      {widgetStepKeys(look, iosMajor()).map((key, i) => (
        <View
          key={key}
          accessible
          accessibilityLabel={`${i + 1}. ${t(key)}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.s4,
            paddingHorizontal: spacing.gutter,
            paddingVertical: spacing.s4,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: c.lineHairline,
          }}
        >
          <Txt variant="numeralL" color={c.cobalt} style={{ width: 28 }}>
            {String(i + 1)}
          </Txt>
          <Txt variant="body" style={{ flex: 1 }}>
            {t(key)}
          </Txt>
          <WidgetStepArt step={(i + 1) as 1 | 2 | 3} look={look} />
        </View>
      ))}
    </View>
  );
}
