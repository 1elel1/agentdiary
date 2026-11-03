import { kvGet, kvSet } from '@/lib/kv';
import { create } from 'zustand';

import type { BackgroundSetting } from '@/lib/backgrounds';
import type { LanguageSetting } from '@/lib/i18n/types';

const SETTINGS_KEY = 'agentdiary_appearance';

interface SettingsState {
  hydrated: boolean;
  // 私密日记手势锁图案("0-4-8" 点序;null = 未开启)。仅存本机。
  lockPattern: string | null;
  setLockPattern: (pattern: string | null) => Promise<void>;
  diaryBg: BackgroundSetting;
  chatBg: BackgroundSetting;
  // 界面语言:'system' = 跟随设备;化身回复也跟随它(请求头 X-Language)
  language: LanguageSetting;
  hydrate: () => Promise<void>;
  setDiaryBg: (bg: BackgroundSetting) => Promise<void>;
  setChatBg: (bg: BackgroundSetting) => Promise<void>;
  setLanguage: (language: LanguageSetting) => Promise<void>;
}

const DEFAULT: BackgroundSetting = { kind: 'default' };

async function persist(state: Pick<SettingsState, 'diaryBg' | 'chatBg' | 'lockPattern' | 'language'>) {
  const { diaryBg, chatBg, lockPattern, language } = state;
  await kvSet(SETTINGS_KEY, JSON.stringify({ diaryBg, chatBg, lockPattern, language }));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  diaryBg: DEFAULT,
  chatBg: DEFAULT,
  lockPattern: null,
  language: 'system',

  hydrate: async () => {
    try {
      const raw = await kvGet(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          diaryBg: parsed.diaryBg ?? DEFAULT,
          chatBg: parsed.chatBg ?? DEFAULT,
          lockPattern: parsed.lockPattern ?? null,
          language: parsed.language ?? 'system',
        });
      }
    } catch {
      // 设置损坏时静默回落默认
    } finally {
      set({ hydrated: true });
    }
  },

  setDiaryBg: async (bg) => {
    set({ diaryBg: bg });
    await persist(get());
  },

  setChatBg: async (bg) => {
    set({ chatBg: bg });
    await persist(get());
  },

  setLockPattern: async (pattern) => {
    set({ lockPattern: pattern });
    await persist(get());
  },

  setLanguage: async (language) => {
    set({ language });
    await persist(get());
  },
}));
