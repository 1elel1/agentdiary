import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from '@/components/chat/composer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { Avatar } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useT } from '@/lib/i18n';

interface Message {
  id: string;
  text: string;
  from: 'me' | 'avatar';
}

export interface ChatAvatar {
  username: string;
  userId?: string | null;
  avatarTs?: string | null;
}

export function AgentChat({
  targetUserId,
  emptyTitle,
  emptyHint,
  avatar,
  keyboardOffset,
  onMessageSent,
  onHistoryLoaded,
  intro,
}: {
  targetUserId?: string;
  emptyTitle: string;
  emptyHint: string;
  avatar?: ChatAvatar;
  keyboardOffset?: number;
  // 一轮问答落库后回调(裁判入口用它刷新可评估的轮次数)
  onMessageSent?: () => void;
  // 历史拉到后回调条数(访问页据此决定自我介绍卡默认展开还是收起)
  onHistoryLoaded?: (count: number) => void;
  // 列表顶部的附加内容(对方的自我介绍卡)
  intro?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Android + 带导航头的页面(传了 keyboardOffset):KAV 在 react-native-screens
  // 的带头容器里计算不可靠(偏高/偏低反复),改为监听键盘高度手动垫底
  const manualPad = Platform.OS === 'android' && keyboardOffset !== undefined;
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const kbVisible = kbHeight > 0;

  const load = useCallback(async () => {
    try {
      const items = await api.getChatHistory(targetUserId);
      const mapped = items
        .map((i) => ({
          id: i.id,
          text: i.content,
          from: i.role === 'user' ? ('me' as const) : ('avatar' as const),
        }))
        .reverse();
      setMessages(mapped);
      setError(null);
      onHistoryLoaded?.(mapped.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
    // onHistoryLoaded 由父组件传入,不作为依赖,避免父组件重渲染时反复拉历史
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (text: string) => {
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    setError(null);
    const tempId = `me-${Date.now()}`;
    setMessages((prev) => [{ id: tempId, text, from: 'me' }, ...prev]);
    try {
      const reply = await api.sendToAgent(text, targetUserId);
      setMessages((prev) => [{ id: reply.id, text: reply.content, from: 'avatar' }, ...prev]);
      haptic.light();
      onMessageSent?.();
    } catch (e) {
      // 失败:撤回气泡、把草稿还回去,给一个重试入口
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      setError(e instanceof Error ? e.message : String(e));
      haptic.error();
    } finally {
      setSending(false);
    }
  };

  const avatarNode = avatar ? (
    <Avatar username={avatar.username} userId={avatar.userId} avatarTs={avatar.avatarTs} size={28} />
  ) : undefined;

  return (
    <KeyboardAvoidingView
      style={[
        styles.flex,
        manualPad && kbVisible && { paddingBottom: Math.max(0, kbHeight - insets.bottom) },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : manualPad ? undefined : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? (keyboardOffset ?? 0) : 0}>
      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          inverted={messages.length > 0}
          data={messages}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
          // inverted 列表的 footer 在视觉上方,正好放自我介绍卡
          ListFooterComponent={messages.length > 0 ? <View style={styles.intro}>{intro}</View> : null}
          ListEmptyComponent={
            <View>
              {intro && <View style={styles.intro}>{intro}</View>}
              <EmptyState icon="hand.wave.fill" title={emptyTitle} message={emptyHint} />
            </View>
          }
          renderItem={({ item }) => (
            <MessageBubble text={item.text} mine={item.from === 'me'} leading={avatarNode} />
          )}
        />
      )}

      {sending && <TypingIndicator hint={t.visit.typing} />}
      {error && (
        <Banner
          tone="danger"
          message={error}
          actionLabel={draft.trim() ? t.common.retry : undefined}
          onAction={() => send(draft.trim())}
          style={styles.banner}
        />
      )}

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => send(draft.trim())}
        placeholder={t.visit.inputPlaceholder}
        disabled={sending}
        bottomInset={!kbVisible}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 14, paddingVertical: 10, flexGrow: 1 },
  listEmpty: { justifyContent: 'center' },
  intro: { paddingBottom: 6 },
  banner: { marginHorizontal: 12, marginBottom: 8 },
});
