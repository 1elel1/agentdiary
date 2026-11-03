import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { formatDateTime, parseUtc } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { DiaryEntry, PersonaCard } from '@/lib/types';

interface Group {
  diaryId: string;
  diary: DiaryEntry | null;
  cards: PersonaCard[];
  createdAt: string;
}

function confidenceTone(c: number): 'success' | 'tint' | 'warning' {
  if (c >= 0.8) return 'success';
  if (c >= 0.5) return 'tint';
  return 'warning';
}

/** 人格卡片:化身从日记里学到的「你」。每张都能对回到来源日记(可追溯、可删除)。 */
export default function PersonaCardsScreen() {
  const { colors } = useTheme();
  const t = useT();
  const [cards, setCards] = useState<PersonaCard[]>([]);
  const [diaries, setDiaries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([api.listPersonaCards(), api.listDiaries()]);
      setCards(c);
      setDiaries(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const groups = useMemo<Group[]>(() => {
    const byDiary = new Map(diaries.map((d) => [d.id, d]));
    const map = new Map<string, Group>();
    for (const card of cards) {
      const g = map.get(card.source_diary_id) ?? {
        diaryId: card.source_diary_id,
        diary: byDiary.get(card.source_diary_id) ?? null,
        cards: [],
        createdAt: byDiary.get(card.source_diary_id)?.created_at ?? card.created_at,
      };
      g.cards.push(card);
      map.set(card.source_diary_id, g);
    }
    return [...map.values()].sort(
      (a, b) => parseUtc(b.createdAt).getTime() - parseUtc(a.createdAt).getTime(),
    );
  }, [cards, diaries]);

  const active = cards.filter((c) => !c.superseded_by).length;

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.diaryId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.textSecondary} />}
        contentContainerStyle={[styles.list, groups.length === 0 && styles.listGrow]}
        ListHeaderComponent={
          <View style={styles.header}>
            {error && <Banner tone="danger" message={error} actionLabel={t.common.retry} onAction={refresh} />}
            {groups.length > 0 && (
              <Text style={[Type.footnote, { color: colors.textSecondary }]}>
                {t.cards.summary(active, groups.length)}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loaded && !loading ? (
            <EmptyState
              icon="brain.head.profile"
              title={t.cards.emptyTitle}
              message={t.cards.emptyMessage}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Card padded={false} style={styles.group}>
            <View style={[styles.groupHeader, { borderBottomColor: colors.separator }]}>
              <Text style={[Type.caption1, { color: colors.textTertiary }]}>
                {t.cards.source(formatDateTime(item.createdAt))}
              </Text>
              <Text style={[Type.footnote, { color: colors.textSecondary }]} numberOfLines={2}>
                {item.diary ? item.diary.content : t.cards.diaryGone}
              </Text>
            </View>
            {item.cards.map((card, i) => (
              <View
                key={card.id}
                style={[
                  styles.cardRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                  card.superseded_by && styles.superseded,
                ]}>
                <Text style={[Type.callout, styles.assertion, { color: colors.text }]}>{card.assertion}</Text>
                <View style={styles.meta}>
                  <View style={[styles.track, { backgroundColor: colors.fill }]}>
                    <View
                      style={[
                        styles.fillBar,
                        {
                          width: `${Math.round(card.confidence * 100)}%`,
                          backgroundColor:
                            confidenceTone(card.confidence) === 'success'
                              ? colors.success
                              : confidenceTone(card.confidence) === 'tint'
                                ? colors.tint
                                : colors.warning,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[Type.caption1, { color: colors.textTertiary }]}>
                    {t.cards.confidence(card.confidence.toFixed(1))}
                  </Text>
                  {card.superseded_by && <Pill label={t.cards.superseded} tone="neutral" />}
                </View>
              </View>
            ))}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 20, gap: 14 },
  listGrow: { flexGrow: 1, justifyContent: 'center' },
  header: { gap: 10 },
  group: {},
  groupHeader: { paddingHorizontal: 16, paddingVertical: 12, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  cardRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  superseded: { opacity: 0.5 },
  assertion: { lineHeight: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden', maxWidth: 140 },
  fillBar: { height: 4, borderRadius: 2 },
});
