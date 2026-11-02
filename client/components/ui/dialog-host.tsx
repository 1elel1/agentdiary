// 渲染 lib/dialog 队列里的第一个弹窗。挂在根布局里一次即可。

import { useEffect, useRef } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDialogStore, type DialogAction } from '@/lib/dialog';

const useNative = Platform.OS !== 'web';

export function DialogHost() {
  const current = useDialogStore((s) => s.queue[0]);
  const dismiss = useDialogStore((s) => s.dismiss);
  const { colors, isDark } = useTheme();
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
    scale.setValue(0.92);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: useNative, damping: 20, stiffness: 320 }),
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: useNative }),
    ]).start();
  }, [current?.id, current, scale, opacity]);

  if (!current) return null;

  const run = (action: DialogAction) => {
    dismiss(current.id);
    action.onPress?.();
  };

  const horizontal = current.actions.length === 2;
  const cardBg = isDark ? 'rgba(44,44,46,0.96)' : 'rgba(250,250,252,0.98)';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <Animated.View style={[styles.card, { backgroundColor: cardBg, opacity, transform: [{ scale }] }]}>
          <View style={styles.body}>
            <Text style={[Type.headline, styles.title, { color: colors.text }]}>{current.title}</Text>
            {current.message && (
              <Text style={[Type.footnote, styles.message, { color: colors.text }]}>{current.message}</Text>
            )}
          </View>
          <View style={[styles.actions, horizontal && styles.actionsRow, { borderTopColor: colors.separator }]}>
            {current.actions.map((a, i) => {
              const color = a.style === 'destructive' ? colors.danger : colors.tint;
              const weight = a.style === 'cancel' ? '600' : '400';
              return (
                <Pressable
                  key={a.label}
                  accessibilityRole="button"
                  onPress={() => run(a)}
                  style={({ pressed }) => [
                    styles.action,
                    horizontal ? styles.actionHalf : styles.actionFull,
                    i > 0 && (horizontal ? styles.actionLeftBorder : styles.actionTopBorder),
                    { borderColor: colors.separator },
                    pressed && { backgroundColor: colors.fill },
                  ]}>
                  <Text style={[Type.body, { color, fontWeight: weight }]} numberOfLines={1}>
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: 280, borderRadius: Radius.md, overflow: 'hidden' },
  body: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18, gap: 6 },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', lineHeight: 18 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth },
  actionsRow: { flexDirection: 'row' },
  action: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  actionHalf: { flex: 1 },
  actionFull: { width: '100%' },
  actionLeftBorder: { borderLeftWidth: StyleSheet.hairlineWidth },
  actionTopBorder: { borderTopWidth: StyleSheet.hairlineWidth },
});
