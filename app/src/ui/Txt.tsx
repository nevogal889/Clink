// Text in one of the DESIGN.md 2.4 styles. Left-aligned by default; follows system text size up to
// each token's max scale.
import { Text, type TextProps, type TextStyle } from 'react-native';

import { reviewTextScale } from './theme/look';
import { typography, type TypeName } from './theme/typography';
import { useTheme } from './useTheme';

export interface TxtProps extends TextProps {
  variant?: TypeName;
  color?: string;
  /** Shortcut for the secondary and tertiary inks. */
  tone?: 'primary' | 'secondary' | 'tertiary';
  align?: TextStyle['textAlign'];
}

const REVIEW_SCALE = reviewTextScale();

export function Txt({
  variant = 'body',
  color,
  tone = 'primary',
  align,
  style,
  ...rest
}: TxtProps) {
  const { c } = useTheme();
  const { maxFontSizeMultiplier, ...base } = typography[variant];
  const k = Math.min(REVIEW_SCALE, rest.maxFontSizeMultiplier ?? maxFontSizeMultiplier);
  const type =
    k > 1 ? { ...base, fontSize: base.fontSize * k, lineHeight: base.lineHeight * k } : base;
  const ink =
    color ??
    (tone === 'secondary' ? c.inkSecondary : tone === 'tertiary' ? c.inkTertiary : c.inkPrimary);
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
      style={[type, { color: ink }, align ? { textAlign: align } : null, style]}
    />
  );
}
