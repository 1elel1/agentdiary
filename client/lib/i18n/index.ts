// 多语言:字典按语言切换,简体中文是主字典,其余四种的类型从它推导。
// 组件里用 useT();非组件代码(store、工具函数)用 getDict()。
// 请求头 X-Language 由 lib/api.ts 在每次请求时读 getLanguage(),化身据此选择回复语言。
// 不依赖 expo-localization(原生依赖,OTA 推不出去),系统语言靠 Intl / navigator 判断。

import { useSettingsStore } from '@/stores/settings-store';

import { en } from './en';
import { ja } from './ja';
import { ko } from './ko';
import { LANGUAGE_CODES, type LanguageCode, type LanguageSetting } from './types';
import { zhHans, type Dict } from './zh-Hans';
import { zhHant } from './zh-Hant';

export { LANGUAGE_CODES, LANGUAGE_NAMES } from './types';
export type { Dict, LanguageCode, LanguageSetting };

const DICTS: Record<LanguageCode, Dict> = {
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  en,
  ja,
  ko,
};

/** 设备语言 → 支持的五种之一;认不出来就简体中文。 */
export function detectSystemLanguage(): LanguageCode {
  let locale = '';
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
  } catch {
    locale = '';
  }
  if (!locale && typeof navigator !== 'undefined') locale = navigator.language ?? '';
  const l = locale.toLowerCase();
  if (l.startsWith('zh')) {
    return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
  }
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('ko')) return 'ko';
  if (l.startsWith('en')) return 'en';
  return 'zh-Hans';
}

export function resolveLanguage(setting: LanguageSetting): LanguageCode {
  if (setting === 'system') return detectSystemLanguage();
  return LANGUAGE_CODES.includes(setting) ? setting : 'zh-Hans';
}

/** 当前生效的语言代码(非组件代码用)。 */
export function getLanguage(): LanguageCode {
  return resolveLanguage(useSettingsStore.getState().language);
}

/** 当前字典(非组件代码用:store、工具函数、弹窗默认按钮)。 */
export function getDict(): Dict {
  return DICTS[getLanguage()];
}

export function useLanguage(): LanguageCode {
  const setting = useSettingsStore((s) => s.language);
  return resolveLanguage(setting);
}

/** 组件里取文案:const t = useT(); t.diary.title。语言一变自动重渲染。 */
export function useT(): Dict {
  return DICTS[useLanguage()];
}
