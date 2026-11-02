import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSoft';
type Size = 'sm' | 'md' | 'lg';

const HEIGHT: Record<Size, number> = { sm: 36, md: 46, lg: 52 };
const FONT: Record<Size, TextStyle> = { sm: Type.subhead, md: Type.headline, lg: Type.headline };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconSize,
  style,
  textStyle,
  fullWidth = false,
  haptics = true,
  children,
}: {
  title?: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconSymbolName;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
  haptics?: boolean;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.tint, fg: colors.onTint },
    secondary: { bg: colors.tintSoft, fg: colors.tint },
    ghost: { bg: 'transparent', fg: colors.tint },
    danger: { bg: colors.danger, fg: '#fff' },
    dangerSoft: { bg: 'rgba(255,59,48,0.12)', fg: colors.danger },
  };
  const { bg, fg } = palette[variant];
  const height = HEIGHT[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        if (haptics) haptic.light();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          borderRadius: size === 'sm' ? Radius.pill : Radius.md,
          paddingHorizontal: size === 'sm' ? 14 : 20,
          backgroundColor: bg,
          opacity: inactive ? 0.45 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed && !inactive ? 0.985 : 1 }],
        },
        fullWidth && styles.fullWidth,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && (
            <IconSymbol
              name={icon}
              size={iconSize ?? (size === 'sm' ? 15 : 18)}
              color={fg}
              weight="semibold"
            />
          )}
          {title !== undefined && (
            <Text style={[FONT[size], { color: fg }, styles.label, textStyle]} numberOfLines={1}>
              {title}
            </Text>
          )}
          {children}
        </>
      )}
    </Pressable>
  );
}

/** 圆形图标按钮:页头右侧动作、关闭、更多。 */
export function IconButton({
  name,
  onPress,
  size = 20,
  active = false,
  tone = 'default',
  accessibilityLabel,
  style,
  disabled,
}: {
  name: IconSymbolName;
  onPress?: () => void;
  size?: number;
  active?: boolean;
  tone?: 'default' | 'plain' | 'tint';
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const bg = tone === 'plain' ? 'transparent' : tone === 'tint' ? colors.tint : colors.fill;
  const fg = tone === 'tint' ? colors.onTint : active ? colors.tint : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        haptic.selection();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}>
      <IconSymbol name={name} size={size} color={fg} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  fullWidth: { alignSelf: 'stretch' },
  label: { fontWeight: '600' },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
