import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LargeHeader, SectionLabel } from '@/components/ui/large-header';
import { Pill } from '@/components/ui/pill';
import { ActionSheet } from '@/components/ui/sheet';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { kvGet, kvSet } from '@/lib/kv';
import type { UserSummary } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useProfileStore } from '@/stores/profile-store';

// 置顶的用户 id 列表(仅本机;长按行切换)
const PIN_KEY = 'agentdiary_chat_pins';

async function loadPins(): Promise<string[]> {
  try {
    const raw = await kvGet(PIN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function openChat(user: UserSummary) {
  router.push({
    pathname: '/visit/[userId]',
    params: {
      userId: user.id,
      username: user.username,
      builtin: user.is_builtin ? '1' : '',
      avatarTs: user.avatar_updated_at ?? '',
    },
  });
}

function metaLine(user: UserSummary): string {
  if (user.is_builtin) return '名人化身 · 由人物设定驱动';
  if (user.card_count > 0) return `${user.card_count} 张人格卡片`;
  return '化身尚未喂养';
}

function hintLine(user: UserSummary): string {
  if (user.status) return `今日:${user.status}`;
  if (user.persona_excerpt) return user.persona_excerpt;
  return '去和 TA 的化身聊聊';
}

function UserRow({
  user,
  pinned,
  onLongPress,
}: {
  user: UserSummary;
  pinned: boolean;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => openChat(user)}
      onLongPress={() => {
        haptic.medium();
        onLongPress();
      }}
      delayLongPress={320}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}>
      <Avatar username={user.username} userId={user.id} avatarTs={user.avatar_updated_at} size={50} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[Type.headline, styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {user.username}
          </Text>
          {pinned && <IconSymbol name="pin.fill" size={12} color={colors.textTertiary} />}
          <Text style={[Type.caption1, { color: colors.textTertiary }]} numberOfLines={1}>
            {metaLine(user)}
          </Text>
        </View>
        <Text
          style={[Type.subhead, { color: user.status ? colors.tint : colors.textSecondary }]}
          numberOfLines={1}>
          {hintLine(user)}
        </Text>
      </View>
      <IconSymbol name="chevron.right" size={14} color={colors.textTertiary} />
    </Pressable>
  );
}

function RowGroup({ users, pins, onLongPress }: { users: UserSummary[]; pins: string[]; onLongPress: (u: UserSummary) => void }) {
  const { colors } = useTheme();
  return (
    <Card padded={false} style={styles.group}>
      {users.map((u, i) => (
        <View key={u.id}>
          {i > 0 && <View style={[styles.separator, { backgroundColor: colors.separator }]} />}
          <UserRow user={u} pinned={pins.includes(u.id)} onLongPress={() => onLongPress(u)} />
        </View>
      ))}
    </Card>
  );
}

export default function ChatsScreen() {
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Redirect href="/login" />;
  }
  return <Chats />;
}

function Chats() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { username, userId, avatarTs } = useAuthStore();
  const { persona, cardCount, refresh: refreshProfile } = useProfileStore();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [pins, setPins] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionUser, setActionUser] = useState<UserSummary | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, savedPins] = await Promise.all([api.listUsers(), loadPins()]);
      setUsers(list);
      setPins(savedPins.filter((id) => list.some((u) => u.id === id)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshProfile(userId).catch(() => {});
    }, [refresh, refreshProfile, userId]),
  );

  const togglePin = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      kvSet(PIN_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const pinnedUsers = useMemo(
    () => pins.map((id) => users.find((u) => u.id === id)).filter((u): u is UserSummary => !!u),
    [pins, users],
  );
  const people = useMemo(
    () => users.filter((u) => !u.is_builtin && !pins.includes(u.id)),
    [users, pins],
  );
  const celebrities = useMemo(
    () => users.filter((u) => u.is_builtin && !pins.includes(u.id)),
    [users, pins],
  );

  const openSelf = () =>
    router.push({
      pathname: '/visit/[userId]',
      params: { userId: userId ?? '', username: username ?? '', builtin: '', avatarTs: avatarTs ?? '' },
    });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.textSecondary} />}>
        <LargeHeader
          title="对话"
          subtitle="和化身聊,聊得来再见真人"
          right={
            <IconButton
              name="person.2.fill"
              onPress={() => router.push('/real-chats')}
              accessibilityLabel="真人聊天"
            />
          }
        />

        {/* 我的化身:固定在最上面 */}
        <Card onPress={openSelf} style={styles.selfCard}>
          <View style={styles.selfTop}>
            <Avatar username={username ?? '我'} userId={userId} avatarTs={avatarTs} size={54} />
            <View style={styles.rowBody}>
              <Text style={[Type.headline, { color: colors.text }]}>我的化身</Text>
              <Text style={[Type.subhead, { color: colors.textSecondary }]} numberOfLines={1}>
                由你的日记喂养{cardCount ? ` · ${cardCount} 张人格卡片` : ' · 还没有人格卡片'}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.textTertiary} />
          </View>
          <View style={[styles.selfFooter, { borderTopColor: colors.separator }]}>
            <Pill
              label={persona ? '对外形象已设置' : '还没写对外形象'}
              tone={persona ? 'tint' : 'warning'}
              icon="person.text.rectangle.fill"
            />
            <Button
              title={persona ? '编辑' : '去写一段'}
              variant="ghost"
              size="sm"
              onPress={() => router.push('/persona-editor')}
              style={styles.selfAction}
            />
          </View>
        </Card>

        {error && <Banner tone="danger" message={error} actionLabel="重试" onAction={refresh} style={styles.banner} />}

        {pinnedUsers.length > 0 && (
          <>
            <SectionLabel>置顶</SectionLabel>
            <RowGroup users={pinnedUsers} pins={pins} onLongPress={setActionUser} />
          </>
        )}

        {people.length > 0 && (
          <>
            <SectionLabel>化身</SectionLabel>
            <RowGroup users={people} pins={pins} onLongPress={setActionUser} />
          </>
        )}

        {celebrities.length > 0 && (
          <>
            <SectionLabel>名人化身</SectionLabel>
            <RowGroup users={celebrities} pins={pins} onLongPress={setActionUser} />
          </>
        )}

        {loaded && users.length === 0 && !error && (
          <EmptyState icon="person.2.fill" title="还没有其他用户" message="等朋友也来写日记,这里就会出现 TA 的化身。" />
        )}
      </ScrollView>

      <ActionSheet
        visible={actionUser !== null}
        onClose={() => setActionUser(null)}
        title={actionUser?.username}
        actions={
          actionUser
            ? [
                {
                  label: pins.includes(actionUser.id) ? '取消置顶' : '置顶',
                  icon: pins.includes(actionUser.id) ? 'pin.slash.fill' : 'pin.fill',
                  onPress: () => togglePin(actionUser.id),
                },
                { label: '打开对话', icon: 'bubble.left.fill', onPress: () => openChat(actionUser) },
              ]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  selfCard: { marginHorizontal: 20, marginTop: 6, marginBottom: 20, padding: 0 },
  selfTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  selfFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selfAction: { paddingHorizontal: 8 },
  banner: { marginHorizontal: 20, marginBottom: 14 },
  group: { marginHorizontal: 20, marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { flexShrink: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 80 },
});
