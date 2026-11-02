import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** iOS 大标题页头:左侧标题(+副标题),右侧一排圆形图标按钮。 */
export function LargeHeader({
  title,
  subtitle,
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.header, style]}>
      <View style={styles.titles}>
        <Text style={[Type.largeTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[Type.subhead, styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right && <View style={styles.right}>{right}</View>}
    </View>
  );
}

export function SectionLabel({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <Text style={[Type.footnote, styles.section, { color: colors.textSecondary }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 12,
  },
  titles: { flex: 1 },
  subtitle: { marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  section: {
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
