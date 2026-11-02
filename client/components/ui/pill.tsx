import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PillTone = 'neutral' | 'tint' | 'success' | 'warning' | 'danger' | 'info';

/** 小标签:可见性、同步状态、分数等。 */
export function Pill({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: PillTone;
  icon?: IconSymbolName;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const tones: Record<PillTone, { bg: string; fg: string }> = {
    neutral: { bg: colors.fill, fg: colors.textSecondary },
    tint: { bg: colors.tintSoft, fg: colors.tint },
    success: { bg: 'rgba(52,199,89,0.14)', fg: colors.success },
    warning: { bg: 'rgba(255,159,10,0.16)', fg: colors.warning },
    danger: { bg: 'rgba(255,59,48,0.14)', fg: colors.danger },
    info: { bg: 'rgba(0,122,255,0.14)', fg: colors.info },
  };
  const { bg, fg } = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      {icon && <IconSymbol name={icon} size={11} color={fg} weight="bold" />}
      <Text style={[Type.caption2, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
});
