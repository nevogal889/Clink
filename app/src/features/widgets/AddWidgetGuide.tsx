// The body of the add-widget guide (DESIGN.md 4.3 step 6): the "can't see it yet" line after a
// check found nothing, "Add it for me" on Android launchers that can pin, then the three written
// steps for this platform. Onboarding step 6 and the camera notice's guide both use it.
import { t } from '@clink/shared';
import { View } from 'react-native';

import { WidgetSteps } from '@/features/onboarding/WidgetSteps';
import { TonalButton } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export function AddWidgetGuide({
  missing,
  canPin,
  pinning,
  onPin,
}: {
  missing: boolean;
  canPin: boolean;
  pinning: boolean;
  onPin: () => void;
}) {
  const { c } = useTheme();
  return (
    <View>
      {missing ? (
        <View
          testID="widget-missing"
          accessibilityLiveRegion="polite"
          style={{
            marginHorizontal: spacing.gutter,
            marginTop: spacing.s6,
            paddingLeft: spacing.s3,
            borderLeftWidth: 4,
            borderLeftColor: c.cobalt,
          }}
        >
          <Txt variant="headline">{t('onb.widget.retry.title')}</Txt>
          <Txt variant="callout" tone="secondary">
            {t('onb.widget.retry.body')}
          </Txt>
        </View>
      ) : null}
      {canPin ? (
        <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.s6 }}>
          <TonalButton
            testID="widget-pin"
            icon="plus"
            label={t('onb.widget.and.pin')}
            onPress={() => {
              if (!pinning) onPin();
            }}
          />
        </View>
      ) : null}
      <View style={{ marginTop: canPin ? spacing.s4 : spacing.s6 }}>
        <WidgetSteps />
      </View>
    </View>
  );
}
