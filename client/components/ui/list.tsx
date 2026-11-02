import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Radius, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

/** iOS 「设置」式的分组列表:标题 + 圆角卡片 + 行之间的内缩分隔线。 */
export function ListGroup({
  title,
  footer,
  children,
  style,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme, isDark } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]}>
      {title && (
        <Text style={[Type.footnote, styles.groupTitle, { color: colors.textSecondary }]}>
          {title}
        </Text>
      )}
      <View
        style={[
          styles.groupBody,
          { backgroundColor: colors.surface },
          cardShadow(scheme),
          isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
        ]}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {row}
            {i < rows.length - 1 && (
              <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            )}
          </Fragment>
        ))}
      </View>
      {footer && (
        <Text style={[Type.footnote, styles.groupFooter, { color: colors.textSecondary }]}>
          {footer}
        </Text>
      )}
    </View>
  );
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  chevron,
  destructive = false,
  right,
  disabled = false,
  accessory,
}: {
  icon?: IconSymbolName;
  /** 图标底色;不传则用强调色 */
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string | null;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  right?: ReactNode;
  disabled?: boolean;
  /** 右侧附件,如开关 */
  accessory?: ReactNode;
}) {
  const { colors } = useTheme();
  const showChevron = chevron ?? !!onPress;
  const titleColor = destructive ? colors.danger : colors.text;
  const content = (
    <>
      {icon && (
        <View style={[styles.iconBadge, { backgroundColor: iconColor ?? colors.tint }]}>
          <IconSymbol name={icon} size={16} color="#fff" weight="semibold" />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={[Type.body, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[Type.footnote, { color: colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {value !== undefined && value !== null && (
        <Text style={[Type.subhead, styles.value, { color: colors.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      )}
      {right}
      {accessory}
      {showChevron && <IconSymbol name="chevron.right" size={14} color={colors.textTertiary} />}
    </>
  );
  if (!onPress) {
    return <View style={[styles.row, disabled && styles.disabled]}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.fill },
        disabled && styles.disabled,
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 22 },
  groupTitle: { marginLeft: 16, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.3 },
  groupFooter: { marginHorizontal: 16, marginTop: 7 },
  groupBody: { borderRadius: Radius.md, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  disabled: { opacity: 0.45 },
  iconBadge: {
    width: 29,
    height: 29,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  value: { maxWidth: '45%' },
});
