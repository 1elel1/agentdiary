import { create } from 'zustand';

import { api, ApiError } from '@/lib/api';
import { getDict } from '@/lib/i18n';
import {
  loadCache,
  loadQueue,
  type PendingDiary,
  saveCache,
  saveQueue,
} from '@/lib/offline-queue';
import type { DiaryEntry, DiaryVisibility } from '@/lib/types';

// 刚保存的那篇:列表页据此显示一次「已保存」横幅(私密 / 不用于化身 / 离线),看过即清
export interface LastSaved {
  visibility: DiaryVisibility;
  useForTwin: boolean;
  offline: boolean;
  at: number;
}

interface DiaryState {
  entries: DiaryEntry[];
  pending: PendingDiary[];
  loading: boolean;
  error: string | null;
  lastSaved: LastSaved | null;
  clearLastSaved: () => void;
  refresh: () => Promise<void>;
  add: (
    content: string,
    visibility: DiaryVisibility,
    allowedUserIds: string[],
    useForTwin?: boolean,
  ) => Promise<void>;
  // 训练闸门:关 = 化身立刻忘掉这篇;开 = 重新学习
  setUseForTwin: (id: string, useForTwin: boolean) => Promise<void>;
  setVisibility: (
    id: string,
    visibility: DiaryVisibility,
    allowedUserIds?: string[],
  ) => Promise<void>;
  cycleVisibility: (id: string) => Promise<void>;
  edit: (id: string, content: string) => Promise<void>;
  setLocked: (id: string, locked: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const isNetworkError = (e: unknown) => !(e instanceof ApiError);

export const useDiaryStore = create<DiaryState>((set, get) => ({
  entries: [],
  pending: [],
  loading: false,
  error: null,
  lastSaved: null,
  clearLastSaved: () => set({ lastSaved: null }),

  refresh: async () => {
    set({ loading: true, error: null });
    let queue = await loadQueue();
    if (queue.length > 0) {
      const remaining: PendingDiary[] = [];
      for (const item of queue) {
        try {
          await api.createDiary(item.content, item.visibility, item.allowed_user_ids, item.use_for_twin ?? true);
        } catch {
          remaining.push(item);
        }
      }
      queue = remaining;
      await saveQueue(queue);
    }
    try {
      const entries = await api.listDiaries();
      await saveCache(entries);
      set({ entries, pending: queue, loading: false });
    } catch {
      const cached = (await loadCache()) as DiaryEntry[];
      set({
        entries: cached,
        pending: queue,
        loading: false,
        error: getDict().errors.offlineCache,
      });
    }
  },

  add: async (content, visibility, allowedUserIds, useForTwin = true) => {
    try {
      const entry = await api.createDiary(content, visibility, allowedUserIds, useForTwin);
      set({
        entries: [entry, ...get().entries],
        lastSaved: { visibility, useForTwin, offline: false, at: Date.now() },
      });
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      const item: PendingDiary = {
        local_id: `local-${Date.now()}`,
        content,
        visibility,
        allowed_user_ids: allowedUserIds,
        use_for_twin: useForTwin,
        created_at: new Date().toISOString(),
      };
      const queue = [...get().pending, item];
      await saveQueue(queue);
      set({ pending: queue, lastSaved: { visibility, useForTwin, offline: true, at: Date.now() } });
    }
  },

  setUseForTwin: async (id, useForTwin) => {
    const updated = await api.setDiaryUseForTwin(id, useForTwin);
    const entries = get().entries.map((e) => (e.id === id ? updated : e));
    await saveCache(entries);
    set({ entries });
  },

  setVisibility: async (id, visibility, allowedUserIds) => {
    if (id.startsWith('local-')) {
      const queue = get().pending.map((p) =>
        p.local_id === id
          ? {
              ...p,
              visibility,
              allowed_user_ids:
                visibility === 'restricted' ? (allowedUserIds ?? p.allowed_user_ids) : [],
            }
          : p,
      );
      await saveQueue(queue);
      set({ pending: queue });
      return;
    }

    const updated = await api.setDiaryVisibility(id, visibility, allowedUserIds);
    const entries = get().entries.map((e) => (e.id === id ? updated : e));
    await saveCache(entries);
    set({ entries });
  },

  cycleVisibility: async (id: string) => {
    const entry = get().entries.find((e) => e.id === id);
    if (!entry) return;
    const order: DiaryVisibility[] = ['public', 'restricted', 'private'];
    const next = order[(order.indexOf(entry.visibility) + 1) % order.length];
    await get().setVisibility(id, next);
  },

  // 手势锁开关(独立于可见性)
  setLocked: async (id: string, locked: boolean) => {
    const updated = await api.setDiaryLocked(id, locked);
    const entries = get().entries.map((e) => (e.id === id ? updated : e));
    await saveCache(entries);
    set({ entries });
  },

  // 修改日记内容(24h 窗口由后端强制校验);成功后替换本地条目
  edit: async (id: string, content: string) => {
    const updated = await api.updateDiary(id, content);
    const entries = get().entries.map((e) => (e.id === id ? updated : e));
    await saveCache(entries);
    set({ entries });
  },

  remove: async (id: string) => {
    if (id.startsWith('local-')) {
      const queue = get().pending.filter((p) => p.local_id !== id);
      await saveQueue(queue);
      set({ pending: queue });
      return;
    }
    await api.deleteDiary(id);
    const entries = get().entries.filter((e) => e.id !== id);
    await saveCache(entries);
    set({ entries });
  },
}));
