/**
 * 设计令牌:颜色 / 字号 / 圆角 / 间距 / 阴影。
 *
 * 取 iOS 系统的分层逻辑(grouped background → surface → fill),配色用一套
 * 靛蓝强调色贯穿;所有页面只从这里取值,不在组件里写死 rgba。
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export type ColorScheme = 'light' | 'dark';

export const Palette = {
  light: {
    // 背景层级:页面底 → 卡片面 → 二级面 → 填充
    background: '#F2F2F7',
    surface: '#FFFFFF',
    surfaceSecondary: '#F2F2F7',
    fill: 'rgba(120,120,128,0.12)',
    fillStrong: 'rgba(120,120,128,0.20)',
    separator: 'rgba(60,60,67,0.14)',
    // 文字
    text: '#1C1C1E',
    textSecondary: 'rgba(60,60,67,0.62)',
    textTertiary: 'rgba(60,60,67,0.38)',
    placeholder: 'rgba(60,60,67,0.32)',
    // 强调色
    tint: '#5E5CE6',
    onTint: '#FFFFFF',
    tintSoft: 'rgba(94,92,230,0.12)',
    // 语义色
    success: '#34C759',
    warning: '#FF9F0A',
    danger: '#FF3B30',
    info: '#007AFF',
    // 聊天气泡
    bubbleMe: '#5E5CE6',
    bubbleOther: '#FFFFFF',
    // 图标与导航
    icon: '#8E8E93',
    tabBar: 'rgba(249,249,251,0.96)',
    tabIconDefault: '#8E8E93',
    tabIconSelected: '#5E5CE6',
    scrim: 'rgba(0,0,0,0.38)',
  },
  dark: {
    background: '#000000',
    surface: '#1C1C1E',
    surfaceSecondary: '#2C2C2E',
    fill: 'rgba(120,120,128,0.26)',
    fillStrong: 'rgba(120,120,128,0.38)',
    separator: 'rgba(84,84,88,0.55)',
    text: '#F2F2F7',
    textSecondary: 'rgba(235,235,245,0.62)',
    textTertiary: 'rgba(235,235,245,0.32)',
    placeholder: 'rgba(235,235,245,0.30)',
    tint: '#7D7AFF',
    onTint: '#FFFFFF',
    tintSoft: 'rgba(125,122,255,0.20)',
    success: '#30D158',
    warning: '#FFD60A',
    danger: '#FF453A',
    info: '#0A84FF',
    bubbleMe: '#6B69F2',
    bubbleOther: '#2C2C2E',
    icon: '#8E8E93',
    tabBar: 'rgba(20,20,22,0.96)',
    tabIconDefault: '#8E8E93',
    tabIconSelected: '#7D7AFF',
    scrim: 'rgba(0,0,0,0.6)',
  },
} as const;

/** 两套配色共用的键;值统一按 string 看待,组件不依赖具体色值字面量。 */
export type ThemeColors = { [K in keyof (typeof Palette)['light']]: string };

/** 兼容旧组件(themed-text / themed-view / use-theme-color)的命名。 */
export const Colors = Palette;

/** 字阶:对齐 iOS Dynamic Type 默认档。 */
export const Type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.2 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.2 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 23, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '500' },
} as const satisfies Record<string, TextStyle>;

export const Radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** 卡片阴影:浅色模式用柔和投影;深色模式靠表面明度分层,不加阴影。 */
export function cardShadow(scheme: ColorScheme): ViewStyle {
  if (scheme === 'dark') return {};
  return {
    shadowColor: '#1C1C3A',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  };
}

export function floatingShadow(scheme: ColorScheme): ViewStyle {
  return {
    shadowColor: scheme === 'dark' ? '#000' : '#2A2A5A',
    shadowOpacity: scheme === 'dark' ? 0.5 : 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  };
}

/**
 * Web 上 TextInput 聚焦会带浏览器默认的黑色描边,和我们自己画的聚焦色叠在一起;
 * 原生端没有这个属性,所以只在 Web 注入。RN 类型里没有 outlineStyle:'none',故断言。
 */
export const webNoOutline: TextStyle | undefined =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : undefined;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
