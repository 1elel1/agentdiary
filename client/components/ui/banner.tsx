import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 行内提示条:离线、出错、说明。不打断流程,放在列表上方。 */
export function Banner({
  tone = 'info',
  message,
  actionLabel,
  onAction,
  style,
}: {
  tone?: 'info' | 'warning' | 'danger';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const fg = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.info;
  const bg =
    tone === 'danger'
      ? 'rgba(255,59,48,0.10)'
      : tone === 'warning'
        ? 'rgba(255,159,10,0.12)'
        : 'rgba(0,122,255,0.10)';
  const icon =
    tone === 'danger'
      ? 'exclamationmark.triangle.fill'
      : tone === 'warning'
        ? 'wifi.slash'
        : 'info.circle';
  return (
    <View style={[styles.banner, { backgroundColor: bg }, style]}>
      <IconSymbol name={icon} size={16} color={fg} />
      <Text style={[Type.footnote, styles.text, { color: colors.text }]}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[Type.footnote, { color: fg, fontWeight: '600' }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  text: { flex: 1 },
});
