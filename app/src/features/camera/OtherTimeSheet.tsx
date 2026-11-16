// The Other picker (DESIGN.md 4.6): a 3 x 4 grid of 5 to 60 minutes. One tap picks and closes.
// Nothing above 60 is offered (DECISIONS.md "Flare timing").
import { OTHER_TIMING_VALUES, t } from '@clink/shared';
import { View } from 'react-native';

import { splitCount } from '@/lib/format';
import { Press } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';
import { radius, spacing } from '@/ui/theme';
import { Txt } from '@/ui/Txt';
import { useTheme } from '@/ui/useTheme';

export function OtherTimeSheet({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: number | null;
  onPick: (minutes: number) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} detent="medium" title={t('time.other.title')} subtitle={t('time.other.helper')} testID="sheet-other-time">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 }} accessibilityRole="radiogroup">
        {OTHER_TIMING_VALUES.map((n) => {
          const selected = value === n;
          const label = t('time.other.value', { n });
          const { num, word } = splitCount(label);
          return (
            <Press
              key={n}
              testID={`other-${n}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={label}
              onPress={() => onPick(n)}
              style={{
                flexBasis: '31%',
                flexGrow: 1,
                minHeight: 56,
                borderRadius: radius.button === 999 ? 16 : radius.button,
                borderCurve: 'continuous',
                borderWidth: selected ? 0 : 1,
                borderColor: c.lineControl,
                backgroundColor: selected ? c.cobalt : 'transparent',
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'center',
                paddingTop: spacing.s4,
                gap: 3,
              }}
            >
              <Txt variant="headline" color={selected ? c.onCobalt : c.inkPrimary} style={{ fontVariant: ['tabular-nums'] }}>
                {num || label}
              </Txt>
              {num ? (
                <Txt variant="caption" color={selected ? c.onCobalt : c.inkSecondary}>
                  {word}
                </Txt>
              ) : null}
            </Press>
          );
        })}
      </View>
    </Sheet>
  );
}
