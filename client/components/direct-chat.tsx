import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from '@/components/chat/composer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { Banner } from '@/components/ui/banner';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import type { DirectMessageItem } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

// 没有推送通道,靠前台轮询拿对方的新消息;页面退出即停
const POLL_MS = 4000;

export function DirectChat({
  userId,
  username,
  keyboardOffset,
}: {
  userId: string;
  username: string;
  keyboardOffset?: number;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const myId = useAuthStore((s) => s.userId);

  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 乐观插入的临时消息在下一次轮询返回前保留,防止发送后闪没
  const optimistic = useRef<DirectMessageItem[]>([]);

  // Android + 带导航头的页面:KAV 计算不可靠,监听键盘高度手动垫底(同 AgentChat)
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
      const items = await api.listDirectMessages(userId);
      const got = new Set(items.map((i) => i.id));
      optimistic.current = optimistic.current.filter((m) => !got.has(m.id));
      setMessages([...optimistic.current, ...items]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [userId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    const temp: DirectMessageItem = {
      id: `local-${Date.now()}`,
      sender_id: myId ?? '',
      content: text,
      created_at: new Date().toISOString(),
    };
    optimistic.current = [temp, ...optimistic.current];
    setMessages((prev) => [temp, ...prev]);
    try {
      const saved = await api.sendDirectMessage(userId, text);
      optimistic.current = optimistic.current.filter((m) => m.id !== temp.id);
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? saved : m)));
      setError(null);
    } catch (e) {
      optimistic.current = optimistic.current.filter((m) => m.id !== temp.id);
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setDraft(text); // 发送失败把草稿还回去
      setError(e instanceof Error ? e.message : String(e));
      haptic.error();
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.flex,
        manualPad && kbVisible && { paddingBottom: Math.max(0, kbHeight - insets.bottom) },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : manualPad ? undefined : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? (keyboardOffset ?? 0) : 0}>
      <FlatList
        inverted={messages.length > 0}
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <EmptyState
            icon="person.2.fill"
            title={t.visit.dmEmptyTitle(username)}
            message={t.visit.dmEmptyHint}
          />
        }
        renderItem={({ item }) => <MessageBubble text={item.content} mine={item.sender_id === myId} />}
      />

      {error && <Banner tone="danger" message={error} style={styles.banner} />}

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={submit}
        placeholder={t.visit.dmPlaceholder(username)}
        disabled={sending}
        bottomInset={!kbVisible}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: 14, paddingVertical: 10, flexGrow: 1 },
  listEmpty: { justifyContent: 'center' },
  banner: { marginHorizontal: 12, marginBottom: 8 },
});
