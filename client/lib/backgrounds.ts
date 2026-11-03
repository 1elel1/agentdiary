// 内置背景预设:低饱和渐变,浅色/深色模式各自适配,保持极简观感。
// Telegram 式思路:背景提供氛围,内容层(气泡/卡片)保持原样。
// 预设的显示名在字典里(t.appearance.presets[id]),这里只放颜色。

export interface BackgroundPreset {
  id: string;
  light: [string, string];
  dark: [string, string];
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'mist', light: ['#eef3f8', '#dce7f0'], dark: ['#161d24', '#0f141a'] },
  { id: 'dusk', light: ['#fdf0e7', '#f6e0d2'], dark: ['#241a14', '#170f0b'] },
  { id: 'moss', light: ['#eef5ec', '#dceadb'], dark: ['#16201a', '#0e1511'] },
  { id: 'night', light: ['#eceef8', '#dcdff0'], dark: ['#171a2b', '#0e101c'] },
  { id: 'sakura', light: ['#fbeff2', '#f3dde4'], dark: ['#231419', '#150c0f'] },
];

export type BackgroundSetting =
  | { kind: 'default' }
  | { kind: 'preset'; id: string }
  | { kind: 'custom'; uri: string };

export function presetById(id: string): BackgroundPreset | undefined {
  return BACKGROUND_PRESETS.find((p) => p.id === id);
}
