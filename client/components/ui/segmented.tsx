import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
}

/** iOS 分段控件:滑块用 spring 跟过去。 */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  style,
  size = 'md',
}: {
  options: SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md';
}) {
  const { colors, isDark } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const segment = width > 0 ? (width - 4) / options.length : 0;
  const x = useSharedValue(index * segment);

  useEffect(() => {
    x.value = withSpring(index * segment, { damping: 22, stiffness: 260, mass: 0.8 });
  }, [index, segment, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const height = size === 'sm' ? 32 : 38;

  return (
    <View
      style={[styles.track, { backgroundColor: colors.fill, height }, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {segment > 0 && (
        <Animated.View
          style={[
            styles.thumb,
            {
              width: segment,
              height: height - 4,
              backgroundColor: isDark ? colors.surfaceSecondary : colors.surface,
            },
            thumb,
          ]}
        />
      )}
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) {
                haptic.selection();
                onChange(o.key);
              }
            }}
            style={styles.segment}>
            <Text
              numberOfLines={1}
              style={[
                size === 'sm' ? Type.footnote : Type.subhead,
                { color: active ? colors.text : colors.textSecondary, fontWeight: active ? '600' : '500' },
              ]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: Radius.sm, padding: 2 },
  thumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    borderRadius: Radius.sm - 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
