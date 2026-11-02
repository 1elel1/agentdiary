// 九宫格手势锁:纯 RN 自绘(PanResponder),零新依赖。
// 手指划过的点按顺序连成图案,松手回调 onComplete("0-4-8" 形式)。

import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const GRID = 240;
const CELL = GRID / 3;
const HIT_RADIUS = 32;
export const MIN_DOTS = 4;

function dotCenter(index: number) {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function PatternLock({
  onComplete,
  disabled = false,
}: {
  // 松手时回调;少于 MIN_DOTS 个点不回调(误触)
  onComplete: (pattern: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number[]>([]);
  const selRef = useRef<number[]>([]);
  // PanResponder 只创建一次,会永久捕获首次渲染的闭包;
  // 回调与 disabled 走 ref,保证多步骤流程(绘制→确认)拿到最新逻辑
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const tryAdd = (x: number, y: number) => {
    for (let i = 0; i < 9; i++) {
      if (selRef.current.includes(i)) continue;
      const c = dotCenter(i);
      if (Math.hypot(x - c.x, y - c.y) <= HIT_RADIUS) {
        selRef.current = [...selRef.current, i];
        setSelected(selRef.current);
        return;
      }
    }
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderGrant: (e) => {
        selRef.current = [];
        setSelected([]);
        tryAdd(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e) => {
        tryAdd(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderRelease: () => {
        const pattern = selRef.current;
        selRef.current = [];
        setSelected([]);
        if (pattern.length >= MIN_DOTS) {
          onCompleteRef.current(pattern.join('-'));
        }
      },
    }),
  ).current;

  return (
    <View style={styles.grid} {...responder.panHandlers}>
      {Array.from({ length: 9 }, (_, i) => {
        const c = dotCenter(i);
        const active = selected.includes(i);
        return (
          <View key={i} style={[styles.halo, { left: c.x - 24, top: c.y - 24 }, active && { backgroundColor: colors.tintSoft }]}>
            <View
              style={[
                styles.dot,
                { borderColor: active ? colors.tint : colors.fillStrong, backgroundColor: active ? colors.tint : colors.surface },
              ]}>
              {active && <View style={styles.dotInner} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { width: GRID, height: GRID, alignSelf: 'center' },
  halo: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
});
