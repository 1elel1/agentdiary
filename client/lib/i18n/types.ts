// 语言设置的类型单独放,避免 settings-store 与 i18n 互相 import。

export type LanguageCode = 'zh-Hans' | 'zh-Hant' | 'en' | 'ja' | 'ko';
export type LanguageSetting = LanguageCode | 'system';

export const LANGUAGE_CODES: LanguageCode[] = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko'];

/** 各语言的自称,语言选择面板里永远用自称显示,不随当前界面语言翻译。 */
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};
