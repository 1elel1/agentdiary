// 「指定的人」白名单选择:从日记卡片长按菜单的「指定的人」进入。
// 保存后该日记的衍生卡片只对勾选的用户开放。

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { HeaderButton } from '@/components/ui/header-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import type { UserSummary } from '@/lib/types';
import { useDiaryStore } from '@/stores/diary-store';

export default function VisibilityPickerScreen() {
  const { diaryId } = useLocalSearchParams<{ diaryId: string }>();
  const { colors } = useTheme();
  const setVisibility = useDiaryStore((s) => s.setVisibility);

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!diaryId) return;
    Promise.all([
      api.listUsers(),
      api.getDiaryAllowed(diaryId).catch(() => ({ allowed_user_ids: [] as string[] })),
    ])
      .then(([list, allowed]) => {
        setUsers(list.filter((u) => !u.is_builtin));
        setSelected(new Set(allowed.allowed_user_ids));
      })
      .catch((e) => dialog.alert('加载失败', e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [diaryId]);

  const toggle = (id: string) => {
    haptic.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!diaryId || saving) return;
    setSaving(true);
    try {
      await setVisibility(diaryId, 'restricted', [...selected]);
      haptic.success();
      router.back();
    } catch (e) {
      dialog.alert('保存失败', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderButton title="取消" onPress={() => router.back()} />,
          headerRight: () => (
            <HeaderButton title={`保存(${selected.size})`} bold loading={saving} disabled={loading} onPress={save} />
          ),
        }}
      />
      <Text style={[Type.footnote, styles.hint, { color: colors.textSecondary }]}>
        这篇日记学到的东西,你的化身只会对勾选的人用到。
      </Text>
      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="person.2.fill" title="还没有其他用户可选" />}
          renderItem={({ item, index }) => {
            const checked = selected.has(item.id);
            return (
              <Card padded={false} style={[styles.rowCard, index > 0 && styles.rowGap]} onPress={() => toggle(item.id)}>
                <View style={styles.row}>
                  <Avatar username={item.username} userId={item.id} avatarTs={item.avatar_updated_at} size={40} />
                  <Text style={[Type.body, styles.name, { color: colors.text }]} numberOfLines={1}>
                    {item.username}
                  </Text>
                  <IconSymbol
                    name={checked ? 'checkmark.circle.fill' : 'circle'}
                    size={24}
                    color={checked ? colors.tint : colors.textTertiary}
                  />
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hint: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6, lineHeight: 18 },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: 20, paddingVertical: 10 },
  rowCard: {},
  rowGap: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  name: { flex: 1 },
});
