import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionLabel } from '@/components/ui/large-header';
import { Pill } from '@/components/ui/pill';
import { ActionSheet } from '@/components/ui/sheet';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { dateKey, formatDateTime, parseUtc } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useT, type Dict } from '@/lib/i18n';
import type { DiaryEntry, PersonaCard, PersonaCardKind } from '@/lib/types';
import { useProfileStore } from '@/stores/profile-store';

// 分组按「性质」而不是按来源日记:用户要看的是「它怎么理解我」,而不是数据从哪条记录来
type GroupKey = PersonaCardKind | 'legacy';
const GROUP_ORDER: GroupKey[] = ['stable', 'mood', 'guess', 'legacy'];

function groupTitle(t: Dict, g: GroupKey): string {
  return g === 'stable' ? t.cards.groupStable : g === 'mood' ? t.cards.groupMood : g === 'guess' ? t.cards.groupGuess : t.cards.groupLegacy;
}

function groupHint(t: Dict, g: GroupKey): string {
  return g === 'stable'
    ? t.cards.groupStableHint
    : g === 'mood'
      ? t.cards.groupMoodHint
      : g === 'guess'
        ? t.cards.groupGuessHint
        : t.cards.groupLegacyHint;
}

function kindPill(t: Dict, kind: PersonaCardKind): { label: string; tone: 'tint' | 'info' | 'warning' } {
  if (kind === 'mood') return { label: t.cards.kindMood, tone: 'info' };
  if (kind === 'guess') return { label: t.cards.kindGuess, tone: 'warning' };
  return { label: t.cards.kindStable, tone: 'tint' };
}

/** 化身学到的「你」:按性质分组、可追溯到来源、可排除。不是养成进度条。 */
export default function PersonaCardsScreen() {
  const { colors } = useTheme();
  const t = useT();
  const cards = useProfileStore((s) => s.cards);
  const inUseCount = useProfileStore((s) => s.inUseCount);
  const pendingCount = useProfileStore((s) => s.pendingCount);
  const refreshProfile = useProfileStore((s) => s.refresh);
  const excludeCard = useProfileStore((s) => s.excludeCard);

  const [diaries, setDiaries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 来源默认收起:首层只看结论,「查看来源」才展开原日记(仍在本人的私密空间里)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [actionCard, setActionCard] = useState<PersonaCard | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [, d] = await Promise.all([refreshProfile(null), api.listDiaries()]);
      setDiaries(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [refreshProfile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = useMemo(() => cards.filter((c) => !c.superseded_by), [cards]);
  const diaryById = useMemo(() => new Map(diaries.map((d) => [d.id, d])), [diaries]);
  const groups = useMemo(
    () =>
      GROUP_ORDER.map((key) => ({
        key,
        items: active
          .filter((c) => (c.kind ?? 'legacy') === key)
          .sort((a, b) => parseUtc(b.created_at).getTime() - parseUtc(a.created_at).getTime()),
      })).filter((g) => g.items.length > 0),
    [active],
  );
  const diaryCount = useMemo(() => new Set(active.map((c) => c.source_diary_id)).size, [active]);

  const toggleSource = (id: string) => {
    haptic.selection();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exclude = async (card: PersonaCard) => {
    const ok = await dialog.confirm({
      title: t.cards.excludeTitle,
      message: t.cards.excludeMessage,
      confirmText: t.cards.exclude,
      destructive: true,
    });
    if (!ok) return;
    try {
      await excludeCard(card.id);
      haptic.success();
    } catch (e) {
      dialog.alert(t.cards.excludeFailed, e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.list, active.length === 0 && styles.listGrow]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}>
        {error && <Banner tone="danger" message={error} actionLabel={t.common.retry} onAction={refresh} />}

        {active.length > 0 && (
          <View style={styles.summary}>
            <Text style={[Type.title3, { color: colors.text }]}>{t.cards.status(inUseCount, pendingCount)}</Text>
            <Text style={[Type.footnote, styles.summaryHint, { color: colors.textSecondary }]}>
              {t.cards.summary(diaryCount)}
            </Text>
          </View>
        )}

        {loaded && !loading && active.length === 0 && (
          <EmptyState icon="brain.head.profile" title={t.cards.emptyTitle} message={t.cards.emptyMessage} />
        )}

        {groups.map((g) => (
          <View key={g.key} style={styles.group}>
            <SectionLabel style={styles.groupLabel}>{groupTitle(t, g.key)}</SectionLabel>
            <Text style={[Type.caption1, styles.groupHint, { color: colors.textTertiary }]}>{groupHint(t, g.key)}</Text>
            <Card padded={false}>
              {g.items.map((card, i) => {
                const diary = diaryById.get(card.source_diary_id);
                const open = expanded.has(card.id);
                const pill = card.kind ? kindPill(t, card.kind) : null;
                return (
                  <View
                    key={card.id}
                    style={[styles.cardRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
                    <View style={styles.cardTop}>
                      <Text style={[Type.callout, styles.assertion, { color: colors.text }]}>{card.assertion}</Text>
                      <IconButton
                        name="ellipsis"
                        size={16}
                        tone="plain"
                        accessibilityLabel={t.cards.cardMore}
                        onPress={() => setActionCard(card)}
                        style={styles.more}
                      />
                    </View>
                    <View style={styles.meta}>
                      {pill && <Pill label={pill.label} tone={pill.tone} />}
                      <Text style={[Type.caption1, styles.metaText, { color: colors.textTertiary }]} numberOfLines={1}>
                        {t.cards.learnedAt(dateKey(parseUtc(card.created_at)))}
                      </Text>
                      <Pressable onPress={() => toggleSource(card.id)} hitSlop={8} accessibilityRole="button">
                        <Text style={[Type.caption1, { color: colors.tint, fontWeight: '600' }]}>
                          {open ? t.cards.hideSource : t.cards.viewSource}
                        </Text>
                      </Pressable>
                    </View>
                    {open && (
                      <View style={[styles.source, { backgroundColor: colors.fill }]}>
                        <Text style={[Type.caption1, { color: colors.textTertiary }]}>
                          {t.cards.source(formatDateTime(diary?.created_at ?? card.created_at))}
                        </Text>
                        <Text style={[Type.footnote, styles.sourceText, { color: colors.textSecondary }]} numberOfLines={5}>
                          {diary ? diary.content : t.cards.diaryGone}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          </View>
        ))}
      </ScrollView>

      <ActionSheet
        visible={actionCard !== null}
        onClose={() => setActionCard(null)}
        message={actionCard?.assertion}
        actions={
          actionCard
            ? [{ label: t.cards.exclude, icon: 'minus.circle.fill', destructive: true, onPress: () => exclude(actionCard) }]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 20, paddingBottom: 40, gap: 6 },
  listGrow: { flexGrow: 1, justifyContent: 'center' },
  summary: { gap: 4, marginBottom: 14, paddingHorizontal: 2 },
  summaryHint: { lineHeight: 18 },
  group: { marginBottom: 18 },
  groupLabel: { marginHorizontal: 2, marginTop: 0, marginBottom: 2 },
  groupHint: { marginHorizontal: 2, marginBottom: 8, lineHeight: 16 },
  cardRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  assertion: { flex: 1, lineHeight: 22 },
  more: { marginTop: -10, marginRight: -10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaText: { flex: 1 },
  source: { borderRadius: Radius.md, padding: 10, gap: 4 },
  sourceText: { lineHeight: 18 },
});
