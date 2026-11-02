import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

const useNative = Platform.OS !== 'web';

/**
 * 底部弹层:遮罩淡入 + 面板上滑。三端一致(RN 的 Modal 在 Web 可用,动画自己做)。
 * 面板内容由调用方决定;ActionSheet 是它最常用的皮。
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  contentStyle,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: useNative,
        damping: 26,
        stiffness: 300,
        mass: 0.9,
      }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 170, useNativeDriver: useNative }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
  }, [visible, progress]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
        </Animated.View>
        <Animated.View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              transform: [{ translateY }],
            },
          ]}>
          <View style={[styles.grabber, { backgroundColor: colors.fillStrong }]} />
          {title && <Text style={[Type.headline, styles.title, { color: colors.text }]}>{title}</Text>}
          <View style={contentStyle}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface SheetAction {
  label: string;
  icon?: IconSymbolName;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** 右侧补充说明 */
  detail?: string;
}

/** 动作面板:一组可点的行 + 取消。替代系统 ActionSheet,Web 也能用。 */
export function ActionSheet({
  visible,
  onClose,
  title,
  message,
  actions,
  header,
  cancelLabel = '取消',
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions: SheetAction[];
  header?: ReactNode;
  cancelLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {message && (
        <Text style={[Type.footnote, styles.message, { color: colors.textSecondary }]}>{message}</Text>
      )}
      {header}
      <View style={[styles.actionGroup, { backgroundColor: colors.surfaceSecondary }]}>
        {actions.map((a, i) => (
          <View key={a.label}>
            {i > 0 && <View style={[styles.separator, { backgroundColor: colors.separator }]} />}
            <Pressable
              disabled={a.disabled}
              onPress={() => {
                haptic.selection();
                onClose();
                // 等面板收起再执行,避免连开两个 Modal 互相打架
                setTimeout(a.onPress, 180);
              }}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && { backgroundColor: colors.fill },
                a.disabled && { opacity: 0.4 },
              ]}>
              {a.icon && (
                <IconSymbol
                  name={a.icon}
                  size={20}
                  color={a.destructive ? colors.danger : colors.tint}
                />
              )}
              <Text
                style={[
                  Type.body,
                  styles.actionLabel,
                  { color: a.destructive ? colors.danger : colors.text },
                ]}>
                {a.label}
              </Text>
              {a.detail && (
                <Text style={[Type.subhead, { color: colors.textSecondary }]}>{a.detail}</Text>
              )}
            </Pressable>
          </View>
        ))}
      </View>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [
          styles.cancel,
          { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text style={[Type.headline, { color: colors.tint }]}>{cancelLabel}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: Radius.xl + 2,
    borderTopRightRadius: Radius.xl + 2,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '88%',
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 12 },
  title: { textAlign: 'center', marginBottom: 12 },
  message: { textAlign: 'center', marginBottom: 12, paddingHorizontal: 12 },
  actionGroup: { borderRadius: Radius.md, overflow: 'hidden' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  actionLabel: { flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  cancel: {
    marginTop: 10,
    minHeight: 54,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
