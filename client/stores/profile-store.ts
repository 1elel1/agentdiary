// 自己的化身资料(状态 / 对外形象 / 化身学到的理解)的轻缓存:
// 「我」页、对话页的「我的化身」卡片、编辑器都读它,改完立即同步,不用各自再拉。

import { create } from 'zustand';

import { api } from '@/lib/api';
import type { PersonaCard } from '@/lib/types';

interface ProfileState {
  loaded: boolean;
  status: string | null;
  persona: string | null;
  personaUpdatedAt: string | null;
  personaMaxChars: number;
  // 化身学到的理解(人格卡片)。数量不是「养成进度」,界面上按性质说明:在用几条、几条待确认
  cards: PersonaCard[];
  cardCount: number; // 有效卡片总数(含待确认)
  inUseCount: number; // 化身真正在用的:稳定 + 近期状态 + 早期未分类
  pendingCount: number; // 推测类,等用户确认或排除
  refresh: (userId: string | null) => Promise<void>;
  savePersona: (persona: string | null) => Promise<void>;
  saveStatus: (status: string | null) => Promise<void>;
  excludeCard: (id: string) => Promise<void>;
  reset: () => void;
}

function summarize(cards: PersonaCard[]) {
  const active = cards.filter((c) => !c.superseded_by);
  const pendingCount = active.filter((c) => c.kind === 'guess').length;
  return { cards, cardCount: active.length, inUseCount: active.length - pendingCount, pendingCount };
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  loaded: false,
  status: null,
  persona: null,
  personaUpdatedAt: null,
  personaMaxChars: 600,
  cards: [],
  cardCount: 0,
  inUseCount: 0,
  pendingCount: 0,

  refresh: async () => {
    const [personaRes, statusRes, cardsRes] = await Promise.allSettled([
      api.getMyPersona(),
      api.getMyStatus(),
      api.listPersonaCards(),
    ]);
    set((s) => ({
      loaded: true,
      persona: personaRes.status === 'fulfilled' ? personaRes.value.persona : s.persona,
      personaUpdatedAt:
        personaRes.status === 'fulfilled' ? personaRes.value.updated_at : s.personaUpdatedAt,
      personaMaxChars:
        personaRes.status === 'fulfilled' ? personaRes.value.max_chars : s.personaMaxChars,
      status: statusRes.status === 'fulfilled' ? statusRes.value.status : s.status,
      ...(cardsRes.status === 'fulfilled' ? summarize(cardsRes.value) : null),
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

  excludeCard: async (id) => {
    await api.deletePersonaCard(id);
    set(summarize(get().cards.filter((c) => c.id !== id)));
  },

  reset: () =>
    set({
      loaded: false,
      status: null,
      persona: null,
      personaUpdatedAt: null,
      cards: [],
      cardCount: 0,
      inUseCount: 0,
      pendingCount: 0,
    }),
}));
