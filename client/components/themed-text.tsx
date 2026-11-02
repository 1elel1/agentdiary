import { StyleSheet, Text, type TextProps } from 'react-native';

import { Type } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

/** 带主题色的 Text。新代码优先直接用 Text + Type 令牌;此组件保留给旧用法。 */
export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const tint = useThemeColor({}, 'tint');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? Type.body : undefined,
        type === 'title' ? Type.largeTitle : undefined,
        type === 'defaultSemiBold' ? styles.semiBold : undefined,
        type === 'subtitle' ? Type.title3 : undefined,
        type === 'link' ? [Type.body, { color: tint }] : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  semiBold: { ...Type.body, fontWeight: '600' },
});
