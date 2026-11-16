// Text in one of the DESIGN.md 2.4 styles. Left-aligned by default; follows system text size up to
// each token's max scale.
import { Text, type TextProps, type TextStyle } from 'react-native';

import { typography, type TypeName } from './theme/typography';
import { useTheme } from './useTheme';

export interface TxtProps extends TextProps {
  variant?: TypeName;
  color?: string;
  /** Shortcut for the secondary and tertiary inks. */
  tone?: 'primary' | 'secondary' | 'tertiary';
  align?: TextStyle['textAlign'];
}

export function Txt({
  variant = 'body',
  color,
  tone = 'primary',
  align,
  style,
  ...rest
}: TxtProps) {
  const { c } = useTheme();
  const { maxFontSizeMultiplier, ...type } = typography[variant];
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
