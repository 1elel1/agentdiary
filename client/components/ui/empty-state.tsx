import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 空状态:图标 + 标题 + 一句说明 + 可选动作。 */
export function EmptyState({
  icon,
  title,
  message,
  action,
  style,
}: {
  icon: IconSymbolName;
  title: string;
  message?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.tintSoft }]}>
        <IconSymbol name={icon} size={30} color={colors.tint} />
      </View>
      <Text style={[Type.headline, styles.title, { color: colors.text }]}>{title}</Text>
      {message && (
        <Text style={[Type.subhead, styles.message, { color: colors.textSecondary }]}>{message}</Text>
      )}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 36, paddingVertical: 32 },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', marginTop: 6 },
  action: { marginTop: 18 },
});
