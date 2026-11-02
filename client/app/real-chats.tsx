import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { formatRecent } from '@/lib/format';
import type { ConversationItem } from '@/lib/types';

// 真人聊天列表:只有 AI 裁判评估通过(解锁)的用户才会出现在这里
export default function RealChatsScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listConversations());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // 每次回到此页都刷新(对方可能刚发来消息)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.user_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.textSecondary} />}
        contentContainerStyle={[styles.list, items.length === 0 && styles.listGrow]}
        ListHeaderComponent={error ? <Banner tone="danger" message={error} style={styles.banner} /> : null}
        ListEmptyComponent={
          loaded && !loading ? (
            <EmptyState
              icon="person.2.fill"
              title="还没有解锁的真人对话"
              message="先去和 TA 的化身聊上几句,再请 AI 裁判评估契合度。通过后,真人就会出现在这里。"
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Card
            padded={false}
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: '/visit/[userId]',
                params: {
                  userId: item.user_id,
                  username: item.username,
                  builtin: '',
                  avatarTs: item.avatar_updated_at ?? '',
                  mode: 'real',
                },
              })
            }>
            <View style={styles.row}>
              <Avatar username={item.username} userId={item.user_id} avatarTs={item.avatar_updated_at} size={50} />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[Type.headline, styles.name, { color: colors.text }]} numberOfLines={1}>
                    {item.username}
                  </Text>
                  {item.last_at && (
                    <Text style={[Type.caption1, { color: colors.textTertiary }]}>{formatRecent(item.last_at)}</Text>
                  )}
                </View>
                <Text style={[Type.subhead, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.last_message ?? '已解锁,打个招呼吧'}
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={14} color={colors.textTertiary} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 20, gap: 10 },
  listGrow: { flexGrow: 1, justifyContent: 'center' },
  banner: { marginBottom: 6 },
  card: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1 },
});
