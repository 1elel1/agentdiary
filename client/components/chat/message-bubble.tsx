import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 聊天气泡。mine = 自己说的(右侧强调色),否则是对方/化身(左侧表面色)。 */
export function MessageBubble({
  text,
  mine,
  leading,
}: {
  text: string;
  mine: boolean;
  /** 左侧附件,通常是化身头像 */
  leading?: ReactNode;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
      {!mine && leading}
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: colors.bubbleMe, borderBottomRightRadius: 6 }
            : {
                backgroundColor: colors.bubbleOther,
                borderBottomLeftRadius: 6,
                borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
                borderColor: colors.separator,
                shadowColor: '#000',
                shadowOpacity: isDark ? 0 : 0.04,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
              },
        ]}>
        <Text style={[Type.callout, styles.text, { color: mine ? colors.onTint : colors.text }]} selectable>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 3 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: { lineHeight: 22 },
});
