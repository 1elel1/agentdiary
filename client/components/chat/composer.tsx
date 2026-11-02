import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Radius, Type, webNoOutline } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

/** 输入条:多行胶囊输入框 + 圆形发送键。 */
export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled = false,
  bottomInset = true,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
  /** 是否垫底部安全区(键盘弹起时由父级 KAV 接管) */
  bottomInset?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  const canSend = value.trim().length > 0 && !disabled;

  const send = () => {
    if (!canSend) return;
    haptic.light();
    onSend();
  };

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(242,242,247,0.92)',
          borderTopColor: colors.separator,
          paddingBottom: bottomInset ? Math.max(insets.bottom, 10) : 10,
        },
      ]}>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: focused ? colors.tint : colors.separator,
          },
        ]}>
        <TextInput
          style={[Type.callout, styles.input, webNoOutline, { color: colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.tint}
          value={value}
          onChangeText={onChange}
          multiline
          maxLength={2000}
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // Web 上回车发送、Shift+回车换行;原生端回车即换行,靠按钮发送
          onKeyPress={
            Platform.OS === 'web'
              ? (e) => {
                  const ev = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                  if (ev.key === 'Enter' && !ev.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }
              : undefined
          }
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发送"
          disabled={!canSend}
          onPress={send}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: canSend ? colors.tint : colors.fillStrong, opacity: pressed ? 0.8 : 1 },
          ]}>
          <IconSymbol name="arrow.up" size={17} color={canSend ? colors.onTint : colors.textTertiary} weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    minHeight: 44,
    paddingLeft: 14,
    paddingRight: 5,
    paddingVertical: 5,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    maxHeight: 128,
    paddingVertical: Platform.OS === 'ios' ? 7 : 4,
    paddingHorizontal: 0,
    lineHeight: 21,
  },
  send: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
