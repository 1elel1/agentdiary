// 自己的化身资料(状态 / 对外形象 / 卡片数)的轻缓存:
// 「我」页、对话页的「我的化身」卡片、编辑器都读它,改完立即同步,不用各自再拉。

import { create } from 'zustand';

import { api } from '@/lib/api';

interface ProfileState {
  loaded: boolean;
  status: string | null;
  persona: string | null;
  personaUpdatedAt: string | null;
  personaMaxChars: number;
  cardCount: number;
  refresh: (userId: string | null) => Promise<void>;
  savePersona: (persona: string | null) => Promise<void>;
  saveStatus: (status: string | null) => Promise<void>;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  loaded: false,
  status: null,
  persona: null,
  personaUpdatedAt: null,
  personaMaxChars: 600,
  cardCount: 0,

  refresh: async (userId) => {
    const [personaRes, statusRes, profileRes] = await Promise.allSettled([
      api.getMyPersona(),
      api.getMyStatus(),
      userId ? api.getProfile(userId) : Promise.reject(new Error('no user')),
    ]);
    set((s) => ({
      loaded: true,
      persona: personaRes.status === 'fulfilled' ? personaRes.value.persona : s.persona,
      personaUpdatedAt:
        personaRes.status === 'fulfilled' ? personaRes.value.updated_at : s.personaUpdatedAt,
      personaMaxChars:
        personaRes.status === 'fulfilled' ? personaRes.value.max_chars : s.personaMaxChars,
      status: statusRes.status === 'fulfilled' ? statusRes.value.status : s.status,
      cardCount: profileRes.status === 'fulfilled' ? profileRes.value.card_count : s.cardCount,
    }));
  },

  savePersona: async (persona) => {
    const res = await api.setPersona(persona);
    set({ persona: res.persona, personaUpdatedAt: res.updated_at });
  },

  saveStatus: async (status) => {
    const res = await api.setStatus(status);
    set({ status: res.status });
  },

  reset: () =>
    set({ loaded: false, status: null, persona: null, personaUpdatedAt: null, cardCount: 0 }),
}));
