import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiaryCalendar } from '@/components/diary-calendar';
import { PatternLock } from '@/components/pattern-lock';
import { ScreenBackground } from '@/components/screen-background';
import { Banner } from '@/components/ui/banner';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LargeHeader } from '@/components/ui/large-header';
import { Pill } from '@/components/ui/pill';
import { SegmentedControl } from '@/components/ui/segmented';
import { ActionSheet, Sheet } from '@/components/ui/sheet';
import { Radius, Type, floatingShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { dateKey, dayLabel, formatRemaining, formatTime, parseUtc } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useT, type Dict } from '@/lib/i18n';
import type { PendingDiary } from '@/lib/offline-queue';
import type { DiaryEntry, DiaryVisibility } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useDiaryStore } from '@/stores/diary-store';
import { useProfileStore } from '@/stores/profile-store';
import { useSettingsStore } from '@/stores/settings-store';

// 日记落笔 24 小时内可修改,之后定格(保证日记的真实性)
const EDIT_WINDOW_MS = 24 * 3600 * 1000;

function editRemainingMs(createdAtIso: string): number {
  return parseUtc(createdAtIso).getTime() + EDIT_WINDOW_MS - Date.now();
}

type Row =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'pending'; id: string; item: PendingDiary }
  | { kind: 'entry'; id: string; item: DiaryEntry };

type ItemRow = Exclude<Row, { kind: 'header' }>;

const VISIBILITY_TONE: Record<DiaryVisibility, 'success' | 'info' | 'neutral'> = {
  public: 'success',
  restricted: 'info',
  private: 'neutral',
};

function visibilityOptions(t: Dict): { key: DiaryVisibility; label: string }[] {
  return [
    { key: 'public', label: t.visibility.public },
    { key: 'restricted', label: t.visibility.restricted },
    { key: 'private', label: t.visibility.private },
  ];
}

export default function DiaryListScreen() {
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Redirect href="/login" />;
  }
  return <DiaryList />;
}

function DiaryCard({
  row,
  unlocked,
  onPress,
  onLongPress,
}: {
  row: ItemRow;
  unlocked: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const visibility = row.item.visibility as DiaryVisibility;
  const isLocked = row.kind === 'entry' && row.item.locked;
  const hideContent = isLocked && !unlocked;
  const remaining = row.kind === 'entry' ? editRemainingMs(row.item.created_at) : 0;

  return (
    <Card onPress={onPress} onLongPress={onLongPress} style={styles.entryCard}>
      <View style={styles.entryTop}>
        <Text style={[Type.footnote, { color: colors.textSecondary }]}>
          {formatTime(row.item.created_at)}
        </Text>
        <View style={styles.entryTopRight}>
          {isLocked && <IconSymbol name="lock.fill" size={13} color={colors.textTertiary} />}
          {row.kind === 'pending' ? (
            <Pill label={t.diary.pending} tone="warning" icon="icloud.slash.fill" />
          ) : (
            <Pill label={t.visibility[visibility]} tone={VISIBILITY_TONE[visibility]} />
          )}
        </View>
      </View>
      {hideContent ? (
        <View style={styles.lockedBody}>
          <IconSymbol name="lock.fill" size={16} color={colors.textTertiary} />
          <Text style={[Type.subhead, { color: colors.textTertiary }]}>{t.diary.locked}</Text>
        </View>
      ) : (
        <Text style={[Type.callout, styles.entryContent, { color: colors.text }]} numberOfLines={6}>
          {row.item.content}
        </Text>
      )}
      {remaining > 0 && (
        <View style={styles.entryFooter}>
          <IconSymbol name="hourglass" size={12} color={colors.textTertiary} />
          <Text style={[Type.caption1, { color: colors.textTertiary }]}>
            {t.diary.editable(formatRemaining(remaining, t))}
          </Text>
        </View>
      )}
    </Card>
  );
}

function DiaryList() {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const t = useT();
  const { entries, pending, loading, error, refresh, remove, setVisibility, setLocked } =
    useDiaryStore();
  const diaryBg = useSettingsStore((s) => s.diaryBg);
  const lockPattern = useSettingsStore((s) => s.lockPattern);
  const userId = useAuthStore((s) => s.userId);
  const { status, cardCount, refresh: refreshProfile } = useProfileStore();

  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 手势锁验证门:待执行动作暂存,图案验证通过后放行
  const [lockGate, setLockGate] = useState<(() => void) | null>(null);
  const [lockError, setLockError] = useState(false);
  const [unlockedDiaryIds, setUnlockedDiaryIds] = useState<Set<string>>(() => new Set());
  // 长按卡片弹出的操作面板
  const [actionRow, setActionRow] = useState<ItemRow | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refreshProfile(userId).catch(() => {});
    }, [refreshProfile, userId]),
  );

  const items = useMemo<ItemRow[]>(() => {
    const all: ItemRow[] = [
      ...pending.map((p): ItemRow => ({ kind: 'pending', id: p.local_id, item: p })),
      ...entries.map((e): ItemRow => ({ kind: 'entry', id: e.id, item: e })),
    ];
    return all.sort(
      (a, b) => parseUtc(b.item.created_at).getTime() - parseUtc(a.item.created_at).getTime(),
    );
  }, [pending, entries]);

  // 有日记的日期(本地时区),供月历打点
  const markedDates = useMemo(
    () => new Set(items.map((r) => dateKey(parseUtc(r.item.created_at)))),
    [items],
  );

  const rows = useMemo<Row[]>(() => {
    const filtered = selectedDate
      ? items.filter((r) => dateKey(parseUtc(r.item.created_at)) === selectedDate)
      : items;
    const out: Row[] = [];
    let lastKey: string | null = null;
    for (const r of filtered) {
      const key = dateKey(parseUtc(r.item.created_at));
      if (key !== lastKey) {
        out.push({ kind: 'header', id: `h-${key}`, label: dayLabel(key, t) });
        lastKey = key;
      }
      out.push(r);
    }
    return out;
  }, [items, selectedDate, t]);

  const confirmDelete = async (row: ItemRow) => {
    const ok = await dialog.confirm({
      title: row.kind === 'pending' ? t.diary.deletePendingTitle : t.diary.deleteTitle,
      message: row.kind === 'pending' ? t.diary.deletePendingMessage : t.diary.deleteMessage,
      confirmText: t.common.delete,
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove(row.id);
      haptic.success();
    } catch (e) {
      dialog.alert(t.diary.deleteFailed, e instanceof Error ? e.message : String(e));
    }
  };

  // 加锁/解锁(解锁需先验证图案,锁才不形同虚设)
  const toggleLock = async (row: ItemRow) => {
    if (row.kind !== 'entry') return;
    if (!row.item.locked) {
      if (!lockPattern) {
        const idx = await dialog.show(t.diary.needPatternTitle, t.diary.needPatternMessage, [
          { label: t.common.cancel, style: 'cancel' },
          { label: t.diary.goSet },
        ]);
        if (idx === 1) router.push({ pathname: '/pattern-setup', params: { mode: 'set' } });
        return;
      }
      try {
        await setLocked(row.id, true);
        setUnlockedDiaryIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        haptic.success();
      } catch {
        dialog.alert(t.diary.lockFailed, t.common.tryLater);
      }
      return;
    }
    setLockError(false);
    setLockGate(() => () => {
      setLocked(row.id, false)
        .then(() => {
          setUnlockedDiaryIds((prev) => {
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
        })
        .catch(() => dialog.alert(t.diary.unlockFailed, t.common.tryLater));
    });
  };

  const changeVisibility = (row: ItemRow, visibility: DiaryVisibility) => {
    // 「指定的人」需要选人:已同步的日记跳白名单选择页;
    // 未同步的本地日记没有服务器 id,先仅切换档位
    if (visibility === 'restricted' && row.kind === 'entry') {
      router.push({ pathname: '/visibility-picker', params: { diaryId: row.id } });
      return;
    }
    setVisibility(row.id, visibility).catch(() => dialog.alert(t.diary.changeFailed, t.common.tryLater));
  };

  const redistill = async (row: ItemRow) => {
    if (row.kind !== 'entry') return;
    try {
      await api.redistillDiary(row.id);
      dialog.alert(t.diary.relearnedTitle, t.diary.relearnedMessage);
    } catch (e) {
      dialog.alert(t.common.actionFailed, e instanceof Error ? e.message : String(e));
    }
  };

  const openDetail = (row: ItemRow) => {
    if (row.kind !== 'entry') return;
    const go = () => {
      router.push({
        pathname: '/diary-editor',
        params: {
          diaryId: row.id,
          initialContent: row.item.content,
          createdAt: row.item.created_at,
        },
      });
    };
    // 点按加锁日记:验证通过直接进详情页,锁状态保持不变
    if (row.item.locked && lockPattern) {
      setLockError(false);
      setLockGate(() => go);
      return;
    }
    go();
  };

  const count = items.length;
  const subtitle = count === 0 ? t.diary.firstHint : t.diary.summary(count, cardCount);

  return (
    <ScreenBackground setting={diaryBg}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.textSecondary} />}
          contentContainerStyle={[styles.listContent, rows.length === 0 && styles.listGrow]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              <LargeHeader
                title={t.diary.title}
                subtitle={subtitle}
                right={
                  <>
                    <IconButton
                      name="calendar"
                      active={showCalendar || !!selectedDate}
                      onPress={() => setShowCalendar((v) => !v)}
                      accessibilityLabel={t.diary.filterByDate}
                    />
                    <IconButton
                      name="paintbrush.fill"
                      onPress={() => router.push('/appearance')}
                      accessibilityLabel={t.diary.appearance}
                    />
                  </>
                }
              />

              {showCalendar && (
                <DiaryCalendar marked={markedDates} selected={selectedDate} onSelect={setSelectedDate} />
              )}

              <View style={styles.chipsRow}>
                <Pressable
                  onPress={() => router.push('/status-editor')}
                  style={({ pressed }) => [
                    styles.statusChip,
                    { backgroundColor: status ? colors.tintSoft : colors.fill, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <IconSymbol
                    name="face.smiling"
                    size={15}
                    color={status ? colors.tint : colors.textSecondary}
                  />
                  <Text
                    style={[
                      Type.subhead,
                      { color: status ? colors.tint : colors.textSecondary, fontWeight: '600' },
                    ]}
                    numberOfLines={1}>
                    {status ? status : t.diary.statusPrompt}
                  </Text>
                </Pressable>
                {selectedDate && (
                  <Pressable
                    onPress={() => setSelectedDate(null)}
                    style={({ pressed }) => [styles.filterChip, { backgroundColor: colors.fill, opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={[Type.footnote, { color: colors.textSecondary }]}>{selectedDate}</Text>
                    <IconSymbol name="xmark" size={11} color={colors.textSecondary} weight="bold" />
                  </Pressable>
                )}
              </View>

              {error && <Banner tone="warning" message={error} style={styles.banner} />}
            </View>
          }
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="book.fill"
                title={selectedDate ? t.diary.emptyDayTitle : t.diary.emptyTitle}
                message={selectedDate ? t.diary.emptyDayMessage : t.diary.emptyMessage}
                action={
                  selectedDate ? undefined : (
                    <Button title={t.diary.writeFirst} icon="square.and.pencil" onPress={() => router.push('/diary-editor')} />
                  )
                }
              />
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <Text style={[Type.footnote, styles.dayHeader, { color: colors.textSecondary }]}>{item.label}</Text>
            ) : (
              <DiaryCard
                row={item}
                unlocked={item.kind === 'entry' && unlockedDiaryIds.has(item.id)}
                onPress={() => openDetail(item)}
                onLongPress={() => setActionRow(item)}
              />
            )
          }
        />

        {/* 写日记 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.diary.write}
          onPress={() => {
            haptic.light();
            router.push('/diary-editor');
          }}
          style={({ pressed }) => [
            styles.fab,
            floatingShadow(scheme),
            { backgroundColor: colors.tint, transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}>
          <IconSymbol name="square.and.pencil" size={24} color={colors.onTint} weight="semibold" />
        </Pressable>

        {/* 长按卡片的操作面板 */}
        <ActionSheet
          visible={actionRow !== null}
          onClose={() => setActionRow(null)}
          title={actionRow ? t.diary.sheetTitle(formatTime(actionRow.item.created_at)) : undefined}
          header={
            actionRow ? (
              <View style={styles.sheetVisibility}>
                <Text style={[Type.footnote, { color: colors.textSecondary }]}>{t.visibility.whoCanSee}</Text>
                <SegmentedControl<DiaryVisibility>
                  options={visibilityOptions(t)}
                  value={actionRow.item.visibility as DiaryVisibility}
                  onChange={(v) => {
                    const row = actionRow;
                    setActionRow(null);
                    setTimeout(() => changeVisibility(row, v), 180);
                  }}
                />
              </View>
            ) : null
          }
          actions={
            actionRow?.kind === 'entry'
              ? [
                  {
                    label: actionRow.item.locked ? t.diary.unlock : t.diary.lock,
                    icon: actionRow.item.locked ? 'lock.open.fill' : 'lock.fill',
                    onPress: () => toggleLock(actionRow),
                  },
                  {
                    label: t.diary.relearn,
                    icon: 'arrow.triangle.2.circlepath',
                    onPress: () => redistill(actionRow),
                  },
                  { label: t.diary.deleteThis, icon: 'trash.fill', destructive: true, onPress: () => confirmDelete(actionRow) },
                ]
              : actionRow
                ? [{ label: t.diary.deleteThis, icon: 'trash.fill', destructive: true, onPress: () => confirmDelete(actionRow) }]
                : []
          }
        />

        {/* 手势锁验证 */}
        <Sheet visible={lockGate !== null} onClose={() => setLockGate(null)} title={t.diary.drawToUnlock}>
          <View style={styles.lockBody}>
            <Text style={[Type.footnote, { color: lockError ? colors.danger : colors.textSecondary }]}>
              {lockError ? t.diary.patternWrong : t.diary.hasLock}
            </Text>
            <PatternLock
              onComplete={(pattern) => {
                if (pattern === lockPattern) {
                  const go = lockGate;
                  setLockGate(null);
                  haptic.success();
                  setTimeout(() => go?.(), 180);
                } else {
                  haptic.error();
                  setLockError(true);
                }
              }}
            />
          </View>
        </Sheet>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingBottom: 120 },
  listGrow: { flexGrow: 1 },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    maxWidth: '100%',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  banner: { marginHorizontal: 20, marginBottom: 10 },
  dayHeader: { marginHorizontal: 20, marginTop: 14, marginBottom: 8, fontWeight: '600' },
  entryCard: { marginHorizontal: 20, marginBottom: 10 },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  entryTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryContent: { lineHeight: 23 },
  lockedBody: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  entryFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetVisibility: { gap: 8, marginBottom: 14, paddingHorizontal: 4 },
  lockBody: { alignItems: 'center', gap: 6, paddingBottom: 8 },
});
