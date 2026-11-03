// 离线日记队列:断网时日记先落本地文件,恢复后由 diary-store 补传。
// 原生端用 expo-file-system(APK 原生层已有);Web 端文件系统不可用,降级走 kv(localStorage)。

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { kvGet, kvSet } from './kv';
import type { DiaryVisibility } from './types';

const isWeb = Platform.OS === 'web';

const QUEUE_FILE = `${FileSystem.documentDirectory}pending-diaries.json`;
const CACHE_FILE = `${FileSystem.documentDirectory}diaries-cache.json`;
const QUEUE_KV_KEY = 'agentdiary_pending_diaries';
const CACHE_KV_KEY = 'agentdiary_diaries_cache';

export interface PendingDiary {
  local_id: string;
  content: string;
  visibility: DiaryVisibility;
  allowed_user_ids: string[];
  // 训练闸门(旧队列没有这个字段 = true)
  use_for_twin?: boolean;
  created_at: string; // 本地落笔时间
}

async function readJson<T>(path: string, kvKey: string, fallback: T): Promise<T> {
  try {
    if (isWeb) {
      const raw = await kvGet(kvKey);
      return raw ? (JSON.parse(raw) as T) : fallback;
    }
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, kvKey: string, value: unknown): Promise<void> {
  try {
    if (isWeb) {
      await kvSet(kvKey, JSON.stringify(value));
      return;
    }
    await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
  } catch {
    // 持久化失败不阻塞主流程(内存态仍然正确)
  }
}

export const loadQueue = () => readJson<PendingDiary[]>(QUEUE_FILE, QUEUE_KV_KEY, []);

export const saveQueue = (queue: PendingDiary[]) => writeJson(QUEUE_FILE, QUEUE_KV_KEY, queue);

// 服务器日记列表的本地缓存:离线时也能翻看
export const loadCache = () => readJson<unknown[]>(CACHE_FILE, CACHE_KV_KEY, []);

export const saveCache = (entries: unknown[]) => writeJson(CACHE_FILE, CACHE_KV_KEY, entries);
