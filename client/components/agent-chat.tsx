import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from '@/components/chat/composer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { Avatar } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  starters,
  startersTitle,
}: {
  targetUserId?: string;
  emptyTitle: string;
  emptyHint: string;
  avatar?: ChatAvatar;
  keyboardOffset?: number;
  // 自聊:测试型开场问题。空会话时列出三个,有历史后收成输入条上方的一排,随时能「再问一个能验证我的问题」
  starters?: string[];
  startersTitle?: string;
  // 一轮问答落库后回调(裁判入口用它刷新可评估的轮次数)
  onMessageSent?: () => void;
  // 历史拉到后回调条数(访问页据此决定自我介绍卡默认展开还是收起)
  onHistoryLoaded?: (count: number) => void;
  // 列表顶部的附加内容(对方的自我介绍卡)
  intro?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { colors } = useTheme();

  const [messages, setMessages] = useState<Message[]>([]);
  // 开场问题每次展示三个,「换一批」轮转
  const [starterPage, setStarterPage] = useState(0);
  const visibleStarters = useMemo(() => {
    if (!starters?.length) return [];
    const start = (starterPage * 3) % starters.length;
    return [0, 1, 2].map((i) => starters[(start + i) % starters.length]).filter((q, i, arr) => arr.indexOf(q) === i);
  }, [starters, starterPage]);
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
              {visibleStarters.length > 0 && (
                <View style={styles.starterBlock}>
                  {startersTitle && (
                    <Text style={[Type.footnote, styles.starterTitle, { color: colors.textSecondary }]}>{startersTitle}</Text>
                  )}
                  {visibleStarters.map((q) => (
                    <Pressable
                      key={q}
                      disabled={sending}
                      onPress={() => send(q)}
                      style={({ pressed }) => [
                        styles.starterCard,
                        { backgroundColor: colors.surface, borderColor: colors.separator, opacity: pressed ? 0.7 : 1 },
                      ]}>
                      <IconSymbol name="sparkles" size={14} color={colors.tint} />
                      <Text style={[Type.subhead, styles.starterText, { color: colors.text }]}>{q}</Text>
                    </Pressable>
                  ))}
                  <Button
                    title={t.chats.shuffle}
                    variant="ghost"
                    size="sm"
                    icon="arrow.triangle.2.circlepath"
                    onPress={() => setStarterPage((p) => p + 1)}
                    style={styles.starterShuffle}
                  />
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <MessageBubble text={item.text} mine={item.from === 'me'} leading={avatarNode} />
          )}
        />
      )}

      {sending && <TypingIndicator hint={t.visit.typing} />}
      {visibleStarters.length > 0 && messages.length > 0 && !sending && (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.starterStrip}>
          {visibleStarters.map((q) => (
            <Pressable
              key={q}
              onPress={() => send(q)}
              style={({ pressed }) => [styles.starterChip, { backgroundColor: colors.tintSoft, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[Type.footnote, { color: colors.tint, fontWeight: '600' }]} numberOfLines={1}>
                {q}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.chats.shuffle}
            onPress={() => setStarterPage((p) => p + 1)}
            style={({ pressed }) => [styles.starterChip, styles.starterMore, { backgroundColor: colors.fill, opacity: pressed ? 0.7 : 1 }]}>
            <IconSymbol name="arrow.triangle.2.circlepath" size={13} color={colors.textSecondary} weight="semibold" />
          </Pressable>
        </ScrollView>
      )}
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
  starterBlock: { paddingHorizontal: 22, gap: 8, marginTop: -8 },
  starterTitle: { marginBottom: 2, marginLeft: 2 },
  starterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  starterText: { flex: 1 },
  starterShuffle: { alignSelf: 'center', marginTop: 2 },
  starterStrip: { paddingHorizontal: 12, paddingBottom: 8, gap: 8, alignItems: 'center' },
  starterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, maxWidth: 260 },
  starterMore: { paddingHorizontal: 10 },
});
