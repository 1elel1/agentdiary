import { useHeaderHeight } from '@react-navigation/elements';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { looksPasted } from '@/lib/diary-quality';
import { formatLongDate, parseUtc } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useT, type Dict } from '@/lib/i18n';
import type { DiaryVisibility } from '@/lib/types';
import { useDiaryStore } from '@/stores/diary-store';

function visibilityOptions(t: Dict): { key: DiaryVisibility; label: string; hint: string }[] {
  return [
    { key: 'private', label: t.visibility.private, hint: t.visibility.privateHint },
    { key: 'restricted', label: t.visibility.restricted, hint: t.visibility.restrictedHint },
    { key: 'public', label: t.visibility.public, hint: t.visibility.publicHint },
  ];
}

const EDIT_WINDOW_MS = 24 * 3600 * 1000;

export default function DiaryEditorScreen() {
  const { colors } = useTheme();
  const t = useT();
  const headerHeight = useHeaderHeight();
  const add = useDiaryStore((s) => s.add);
  const edit = useDiaryStore((s) => s.edit);
  const entries = useDiaryStore((s) => s.entries);
  const refresh = useDiaryStore((s) => s.refresh);

  // 编辑模式只带 diaryId:正文从本地缓存取,绝不放进路由参数——网页版的地址栏、
  // 浏览器历史、Referrer 都会带着 URL 走,日记是最高敏感级数据
  const { diaryId } = useLocalSearchParams<{ diaryId?: string }>();
  const isEditing = !!diaryId;
  const entry = useMemo(
    () => (diaryId ? (entries.find((e) => e.id === diaryId) ?? null) : null),
    [entries, diaryId],
  );
  const [content, setContent] = useState(entry?.content ?? '');
  const [hydrated, setHydrated] = useState(!isEditing || !!entry);

  // 直接打开编辑链接(网页刷新)时缓存可能还没加载:拉一次列表再填入
  useEffect(() => {
    if (hydrated) return;
    refresh().finally(() => setHydrated(true));
  }, [hydrated, refresh]);
  useEffect(() => {
    if (entry && content === '') setContent(entry.content);
    // 只在条目首次到位时填入,之后由用户输入主导
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const canEdit = !isEditing || !entry || parseUtc(entry.created_at).getTime() + EDIT_WINDOW_MS > Date.now();

  // 新日记默认仅自己:这是私密日记,扩大可见范围必须是用户主动选的
  const [visibility, setVisibility] = useState<DiaryVisibility>('private');
  // 「指定的人」白名单:搜索添加(全站用户不再罗列)
  const [allowed, setAllowed] = useState<SelectedUsers>(new Map());
  const [saving, setSaving] = useState(false);

  const dirty = content.trim().length > 0 && content.trim() !== (entry?.content ?? '').trim();

  const save = async () => {
    const text = content.trim();
    if (!text || !canEdit || saving) return;
    // 训练闸门:像粘贴/转载的长文,先问要不要让化身学
    let useForTwin = true;
    if (!isEditing && looksPasted(text)) {
      const idx = await dialog.show(t.diary.pasteTitle, t.diary.pasteMessage, [
        { label: t.diary.pasteSaveOnly },
        { label: t.diary.pasteUse },
        { label: t.common.cancel, style: 'cancel' },
      ]);
      if (idx === 2) return;
      useForTwin = idx === 1;
    }
    setSaving(true);
    try {
      if (isEditing && diaryId) {
        await edit(diaryId, text);
      } else {
        await add(text, visibility, visibility === 'restricted' ? [...allowed.keys()] : [], useForTwin);
      }
      haptic.success();
      router.back();
    } catch (e) {
      haptic.error();
      dialog.alert(t.common.saveFailed, e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const close = async () => {
    if (dirty && canEdit) {
      const ok = await dialog.confirm({
        title: t.editor.discardTitle,
        message: t.editor.discardMessage,
        confirmText: t.common.discard,
        destructive: true,
      });
      if (!ok) return;
    }
    router.back();
  };

  const options = visibilityOptions(t);
  const selectedHint = options.find((o) => o.key === visibility)?.hint;
  const dateLine = formatLongDate(entry ? parseUtc(entry.created_at) : new Date(), t);
  const title = isEditing ? (canEdit ? t.editor.titleEdit : t.editor.titleRead) : t.editor.titleNew;
  // 占位语按天轮换:温和、不催促,也不把 AI 放在输入框前面
  const placeholder = t.diary.prompts[new Date().getDate() % t.diary.prompts.length];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
      <Stack.Screen
        options={{
          title,
          headerLeft: () => <HeaderButton title={canEdit ? t.common.cancel : t.common.close} onPress={close} />,
          headerRight: () =>
            canEdit ? (
              <HeaderButton title={t.common.save} bold loading={saving} disabled={!dirty} onPress={save} />
            ) : null,
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.meta}>
          <Text style={[Type.footnote, { color: colors.textSecondary }]}>{dateLine}</Text>
          {isEditing && (
            <View style={styles.metaHint}>
              <IconSymbol name={canEdit ? 'hourglass' : 'lock.fill'} size={12} color={colors.textTertiary} />
              <Text style={[Type.caption1, styles.metaHintText, { color: colors.textTertiary }]}>
                {canEdit ? t.editor.editWindow : t.editor.frozen}
              </Text>
            </View>
          )}
        </View>

        {isEditing && !hydrated ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <TextInput
            style={[Type.body, styles.input, webNoOutline, { color: colors.text }]}
            multiline
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.tint}
            value={content}
            onChangeText={setContent}
            editable={canEdit}
            autoFocus={canEdit && !isEditing}
            scrollEnabled
          />
        )}

        {/* 编辑模式只改内容;可见性在日记卡片的操作面板里调整 */}
        {!isEditing && (
          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
            <Text style={[Type.footnote, styles.panelTitle, { color: colors.textSecondary }]}>{t.visibility.whoCanSee}</Text>
            <SegmentedControl<DiaryVisibility> options={options} value={visibility} onChange={setVisibility} />
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
  metaHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  metaHintText: { flex: 1 },
  loading: { marginTop: 40 },
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
