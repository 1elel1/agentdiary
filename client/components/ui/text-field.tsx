import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Radius, Type, webNoOutline } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextInputProps & {
  label?: string;
  icon?: IconSymbolName;
  containerStyle?: StyleProp<ViewStyle>;
  right?: ReactNode;
  /** 放在白色卡片上时用 'fill',放在页面底色上时用 'surface' */
  tone?: 'fill' | 'surface';
  error?: string | null;
};

/** 单行输入框:填充底色 + 聚焦描边。 */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, icon, containerStyle, right, tone = 'surface', error, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={containerStyle}>
      {label && (
        <Text style={[Type.footnote, styles.label, { color: colors.textSecondary }]}>{label}</Text>
      )}
      <View
        style={[
          styles.field,
          {
            backgroundColor: tone === 'fill' ? colors.fill : colors.surface,
            borderColor: error ? colors.danger : focused ? colors.tint : 'transparent',
          },
        ]}>
        {icon && (
          <IconSymbol name={icon} size={18} color={focused ? colors.tint : colors.textTertiary} />
        )}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.tint}
          style={[Type.body, styles.input, webNoOutline, { color: colors.text }, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {right}
      </View>
      {error && <Text style={[Type.caption1, styles.error, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
});

/** 多行输入:同样的填充风格,高度随内容。 */
export const TextArea = forwardRef<TextInput, Props & { minHeight?: number }>(function TextArea(
  { label, containerStyle, tone = 'surface', error, style, minHeight = 120, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={containerStyle}>
      {label && (
        <Text style={[Type.footnote, styles.label, { color: colors.textSecondary }]}>{label}</Text>
      )}
      <TextInput
        ref={ref}
        multiline
        textAlignVertical="top"
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.tint}
        style={[
          Type.body,
          styles.area,
          webNoOutline,
          {
            minHeight,
            color: colors.text,
            backgroundColor: tone === 'fill' ? colors.fill : colors.surface,
            borderColor: error ? colors.danger : focused ? colors.tint : 'transparent',
          },
          style,
        ]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {error && <Text style={[Type.caption1, styles.error, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: 6, marginLeft: 4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: Radius.sm + 2,
    borderWidth: 1.5,
  },
  // minWidth 0:Web 上 flex 子项默认 min-width:auto,输入框会把右侧图标挤出容器
  input: { flex: 1, minWidth: 0, paddingVertical: 0, lineHeight: undefined },
  area: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  error: { marginTop: 6, marginLeft: 4 },
});
