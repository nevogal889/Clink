// Buttons, chips and fields from DESIGN.md 2.6 and 4 ("Shared pieces").
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  TextInput,
  View,
  type AccessibilityState,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from './icons';
import { motion, radius, spacing, typography } from './theme';
import { Txt } from './Txt';
import { useReducedMotion, useTheme } from './useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with the motion.press scale (90 ms, 0.97). */
export function Press({
  style,
  scaleTo = motion.press.scale,
  children,
  ...rest
}: Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const scale = useState(() => new Animated.Value(1))[0];
  const to = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: motion.press.duration,
      easing: motion.press.easing,
      useNativeDriver: false,
    }).start();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      onPressIn={(e) => {
        if (!reduced && !rest.disabled) to(scaleTo);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        rest.onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Fill and text; cobalt by default (DESIGN.md 2.3 rule 1). */
  fill?: string;
  ink?: string;
  icon?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/** Primary button: 56 high, full width inside the gutters, label type. */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  fill,
  ink,
  icon,
  testID,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { c, mode } = useTheme();
  const bg = fill ?? c.cobalt;
  const fg = ink ?? c.onCobalt;
  const off = disabled || busy;
  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={[
        {
          minHeight: spacing.primaryButton,
          borderRadius: radius.button,
          borderCurve: 'continuous',
          backgroundColor: disabled ? c.surfaceSunk : bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.s5,
          gap: spacing.s2,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon}
      <Txt
        variant="label"
        color={disabled ? (mode === 'dark' ? c.inkTertiary : c.inkSecondary) : fg}
      >
        {label}
      </Txt>
    </Press>
  );
}

/** Text button: 44 high, label type in cobalt (or danger). */
export function TextButton({
  label,
  onPress,
  danger,
  small,
  disabled,
  testID,
  accessibilityLabel,
  color,
  align = 'flex-start',
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  small?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  color?: string;
  align?: ViewStyle['alignSelf'];
}) {
  const { c } = useTheme();
  return (
    <Press
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={{
        minHeight: spacing.textButton,
        justifyContent: 'center',
        alignSelf: align,
        paddingHorizontal: spacing.s1,
      }}
    >
      <Txt
        variant={small ? 'caption' : 'label'}
        color={disabled ? c.inkTertiary : (color ?? (danger ? c.danger : c.cobalt))}
      >
        {label}
      </Txt>
    </Press>
  );
}

/** Tonal button: cobalt tint fill, cobalt label (Make it yours, Add). */
export function TonalButton({
  label,
  onPress,
  testID,
  accessibilityLabel,
  icon,
  align = 'flex-start',
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  icon?: IconName;
  /** alignSelf: 'center' inside rows, 'flex-start' in columns. */
  align?: ViewStyle['alignSelf'];
}) {
  const { c } = useTheme();
  return (
    <Press
      testID={testID}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={4}
      style={{
        minHeight: 36,
        paddingHorizontal: spacing.s3,
        borderRadius: radius.chip,
        borderCurve: 'continuous',
        backgroundColor: c.cobaltTint,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.s1,
        alignSelf: align,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={c.cobalt} /> : null}
      <Txt variant="caption" color={c.cobalt} style={{ fontFamily: 'Archivo-SemiBold' }}>
        {label}
      </Txt>
    </Press>
  );
}

/**
 * A chip. On neutral surfaces the selection is cobalt; on a category tint it is ink.primary with
 * surface.base text, so it never fights the category colour (DESIGN.md 2.3 rule 7). Selected
 * chips in "any" fields carry a check glyph so selection is not colour alone.
 */
export function Chip({
  label,
  selected,
  onPress,
  onTint,
  check,
  leading,
  height = 40,
  testID,
  accessibilityLabel,
  accessibilityRole = 'button',
  fillSelected,
  inkSelected,
  lines = 1,
  fill,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  onTint?: boolean;
  check?: boolean;
  leading?: (color: string) => ReactNode;
  height?: number;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'radio' | 'checkbox' | 'tab';
  fillSelected?: string;
  inkSelected?: string;
  /** Lines the label may take before it truncates. Raise it where a chip must stay readable at
   * the largest text sizes instead of cutting its name (the flare panel's category chips). */
  lines?: number;
  /** Grows to share its row with its siblings, label centred (the timing pills). */
  fill?: boolean;
}) {
  const { c } = useTheme();
  const selFill = fillSelected ?? (onTint ? c.inkPrimary : c.cobalt);
  const selInk = inkSelected ?? (onTint ? c.surfaceBase : c.onCobalt);
  const ink = selected ? selInk : onTint ? c.inkPrimary : c.inkPrimary;
  const border = onTint ? c.inkSecondary : c.lineControl;
  const state: AccessibilityState =
    accessibilityRole === 'checkbox' ? { checked: selected } : { selected };
  return (
    <Press
      testID={testID}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      hitSlop={(44 - height) / 2 > 0 ? (44 - height) / 2 : 0}
      style={{
        // minHeight, so the label grows with the text size instead of spilling out (chips wrap).
        minHeight: height,
        // A chip that may wrap its label also stays inside its row.
        maxWidth: lines > 1 ? '100%' : undefined,
        flexGrow: fill ? 1 : undefined,
        justifyContent: fill ? 'center' : undefined,
        paddingHorizontal: fill ? spacing.s3 : spacing.s4,
        paddingVertical: spacing.s1,
        borderRadius: radius.chip,
        borderCurve: 'continuous',
        borderWidth: selected ? 0 : 1,
        borderColor: border,
        backgroundColor: selected ? selFill : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {selected && check ? <Icon name="check" size={16} color={selInk} /> : null}
      {leading ? leading(ink) : null}
      <Txt
        variant="callout"
        color={ink}
        style={{ fontFamily: 'Archivo-Medium', flexShrink: 1 }}
        numberOfLines={lines}
      >
        {label}
      </Txt>
    </Press>
  );
}

/** Text field: filled surface.sunk on iOS, outlined on Android (DESIGN.md 2.6). */
export function Field({
  value,
  onChangeText,
  placeholder,
  maxLength,
  countFrom,
  multiline,
  testID,
  accessibilityLabel,
  error,
  leading,
  onTint,
  style,
  ...rest
}: TextInputProps & {
  maxLength: number;
  /** Show the remaining count once the text reaches this length. */
  countFrom?: number;
  error?: boolean;
  leading?: ReactNode;
  onTint?: boolean;
}) {
  const { c } = useTheme();
  const length = Array.from(value ?? '').length;
  const showCount = countFrom !== undefined && length >= countFrom;
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: multiline ? 88 : 48,
          borderRadius: radius.field,
          borderCurve: 'continuous',
          backgroundColor: onTint ? 'transparent' : c.surfaceSunk,
          borderWidth: error ? 2 : onTint ? 1 : 0,
          borderColor: error ? c.danger : onTint ? c.inkSecondary : 'transparent',
          paddingHorizontal: spacing.s3,
          gap: spacing.s2,
        }}
      >
        {leading}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={(v) => onChangeText?.(Array.from(v).slice(0, maxLength).join(''))}
          placeholder={placeholder}
          placeholderTextColor={c.inkTertiary}
          accessibilityLabel={accessibilityLabel ?? placeholder}
          multiline={multiline}
          maxFontSizeMultiplier={typography.body.maxFontSizeMultiplier}
          style={[
            {
              flex: 1,
              fontFamily: typography.body.fontFamily,
              fontSize: typography.body.fontSize,
              color: c.inkPrimary,
              paddingVertical: spacing.s3,
              minHeight: multiline ? 88 : 48,
              textAlignVertical: multiline ? 'top' : 'center',
              outlineStyle: 'none',
            } as never,
            style,
          ]}
          {...rest}
        />
      </View>
      {showCount ? (
        <Txt variant="caption" tone="tertiary" align="right" style={{ marginTop: spacing.s1 }}>
          {String(maxLength - length)}
        </Txt>
      ) : null}
    </View>
  );
}

/** A plain icon button with a 44/48 target. */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  color,
  size = 24,
  disc,
  testID,
  accessibilityState,
}: {
  name: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
  disc?: string;
  testID?: string;
  accessibilityState?: AccessibilityState;
}) {
  const { c } = useTheme();
  return (
    <Press
      testID={testID}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={{
        width: spacing.target,
        height: spacing.target,
        borderRadius: spacing.target / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: disc,
      }}
    >
      <Icon name={name} size={size} color={color ?? c.inkPrimary} />
    </Press>
  );
}
