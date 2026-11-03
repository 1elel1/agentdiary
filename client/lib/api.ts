// 后端 API 客户端。客户端不做任何模型逻辑,不直接调用 LLM(密钥安全红线)。
// 本机开发时 EXPO_PUBLIC_API_URL 用电脑局域网 IP;发布版走云端后端(见 eas.json)。

import type {
  AuthResponse,
  AvatarReply,
  ChatHistoryItem,
  ConversationItem,
  DiaryEntry,
  DiaryVisibility,
  DirectMessageItem,
  JudgeStatus,
  PersonaCard,
  PersonaOut,
  TagCount,
  UserProfile,
  UserSummary,
} from './types';

import { getDict, getLanguage } from './i18n';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// 自定义头像 URL;ts(avatar_updated_at)作缓存指纹,换头像后自动刷新
export function avatarUrl(userId: string, ts: string): string {
  return `${BASE_URL}/users/${userId}/avatar?t=${encodeURIComponent(ts)}`;
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

// 401 全局处理:token 失效(过期/被吊销/账号变动)时自动登出跳登录页,
// 而不是把未授权误报成"离线"。auth 路径自身除外,防递归。
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // 界面语言;后端据此决定化身用哪种语言回复
    'X-Language': getLanguage(),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { headers, ...init });
  } catch (e) {
    // RN 的网络层失败一律是 "Network request failed",不带地址,排查时
    // 完全看不出连的是哪儿、是明文被拦还是服务器没起。把地址带上。
    // 常见成因:Android 9+ 禁止明文 HTTP、后端没起、地址写错、证书无效。
    throw new ApiError(0, getDict().errors.cannotReach(BASE_URL, (e as Error).message));
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    onUnauthorized?.();
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // 非 JSON 错误体,保留状态码
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  // 「门面」:名人化身 + 我聊过的人。不再罗列全站用户;找人用搜索,认识新人用推荐
  listUsers: () => request<UserSummary[]>('/users'),

  // 按用户名搜索(包含匹配,最多 20 条)
  searchUsers: (q: string) => request<UserSummary[]>(`/users/search?q=${encodeURIComponent(q)}`),

  // 为你推荐:按兴趣标签重合 + 资料完整度 + 活跃度打分,带推荐理由;seed 换一批,tag 只看某个标签
  recommendedUsers: (opts: { limit?: number; tag?: string | null; seed?: number } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', String(opts.limit ?? 8));
    if (opts.tag) params.set('tag', opts.tag);
    if (opts.seed) params.set('seed', String(opts.seed));
    return request<UserSummary[]>(`/users/recommended?${params.toString()}`);
  },

  // 热门兴趣标签(筛选条)
  listTags: () => request<TagCount[]>('/users/tags'),

  // 最近和哪些化身聊过(带最后一句预览)
  recentContacts: () => request<UserSummary[]>('/users/recent'),

  listDiaries: () => request<DiaryEntry[]>('/diaries'),

  createDiary: (
    content: string,
    visibility: DiaryVisibility = 'public',
    allowedUserIds: string[] = [],
  ) =>
    request<DiaryEntry>('/diaries', {
      method: 'POST',
      body: JSON.stringify({
        content,
        visibility,
        allowed_user_ids: allowedUserIds,
      }),
    }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    }),

  // 注销账号:日记、人格卡片、对话记录、头像一并删除,不可恢复。
  // Apple 审核指南 5.1.1(v) 要求可在 App 内自助注销。
  deleteAccount: (password: string) =>
    request<{ deleted: string }>('/users/me', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),

  changeUsername: (username: string) =>
    request<{ username: string }>('/users/me/username', {
      method: 'PUT',
      body: JSON.stringify({ username }),
    }),

  uploadAvatar: (imageBase64: string) =>
    request<{ avatar_updated_at: string }>('/users/me/avatar', {
      method: 'PUT',
      body: JSON.stringify({ image_base64: imageBase64 }),
    }),

  setStatus: (status: string | null) =>
    request<{ status: string | null }>('/users/me/status', {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  getMyStatus: () => request<{ status: string | null }>('/users/me/status'),

  // 对外形象:写给来访者看、也注入化身 prompt 的自我介绍。null/空串 = 清除
  getMyPersona: () => request<PersonaOut>('/users/me/persona'),

  setPersona: (persona: string | null) =>
    request<PersonaOut>('/users/me/persona', {
      method: 'PUT',
      body: JSON.stringify({ persona }),
    }),

  // 某个化身的资料(含对外形象全文);自己看自己也走这里
  getProfile: (userId: string) => request<UserProfile>(`/users/${userId}/profile`),

  // 自己的人格卡片(带出处日记 id,可追溯)
  listPersonaCards: () => request<PersonaCard[]>('/persona-cards'),

  // 手动重跑一篇日记的蒸馏(先清旧产物)
  redistillDiary: (id: string) =>
    request<{ status: string; diary_id: string }>(`/diaries/${id}/distill`, { method: 'POST' }),

  setDiaryVisibility: (id: string, visibility: DiaryVisibility, allowedUserIds?: string[]) =>
    request<DiaryEntry>(`/diaries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        visibility,
        allowed_user_ids: allowedUserIds ?? null,
      }),
    }),

  setDiaryLocked: (id: string, locked: boolean) =>
    request<DiaryEntry>(`/diaries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ locked }),
    }),

  // 修改日记内容(仅限落笔 24 小时内,后端强制校验)
  updateDiary: (id: string, content: string) =>
    request<DiaryEntry>(`/diaries/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  getDiaryAllowed: (id: string) =>
    request<{ allowed_user_ids: string[]; allowed_users: { id: string; username: string }[] }>(
      `/diaries/${id}/allowed`,
    ),

  // 删除日记会在后端级联删除衍生的对话对与人格卡片(隐私红线)
  deleteDiary: (id: string) =>
    request<{ deleted: string }>(`/diaries/${id}`, { method: 'DELETE' }),

  // targetUserId 不传 = 和自己的化身聊;传 = 访问该用户的化身
  sendToAgent: (message: string, targetUserId?: string) =>
    request<AvatarReply>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, target_user_id: targetUserId ?? null }),
    }),

  getChatHistory: (targetUserId?: string) =>
    request<ChatHistoryItem[]>(
      targetUserId ? `/chat/history?target_user_id=${targetUserId}` : '/chat/history',
    ),

  // AI 裁判:评估我与该用户化身的对话契合度;达标解锁真人对话
  getJudgeStatus: (targetUserId: string) => request<JudgeStatus>(`/judge/${targetUserId}`),

  evaluateMatch: (targetUserId: string) =>
    request<JudgeStatus>(`/judge/${targetUserId}/evaluate`, { method: 'POST' }),

  // 已解锁真人对话的会话列表(最近往来在前)
  listConversations: () => request<ConversationItem[]>('/dm'),

  // 真人对话(裁判解锁后);列表为新→旧,直接喂 inverted FlatList
  listDirectMessages: (userId: string) => request<DirectMessageItem[]>(`/dm/${userId}`),

  sendDirectMessage: (userId: string, content: string) =>
    request<DirectMessageItem>(`/dm/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};
