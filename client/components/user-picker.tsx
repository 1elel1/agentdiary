// 选人:搜索用户名 → 勾选 → 已选的人以胶囊显示。给「指定的人」白名单用。
// 全站用户不再罗列,所以只能靠搜。

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TextField } from '@/components/ui/text-field';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import type { UserSummary } from '@/lib/types';

export type SelectedUsers = Map<string, string>; // id → username

export function UserPicker({
  selected,
  onChange,
  tone = 'fill',
}: {
  selected: SelectedUsers;
  onChange: (next: SelectedUsers) => void;
  tone?: 'fill' | 'surface';
}) {
  const { colors } = useTheme();
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .searchUsers(q)
        .then((list) => setResults(list.filter((u) => !u.is_builtin)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = (u: UserSummary) => {
    haptic.selection();
    const next = new Map(selected);
    if (next.has(u.id)) next.delete(u.id);
    else next.set(u.id, u.username);
    onChange(next);
  };

  return (
    <View style={styles.wrap}>
      {selected.size > 0 && (
        <View style={styles.chips}>
          {[...selected.entries()].map(([id, name]) => (
            <Pressable
              key={id}
              onPress={() => {
                const next = new Map(selected);
                next.delete(id);
                onChange(next);
              }}
              style={[styles.chip, { backgroundColor: colors.tintSoft }]}>
              <Text style={[Type.footnote, { color: colors.tint, fontWeight: '600' }]}>{name}</Text>
              <IconSymbol name="xmark" size={10} color={colors.tint} weight="bold" />
            </Pressable>
          ))}
        </View>
      )}
      <TextField
        tone={tone}
        icon="magnifyingglass"
        placeholder={t.picker.searchPlaceholder}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        right={searching ? <ActivityIndicator size="small" color={colors.textTertiary} /> : undefined}
      />
      {query.trim().length > 0 && !searching && results.length === 0 && (
        <Text style={[Type.footnote, styles.empty, { color: colors.textTertiary }]}>{t.chats.noMatch(query.trim())}</Text>
      )}
      {results.map((u) => {
        const checked = selected.has(u.id);
        return (
          <Pressable key={u.id} style={styles.row} onPress={() => toggle(u)}>
            <Avatar username={u.username} userId={u.id} avatarTs={u.avatar_updated_at} size={34} />
            <Text style={[Type.callout, styles.name, { color: colors.text }]} numberOfLines={1}>
              {u.username}
            </Text>
            <IconSymbol
              name={checked ? 'checkmark.circle.fill' : 'circle'}
              size={22}
              color={checked ? colors.tint : colors.textTertiary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  empty: { marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  name: { flex: 1 },
});
