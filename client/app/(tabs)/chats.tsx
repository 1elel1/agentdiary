import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LargeHeader, SectionLabel } from '@/components/ui/large-header';
import { Pill } from '@/components/ui/pill';
import { TextField } from '@/components/ui/text-field';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { formatRecent } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useT, type Dict } from '@/lib/i18n';
import type { TagCount, UserSummary } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useProfileStore } from '@/stores/profile-store';

// 发现页不再罗列全站用户:找具体的人靠搜索,认识新人靠推荐(标签重合 + 活跃度,
// 带可验证的理由),名人化身固定垫底做门面。

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

function metaLine(user: UserSummary, t: Dict): string {
  if (user.is_builtin) return t.chats.celebrity;
  if (user.card_count > 0) return t.common.cards(user.card_count);
  return t.chats.notFed;
}

function PersonRow({
  user,
  hint,
  hintIcon,
  hintTint = false,
  showTags = false,
  trailing,
}: {
  user: UserSummary;
  hint?: string | null;
  hintIcon?: 'sparkles' | 'bubble.left.fill' | 'face.smiling';
  hintTint?: boolean;
  showTags?: boolean;
  trailing?: string | null;
}) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <Pressable
      onPress={() => openChat(user)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}>
      <Avatar username={user.username} userId={user.id} avatarTs={user.avatar_updated_at} size={50} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[Type.headline, styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {user.username}
          </Text>
          {trailing ? (
            <Text style={[Type.caption1, { color: colors.textTertiary }]} numberOfLines={1}>
              {trailing}
            </Text>
          ) : null}
        </View>
        {hint ? (
          <View style={styles.hintRow}>
            {hintIcon && (
              <IconSymbol name={hintIcon} size={12} color={hintTint ? colors.tint : colors.textTertiary} />
            )}
            <Text
              style={[Type.subhead, styles.hintText, { color: hintTint ? colors.tint : colors.textSecondary }]}
              numberOfLines={1}>
              {hint}
            </Text>
          </View>
        ) : null}
        {/* 标签和「几条理解」放到底行,别和名字抢同一行(窄屏、多语言下会互相截断) */}
        {((showTags && user.tags.length > 0) || !trailing) && (
          <View style={styles.metaRow}>
            {showTags && user.tags.slice(0, 3).map((tag) => <Pill key={tag} label={tag} tone="neutral" />)}
            {!trailing && (
              <Text style={[Type.caption1, styles.meta, { color: colors.textTertiary }]} numberOfLines={1}>
                {metaLine(user, t)}
              </Text>
            )}
          </View>
        )}
      </View>
      <IconSymbol name="chevron.right" size={14} color={colors.textTertiary} />
    </Pressable>
  );
}

function RowGroup({ children }: { children: React.ReactNode[] }) {
  const { colors } = useTheme();
  return (
    <Card padded={false} style={styles.group}>
      {children.map((child, i) => (
        <View key={i}>
          {i > 0 && <View style={[styles.separator, { backgroundColor: colors.separator }]} />}
          {child}
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
  const t = useT();
  const { username, userId, avatarTs } = useAuthStore();
  const { persona, inUseCount, pendingCount, refresh: refreshProfile } = useProfileStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [searching, setSearching] = useState(false);

  const [recent, setRecent] = useState<UserSummary[]>([]);
  const [celebrities, setCelebrities] = useState<UserSummary[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [seed, setSeed] = useState(0);
  const [recommended, setRecommended] = useState<UserSummary[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecommended = useCallback(async (tag: string | null, s: number) => {
    setRecLoading(true);
    try {
      setRecommended(await api.recommendedUsers({ limit: 8, tag, seed: s }));
    } catch {
      // 推荐失败不打断页面,其他分区照常
    } finally {
      setRecLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [contacts, recentList, tagList] = await Promise.all([
        api.listUsers(),
        api.recentContacts(),
        api.listTags(),
      ]);
      setCelebrities(contacts.filter((u) => u.is_builtin));
      setRecent(recentList);
      setTags(tagList);
      setError(null);
      await loadRecommended(activeTag, seed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [activeTag, seed, loadRecommended]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshProfile(userId).catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]),
  );

  // 搜索:去抖 280ms;空查询回到发现页
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .searchUsers(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const pickTag = (tag: string | null) => {
    haptic.selection();
    setActiveTag(tag);
    setSeed(0);
    loadRecommended(tag, 0);
  };

  const shuffle = () => {
    haptic.light();
    const next = seed + 1;
    setSeed(next);
    loadRecommended(activeTag, next);
  };

  const openSelf = () =>
    router.push({
      pathname: '/visit/[userId]',
      params: { userId: userId ?? '', username: username ?? '', builtin: '', avatarTs: avatarTs ?? '' },
    });

  const isSearching = query.trim().length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.textSecondary} />}>
        <LargeHeader
          title={t.chats.title}
          subtitle={t.chats.subtitle}
          right={
            <IconButton
              name="person.2.fill"
              onPress={() => router.push('/real-chats')}
              accessibilityLabel={t.chats.realChats}
            />
          }
        />

        <View style={styles.search}>
          <TextField
            icon="magnifyingglass"
            placeholder={t.chats.searchPlaceholder}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            right={
              searching ? (
                <ActivityIndicator size="small" color={colors.textTertiary} />
              ) : query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t.common.clear}>
                  <IconSymbol name="xmark.circle.fill" size={18} color={colors.textTertiary} />
                </Pressable>
              ) : undefined
            }
          />
        </View>

        {isSearching ? (
          results.length > 0 ? (
            <>
              <SectionLabel>{t.chats.results}</SectionLabel>
              <RowGroup>
                {results.map((u) => (
                  <PersonRow key={u.id} user={u} hint={u.status ? t.common.today(u.status) : u.persona_excerpt} showTags />
                ))}
              </RowGroup>
            </>
          ) : !searching ? (
            <EmptyState icon="magnifyingglass" title={t.chats.noMatch(query.trim())} message={t.chats.noMatchHint} />
          ) : null
        ) : (
          <>
            {/* 我的化身:这一页的主角。先说化身学到了什么、怎么学的,再给一个明确的「去检验」 */}
            <Card onPress={openSelf} style={styles.selfCard}>
              <View style={styles.selfTop}>
                <Avatar username={username ?? t.tabs.me} userId={userId} avatarTs={avatarTs} size={54} />
                <View style={styles.rowBody}>
                  <Text style={[Type.headline, { color: colors.text }]}>{t.chats.myAvatar}</Text>
                  <Text style={[Type.subhead, { color: colors.textSecondary }]} numberOfLines={2}>
                    {inUseCount || pendingCount ? t.cards.status(inUseCount, pendingCount) : t.cards.none}
                  </Text>
                  <Text style={[Type.caption1, { color: colors.textTertiary }]} numberOfLines={1}>
                    {t.visit.selfSubtitle}
                  </Text>
                </View>
              </View>
              <View style={[styles.selfFooter, { borderTopColor: colors.separator }]}>
                <Button title={t.chats.testIt} size="sm" icon="bubble.left.fill" onPress={openSelf} />
                <Button
                  title={persona ? t.profile.persona : t.chats.writeOne}
                  variant="ghost"
                  size="sm"
                  icon="person.text.rectangle.fill"
                  onPress={() => router.push('/persona-editor')}
                  style={styles.selfAction}
                />
              </View>
            </Card>

            {error && <Banner tone="danger" message={error} actionLabel={t.common.retry} onAction={refresh} style={styles.banner} />}

            {recent.length > 0 && (
              <>
                <SectionLabel>{t.chats.recent}</SectionLabel>
                <RowGroup>
                  {recent.map((u) => (
                    <PersonRow
                      key={u.id}
                      user={u}
                      hint={u.last_message}
                      hintIcon="bubble.left.fill"
                      trailing={u.last_at ? formatRecent(u.last_at) : null}
                    />
                  ))}
                </RowGroup>
              </>
            )}

            {/* 为你推荐 */}
            <View style={styles.recHeader}>
              <SectionLabel style={styles.recLabel}>{t.chats.recommended}</SectionLabel>
              <Button
                title={t.chats.shuffle}
                variant="ghost"
                size="sm"
                icon="arrow.triangle.2.circlepath"
                onPress={shuffle}
                disabled={recLoading}
                style={styles.shuffle}
              />
            </View>
            {tags.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagBar}>
                {[{ tag: t.common.all, count: 0 }, ...tags].map((tc, i) => {
                  const value = i === 0 ? null : tc.tag;
                  const active = activeTag === value;
                  return (
                    <Pressable
                      key={tc.tag}
                      onPress={() => pickTag(value)}
                      style={({ pressed }) => [
                        styles.tagChip,
                        {
                          backgroundColor: active ? colors.tint : colors.surface,
                          borderColor: active ? colors.tint : colors.separator,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}>
                      <Text style={[Type.footnote, { color: active ? colors.onTint : colors.text, fontWeight: '600' }]}>
                        {tc.tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {recLoading && recommended.length === 0 ? (
              <View style={styles.recLoading}>
                <ActivityIndicator color={colors.textTertiary} />
              </View>
            ) : recommended.length > 0 ? (
              <RowGroup>
                {recommended.map((u) => (
                  <PersonRow key={u.id} user={u} hint={u.reason} hintIcon="sparkles" hintTint showTags />
                ))}
              </RowGroup>
            ) : loaded ? (
              <Card tone="fill" style={styles.recEmpty}>
                <Text style={[Type.footnote, { color: colors.textSecondary }]}>
                  {activeTag ? t.chats.noRecForTag(activeTag) : t.chats.noRec}
                </Text>
              </Card>
            ) : null}

            {celebrities.length > 0 && (
              <>
                <SectionLabel>{t.chats.celebrities}</SectionLabel>
                <RowGroup>
                  {celebrities.map((u) => (
                    <PersonRow key={u.id} user={u} hint={t.chats.celebrityHint} />
                  ))}
                </RowGroup>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  search: { paddingHorizontal: 20, marginBottom: 14 },
  selfCard: { marginHorizontal: 20, marginBottom: 20, padding: 0 },
  selfTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingBottom: 14 },
  selfFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selfAction: { paddingHorizontal: 8 },
  banner: { marginHorizontal: 20, marginBottom: 14 },
  group: { marginHorizontal: 20, marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowName: { flexShrink: 1 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hintText: { flex: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  meta: { marginLeft: 'auto' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 80 },
  recHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 },
  recLabel: { marginBottom: 6 },
  shuffle: { paddingHorizontal: 8 },
  tagBar: { paddingHorizontal: 20, gap: 8, paddingBottom: 12, paddingTop: 2 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recLoading: { paddingVertical: 28, alignItems: 'center' },
  recEmpty: { marginHorizontal: 20, marginBottom: 20 },
});
