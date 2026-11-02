import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

/** 白色/深灰表面卡片。传 onPress 变成可点按(带按压反馈)。 */
export function Card({
  children,
  style,
  onPress,
  onLongPress,
  padded = true,
  tone = 'surface',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  padded?: boolean;
  tone?: 'surface' | 'tint' | 'fill';
}) {
  const { colors, scheme, isDark } = useTheme();
  const bg =
    tone === 'tint' ? colors.tintSoft : tone === 'fill' ? colors.fill : colors.surface;
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { backgroundColor: bg },
    tone === 'surface' && cardShadow(scheme),
    tone === 'surface' && isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
    padded && styles.padded,
    style,
  ];
  if (!onPress && !onLongPress) {
    return <View style={base}>{children}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => {
        haptic.medium();
        onLongPress?.();
      }}
      delayLongPress={320}
      style={({ pressed }) => [base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, overflow: 'visible' },
  padded: { padding: 16 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.992 }] },
});
