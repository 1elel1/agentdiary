// 「指定的人」白名单选择:从日记卡片长按菜单的「指定的人」进入。
// 保存后该日记的衍生卡片只对勾选的用户开放。全站用户不再罗列,靠搜索添加。

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';

import { HeaderButton } from '@/components/ui/header-button';
import { UserPicker, type SelectedUsers } from '@/components/user-picker';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import { useDiaryStore } from '@/stores/diary-store';

export default function VisibilityPickerScreen() {
  const { diaryId } = useLocalSearchParams<{ diaryId: string }>();
  const { colors } = useTheme();
  const t = useT();
  const setVisibility = useDiaryStore((s) => s.setVisibility);

  const [selected, setSelected] = useState<SelectedUsers>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!diaryId) return;
    api
      .getDiaryAllowed(diaryId)
      .then((allowed) => setSelected(new Map(allowed.allowed_users.map((u) => [u.id, u.username]))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [diaryId]);

  const save = async () => {
    if (!diaryId || saving) return;
    setSaving(true);
    try {
      await setVisibility(diaryId, 'restricted', [...selected.keys()]);
      haptic.success();
      router.back();
    } catch (e) {
      dialog.alert(t.common.saveFailed, e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderButton title={t.common.cancel} onPress={() => router.back()} />,
          headerRight: () => (
            <HeaderButton title={t.picker.save(selected.size)} bold loading={saving} disabled={loading} onPress={save} />
          ),
        }}
      />
      <Text style={[Type.footnote, styles.hint, { color: colors.textSecondary }]}>{t.picker.hint}</Text>
      {loading ? <ActivityIndicator style={styles.loading} /> : <UserPicker selected={selected} onChange={setSelected} tone="surface" />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  hint: { lineHeight: 18 },
  loading: { marginTop: 40 },
});
