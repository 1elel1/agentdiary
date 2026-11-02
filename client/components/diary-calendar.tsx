// 自绘月历:标出有日记的日期,点选过滤,再点取消。零第三方依赖。

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateKey } from '@/lib/format';

export { dateKey };

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function monthMatrix(year: number, month: number): (number | null)[][] {
  // month: 0-11;周一为一周之首
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // 周一=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function DiaryCalendar({
  marked,
  selected,
  onSelect,
}: {
  marked: Set<string>; // 有日记的日期(YYYY-MM-DD,本地时区)
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const { colors } = useTheme();
  const initial = selected ? new Date(selected) : new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const todayKey = dateKey(new Date());

  return (
    <Card style={styles.card} padded={false}>
      <View style={styles.header}>
        <IconButton name="chevron.left" size={16} onPress={() => shift(-1)} accessibilityLabel="上个月" />
        <Text style={[Type.headline, { color: colors.text }]}>
          {year} 年 {month + 1} 月
        </Text>
        <IconButton name="chevron.right" size={16} onPress={() => shift(1)} accessibilityLabel="下个月" />
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={[Type.caption2, styles.weekday, { color: colors.textTertiary }]}>
            {w}
          </Text>
        ))}
      </View>

      {monthMatrix(year, month).map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={styles.cell} />;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = selected === key;
            const hasEntry = marked.has(key);
            const isToday = key === todayKey;
            return (
              <Pressable
                key={di}
                accessibilityRole="button"
                accessibilityLabel={`${month + 1}月${day}日${hasEntry ? ',有日记' : ''}`}
                style={styles.cell}
                onPress={() => onSelect(isSelected ? null : key)}>
                <View
                  style={[
                    styles.dayDisc,
                    isSelected && { backgroundColor: colors.tint },
                    isToday && !isSelected && { backgroundColor: colors.tintSoft },
                  ]}>
                  <Text
                    style={[
                      Type.subhead,
                      {
                        color: isSelected
                          ? colors.onTint
                          : isToday
                            ? colors.tint
                            : hasEntry
                              ? colors.text
                              : colors.textTertiary,
                        fontWeight: isToday || hasEntry ? '600' : '400',
                      },
                    ]}>
                    {day}
                  </Text>
                </View>
                {hasEntry && (
                  <View style={[styles.dot, { backgroundColor: isSelected ? colors.tint : colors.tint }]} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 10, paddingVertical: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', marginBottom: 6 },
  cell: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  dayDisc: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', bottom: 2, width: 5, height: 5, borderRadius: 2.5 },
});
