import { Palette, type ColorScheme, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  isDark: boolean;
}

/** 当前配色方案下的全部令牌。组件里统一用它,不直接读 Palette。 */
export function useTheme(): Theme {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, colors: Palette[scheme], isDark: scheme === 'dark' };
}
