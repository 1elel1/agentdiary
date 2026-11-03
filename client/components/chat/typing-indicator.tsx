import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function Dot({ delay, color }: { delay: number; color: string }) {
  const v = useSharedValue(0.3);
  // 系统开了「减弱动态效果」就不呼吸,静态三点
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) {
      v.value = 0.6;
      return;
    }
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 320, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.3, { duration: 320, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, v, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: (1 - v.value) * 3 }],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** 「对方正在输入」:三个呼吸点 + 一句说明。 */
export function TypingIndicator({ hint }: { hint?: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: colors.bubbleOther, borderColor: colors.separator, borderWidth: isDark ? StyleSheet.hairlineWidth : 0 },
        ]}>
        <Dot delay={0} color={colors.textTertiary} />
        <Dot delay={140} color={colors.textTertiary} />
        <Dot delay={280} color={colors.textTertiary} />
      </View>
      {hint && <Text style={[Type.caption1, { color: colors.textTertiary }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});
