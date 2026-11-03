import { useHeaderHeight } from '@react-navigation/elements';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { HeaderButton } from '@/components/ui/header-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SegmentedControl } from '@/components/ui/segmented';
import { UserPicker, type SelectedUsers } from '@/components/user-picker';
import { Radius, Type, webNoOutline } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dialog } from '@/lib/dialog';
import { formatLongDate, parseUtc } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import type { DiaryVisibility } from '@/lib/types';
import { useDiaryStore } from '@/stores/diary-store';

const VISIBILITY_OPTIONS: { key: DiaryVisibility; label: string; hint: string }[] = [
  { key: 'public', label: '公开', hint: '化身可以对所有访客使用这篇日记学到的东西(不会复述原文)' },
  { key: 'restricted', label: '指定的人', hint: '只有勾选的用户和你的化身聊天时才会用到' },
  { key: 'private', label: '仅自己', hint: '只用于你和自己化身的对话' },
];

const EDIT_WINDOW_MS = 24 * 3600 * 1000;

export default function DiaryEditorScreen() {
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();
  const add = useDiaryStore((s) => s.add);
  const edit = useDiaryStore((s) => s.edit);

  // 编辑模式:从日记卡片点入,带 diaryId、原文与创建时间;24h 窗口在详情页提示,后端仍强制校验
  const { diaryId, initialContent, createdAt } = useLocalSearchParams<{
    diaryId?: string;
    initialContent?: string;
    createdAt?: string;
  }>();
  const isEditing = !!diaryId;
  const canEdit =
    !isEditing || !createdAt || parseUtc(createdAt).getTime() + EDIT_WINDOW_MS > Date.now();

  const [content, setContent] = useState(initialContent ?? '');
  const [visibility, setVisibility] = useState<DiaryVisibility>('public');
  // 「指定的人」白名单:搜索添加(全站用户不再罗列)
  const [allowed, setAllowed] = useState<SelectedUsers>(new Map());
  const [saving, setSaving] = useState(false);

  const dirty = content.trim().length > 0 && content.trim() !== (initialContent ?? '').trim();

  const save = async () => {
    const text = content.trim();
    if (!text || !canEdit || saving) return;
    setSaving(true);
    try {
      if (isEditing && diaryId) {
        await edit(diaryId, text);
      } else {
        await add(text, visibility, visibility === 'restricted' ? [...allowed.keys()] : []);
      }
      haptic.success();
      router.back();
    } catch (e) {
      haptic.error();
      dialog.alert('保存失败', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const close = async () => {
    if (dirty && canEdit) {
      const ok = await dialog.confirm({
        title: '放弃这次编辑?',
        message: '写了的内容不会保存。',
        confirmText: '放弃',
        destructive: true,
      });
      if (!ok) return;
    }
    router.back();
  };

  const selectedHint = VISIBILITY_OPTIONS.find((o) => o.key === visibility)?.hint;
  const dateLine = formatLongDate(createdAt ? parseUtc(createdAt) : new Date());
  const title = isEditing ? (canEdit ? '修改日记' : '日记') : '写日记';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
      <Stack.Screen
        options={{
          title,
          headerLeft: () => <HeaderButton title={canEdit ? '取消' : '关闭'} onPress={close} />,
          headerRight: () =>
            canEdit ? (
              <HeaderButton title="保存" bold loading={saving} disabled={!dirty} onPress={save} />
            ) : null,
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.meta}>
          <Text style={[Type.footnote, { color: colors.textSecondary }]}>{dateLine}</Text>
          {isEditing && (
            <View style={styles.metaHint}>
              <IconSymbol
                name={canEdit ? 'hourglass' : 'lock.fill'}
                size={12}
                color={colors.textTertiary}
              />
              <Text style={[Type.caption1, { color: colors.textTertiary }]}>
                {canEdit ? '落笔 24 小时内可修改,改后化身会重新学习' : '已超过 24 小时,内容定格'}
              </Text>
            </View>
          )}
        </View>

        <TextInput
          style={[Type.body, styles.input, webNoOutline, { color: colors.text }]}
          multiline
          placeholder="今天发生了什么?你怎么想?"
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.tint}
          value={content}
          onChangeText={setContent}
          editable={canEdit}
          autoFocus={canEdit && !isEditing}
          scrollEnabled
        />

        {/* 编辑模式只改内容;可见性在日记卡片长按菜单里调整 */}
        {!isEditing && (
          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
            <Text style={[Type.footnote, styles.panelTitle, { color: colors.textSecondary }]}>谁能看到这篇</Text>
            <SegmentedControl<DiaryVisibility> options={VISIBILITY_OPTIONS} value={visibility} onChange={setVisibility} />
            <Text style={[Type.caption1, styles.hint, { color: colors.textTertiary }]}>{selectedHint}</Text>

            {visibility === 'restricted' && (
              <ScrollView style={styles.userList} keyboardShouldPersistTaps="handled">
                <UserPicker selected={allowed} onChange={setAllowed} />
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  meta: { gap: 4, marginBottom: 10 },
  metaHint: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  input: { flex: 1, lineHeight: 27, textAlignVertical: 'top', paddingTop: 0 },
  panel: {
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: { marginLeft: 2 },
  hint: { marginLeft: 2, lineHeight: 16 },
  userList: { maxHeight: 220 },
});
