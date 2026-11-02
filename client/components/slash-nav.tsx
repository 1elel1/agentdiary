/**
 * 底部条纹导航:静止时只是一道纹理,按下才浮出标签,横划像切水果一样斩过条纹。
 *
 * 三条设计约束,都不是随意的:
 *
 * 1. **点按也能用**。划动是快捷方式不是唯一路径——纯手势导航 VoiceOver 读不出来,
 *    也不符合「导航应可预期」。点一下条纹直接进入,零视觉代价换回可访问性。
 * 2. **标签按需出现**。静止时不显示任何其他界面的信息(保持安静),手指一按下才
 *    淡入,松手即隐去。可发现性不靠常驻元素解决。
 * 3. **离底边留出空间**。iOS 在屏幕最下沿约 20pt 保留 Home Indicator 手势,
 *    条纹压太低横划会被系统吞掉。
 *
 * 刀光不用 SVG(项目没装 react-native-svg,不值得为此加依赖):用一个定长的
 * Animated.View 池,每个 View 是相邻两个触点之间的一段——定位在中点、宽度取两点
 * 距离、旋转取 atan2,透明度按新旧衰减。够定长是关键,不做环形复用会越积越卡。
 */

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type NavItem = { key: string; label: string };

const SPRING = { damping: 22, stiffness: 220 };
// 刀光段数。太少会断成虚线,太多在低端机上掉帧;16 段在 120Hz 下够连续
const TRAIL = 16;
const BAR_HEIGHT = 56;
// 条纹静止高度;当前页那根更高一点,是唯一的「你在哪」提示
const STRIPE_H = 16;
const STRIPE_H_ACTIVE = 26;
const STRIPE_W = 3;
// 非当前页的条纹靠 scaleY 压短,而不是改 height——变换走 GPU,不触发布局
const MIN_SCALE = STRIPE_H / STRIPE_H_ACTIVE;
// 高于 Home Indicator 手势区(约 20pt),否则横划会被系统吞掉
const BOTTOM_GAP = 22;

type Props = {
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
};

export function SlashNav({ items, activeKey, onSelect }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const dark = scheme === 'dark';

  // 触摸态:驱动标签淡入和条纹「醒来」,0→1
  const awake = useSharedValue(0);
  // 刀光轨迹:每段一组 {x, y, angle, len},unused 时 len=0 不渲染
  const trail = useSharedValue(
    Array.from({ length: TRAIL }, () => ({ x: 0, y: 0, angle: 0, len: 0 })),
  );
  const head = useSharedValue(0); // 环形缓冲写指针
  const lastX = useSharedValue(-1);
  const lastY = useSharedValue(0);
  const cutIndex = useSharedValue(-1); // 最后划中的条纹

  // 条纹的横向中心:等距铺满,两端留边
  const centers = useMemo(() => {
    const pad = width * 0.18;
    const span = width - pad * 2;
    const step = items.length > 1 ? span / (items.length - 1) : 0;
    return items.map((_, i) => pad + step * i);
  }, [width, items]);

  const tick = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const commit = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) onSelect(item.key);
    },
    [items, onSelect],
  );

  const pan = Gesture.Pan()
    // 不能用 minDistance(0):Pan 会在触地瞬间激活,把子级 Pressable 的点按吞掉,
    // 于是「点一下条纹进入」这条可访问路径就废了。留 8px 余量,短按落到 Pressable,
    // 真的横划才起刀。onBegin 在激活前就触发,所以按下发亮的反馈不受影响。
    .minDistance(8)
    .onBegin((e) => {
      awake.value = withTiming(1, { duration: 140 });
      lastX.value = e.x;
      lastY.value = e.y;
      cutIndex.value = -1;
    })
    .onUpdate((e) => {
      const dx = e.x - lastX.value;
      const dy = e.y - lastY.value;
      const len = Math.sqrt(dx * dx + dy * dy);
      // 小于 2px 的抖动不入轨迹,否则刀光会抖成噪点
      if (len >= 2) {
        const i = head.value % TRAIL;
        const next = [...trail.value];
        next[i] = {
          x: (e.x + lastX.value) / 2,
          y: (e.y + lastY.value) / 2,
          angle: Math.atan2(dy, dx),
          len,
        };
        trail.value = next;
        head.value = head.value + 1;
        lastX.value = e.x;
        lastY.value = e.y;
      }
      // 判定划中:手指横坐标落在某根条纹的命中带内
      for (let i = 0; i < centers.length; i++) {
        if (Math.abs(e.x - centers[i]) < 26 && cutIndex.value !== i) {
          cutIndex.value = i;
          runOnJS(tick)();
          break;
        }
      }
    })
    .onFinalize(() => {
      awake.value = withTiming(0, { duration: 260 });
      trail.value = trail.value.map((s) => ({ ...s, len: 0 }));
      if (cutIndex.value >= 0) {
        runOnJS(commit)(cutIndex.value);
        cutIndex.value = -1;
      }
    });

  const labelStyle = useAnimatedStyle(() => ({
    opacity: awake.value,
    transform: [{ translateY: (1 - awake.value) * 6 }],
  }));

  return (
    // pointerEvents 走 style 而非 props:props 形式已废弃,会刷警告
    <View style={[styles.root, { bottom: insets.bottom + BOTTOM_GAP }]}>
      {/* 标签层:静止时完全透明,不占据视觉 */}
      <Animated.View style={[styles.labels, labelStyle]}>
        {items.map((item, i) => (
          <Text
            key={item.key}
            style={[
              styles.label,
              {
                left: centers[i] - 40,
                color: item.key === activeKey ? Colors[scheme].tint : Colors[scheme].icon,
              },
            ]}>
            {item.label}
          </Text>
        ))}
      </Animated.View>

      <GestureDetector gesture={pan}>
        <View style={styles.bar}>
          {items.map((item, i) => (
            <Stripe
              key={item.key}
              index={i}
              center={centers[i]}
              active={item.key === activeKey}
              awake={awake}
              cutIndex={cutIndex}
              dark={dark}
              tint={Colors[scheme].tint}
              // 点按是可靠路径:VoiceOver 能聚焦,不熟悉手势的人也能用
              onPress={() => onSelect(item.key)}
              label={item.label}
            />
          ))}
          {Array.from({ length: TRAIL }, (_, i) => (
            <TrailSegment key={i} index={i} trail={trail} dark={dark} />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

function Stripe({
  index,
  center,
  active,
  awake,
  cutIndex,
  dark,
  tint,
  onPress,
  label,
}: {
  index: number;
  center: number;
  active: boolean;
  awake: SharedValue<number>;
  cutIndex: SharedValue<number>;
  dark: boolean;
  tint: string;
  onPress: () => void;
  label: string;
}) {
  // active 状态**不进 worklet**。试过 shared value + useEffect 同步,实测在
  // 本项目(app.json 开了 reactCompiler)下 useAnimatedStyle 的闭包不随重渲染
  // 刷新——表现为切页后 aria-selected 变了、亮度和长短卡在上一页。
  // 所以分工:静态样式管「在哪一页」,animated 只管手势叠加,两层相乘。
  const restStyle = {
    opacity: active ? 0.55 : 0.2,
    transform: [{ scaleY: active ? 1 : MIN_SCALE }],
  };

  // 手势唤醒:嵌套一层,opacity 和 scaleY 都是相乘,叠在静态层之上
  const wake = useAnimatedStyle(() => ({
    opacity: 1 + awake.value * 0.8,
    transform: [{ scaleY: 1 + awake.value * 0.12 }],
  }));

  // 被划中时上下两半弹开再合拢——「切断」的实感,靠位移不靠换图
  const halfUpper = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(cutIndex.value === index ? -5 : 0, SPRING) }],
  }));
  const halfLower = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(cutIndex.value === index ? 5 : 0, SPRING) }],
  }));

  const color = active ? tint : dark ? '#ECEDEE' : '#11181C';
  const h = STRIPE_H_ACTIVE / 2; // 固定高度,长短差异交给 scaleY

  return (
    // 必须是两层嵌套而不是一个 style 数组:同数组里后者直接覆盖前者的
    // opacity/transform,只有嵌套才是相乘。外层静态(在哪一页),内层动画(手势)
    <View style={[styles.stripeWrap, { left: center - 22 }, restStyle]}>
      <Animated.View style={[styles.fill, wake]}>
        <Pressable
          style={styles.stripeHit}
          onPress={onPress}
          accessibilityRole="tab"
          // 两个都要:accessibilityState 给原生,aria-selected 给 RNW——
          // 实测 RNW 0.21 不会把 accessibilityState 翻成 aria-selected,
          // 只写前者的话网页端读屏播报不出「当前在哪一页」
          accessibilityState={{ selected: active }}
          aria-selected={active}
          accessibilityLabel={label}>
          <Animated.View
            style={[
              styles.stripeHalf,
              {
                height: h,
                backgroundColor: color,
                borderTopLeftRadius: 2,
                borderTopRightRadius: 2,
              },
              halfUpper,
            ]}
          />
          <Animated.View
            style={[
              styles.stripeHalf,
              {
                height: h,
                backgroundColor: color,
                borderBottomLeftRadius: 2,
                borderBottomRightRadius: 2,
              },
              halfLower,
            ]}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function TrailSegment({
  index,
  trail,
  dark,
}: {
  index: number;
  trail: SharedValue<{ x: number; y: number; angle: number; len: number }[]>;
  dark: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const seg = trail.value[index];
    if (!seg || seg.len === 0) return { opacity: 0, width: 0 };
    return {
      opacity: 0.9,
      width: seg.len + 2,
      transform: [
        { translateX: seg.x - (seg.len + 2) / 2 },
        { translateY: seg.y - 2 },
        { rotateZ: `${seg.angle}rad` },
      ],
    };
  });
  const blade = dark
    ? (['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)'] as const)
    : (['rgba(10,126,164,0)', 'rgba(10,126,164,0.9)', 'rgba(10,126,164,0)'] as const);

  return (
    <Animated.View style={[styles.trailSeg, style]}>
      <LinearGradient
        colors={blade}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, pointerEvents: 'box-none' },
  labels: {
    position: 'absolute',
    bottom: BAR_HEIGHT - 6,
    left: 0,
    right: 0,
    height: 20,
    pointerEvents: 'none',
  },
  label: {
    position: 'absolute',
    width: 80,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  bar: { height: BAR_HEIGHT, justifyContent: 'center' },
  stripeWrap: { position: 'absolute', top: 0, height: BAR_HEIGHT, width: 44 },
  fill: { flex: 1 },
  // 命中区做满 44×56:手指目标不能只有 3px 宽
  stripeHit: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 0 },
  stripeHalf: { width: STRIPE_W },
  trailSeg: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 4,
    borderRadius: 2,
    pointerEvents: 'none',
  },
});
