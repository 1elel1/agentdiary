// 与后端 server/app 各路由的传输类型保持一致

export type DiaryVisibility = 'public' | 'restricted' | 'private';

export interface DiaryEntry {
  id: string;
  content: string;
  visibility: DiaryVisibility;
  locked: boolean; // 手势锁标记(图案仅存客户端本机)
  created_at: string; // ISO 8601
  updated_at: string;
}

export interface AuthResponse {
  token: string;
  user_id: string;
  username: string;
  // 有值 = 有自定义头像(ISO 时间戳,兼作头像 URL 的缓存指纹)
  avatar_updated_at: string | null;
}

export interface UserSummary {
  id: string;
  username: string;
  card_count: number;
  is_builtin: boolean;
  status: string | null;
  avatar_updated_at: string | null;
  // 对外形象的单行摘要;null = 对方还没写
  persona_excerpt: string | null;
  // 兴趣标签(LLM 从卡片和对外形象提炼)
  tags: string[];
  // 推荐理由(只有「为你推荐」接口会填)
  reason: string | null;
  // 最近一次对话的预览(只有「最近对话」接口会填)
  last_message: string | null;
  last_at: string | null;
}

export interface TagCount {
  tag: string;
  count: number;
}

// 化身资料页:对外形象全文在这里
export interface UserProfile {
  id: string;
  username: string;
  is_builtin: boolean;
  card_count: number;
  status: string | null;
  persona: string | null;
  avatar_updated_at: string | null;
  tags: string[];
  // 名人化身与种子账号背后没有真人,不能解锁真人对话
  accepts_real_chat: boolean;
}

// 自己的对外形象
export interface PersonaOut {
  persona: string | null;
  updated_at: string | null;
  max_chars: number;
}

export interface ChatHistoryItem {
  id: string;
  role: 'user' | 'avatar';
  content: string;
  created_at: string;
}

export interface AvatarReply {
  id: string;
  content: string;
  created_at: string;
  // 回应引用了哪些人格卡片(可追溯性红线:卡片必须带出处)
  cited_card_ids: string[];
}

// AI 裁判:对「我与某化身的对话」的契合度评估;passed = 达到解锁门槛
export interface MatchReport {
  id: string;
  score: number; // 0~100
  summary: string;
  reasons: string[];
  passed: boolean;
  created_at: string;
}

export interface JudgeStatus {
  visitor_turns: number;
  min_turns: number;
  can_evaluate: boolean;
  unlocked: boolean; // 该用户对的真人对话是否已解锁
  report: MatchReport | null;
}

export interface DirectMessageItem {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

// 已解锁真人对话的会话条目(按最近往来排序)
export interface ConversationItem {
  user_id: string;
  username: string;
  avatar_updated_at: string | null;
  last_message: string | null;
  last_at: string | null;
}

export interface PersonaCard {
  id: string;
  assertion: string;
  confidence: number; // 0~1
  source_diary_id: string;
  superseded_by: string | null;
  created_at: string;
}
