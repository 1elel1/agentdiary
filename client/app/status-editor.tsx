import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { HeaderButton } from '@/components/ui/header-button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dialog } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/stores/auth-store';
import { useProfileStore } from '@/stores/profile-store';

// 预设状态(微信状态式):点选即填,也可自由输入
const PRESETS = ['😊 开心', '😪 有点累', '💻 搬砖中', '📚 学习中', '🏃 运动中', '🌙 想静静', '🍜 干饭中', '✈️ 在路上'];
const MAX = 50;

export default function StatusEditorScreen() {
  const { colors } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { loaded, status, refresh, saveStatus } = useProfileStore();
  const [text, setText] = useState(status ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded) refresh(userId).catch(() => {});
  }, [loaded, refresh, userId]);

  useEffect(() => {
    setText((t) => (t.length === 0 && status ? status : t));
  }, [status]);

  const save = async (value: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await saveStatus(value);
      haptic.success();
      router.back();
    } catch (e) {
      dialog.alert('保存失败', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const trimmed = text.trim();

  return (
    <>
      <Stack.Screen
        options={{
          title: '今日状态',
          headerLeft: () => <HeaderButton title="取消" onPress={() => router.back()} />,
          headerRight: () => (
            <HeaderButton title="设为状态" bold loading={busy} disabled={!trimmed} onPress={() => save(trimmed)} />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[Type.footnote, styles.hint, { color: colors.textSecondary }]}>
          状态会展示给来找你化身聊天的人,也会影响化身今天的语气。24 小时后自动消失。
        </Text>

        <View style={styles.presets}>
          {PRESETS.map((p) => {
            const active = text === p;
            return (
              <Pressable
                key={p}
                onPress={() => {
                  haptic.selection();
                  setText(p);
                }}
                style={({ pressed }) => [
                  styles.preset,
                  {
                    backgroundColor: active ? colors.tint : colors.surface,
                    borderColor: active ? colors.tint : colors.separator,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}>
                <Text style={[Type.subhead, { color: active ? colors.onTint : colors.text, fontWeight: '500' }]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextField
          placeholder="或者自己写一个…"
          value={text}
          onChangeText={setText}
          maxLength={MAX}
          returnKeyType="done"
          onSubmitEditing={() => trimmed && save(trimmed)}
        />
        <Text style={[Type.caption1, styles.counter, { color: colors.textTertiary }]}>
          {trimmed.length} / {MAX}
        </Text>

        {status && (
          <Button title="清除状态" variant="dangerSoft" fullWidth onPress={() => save(null)} disabled={busy} style={styles.clear} />
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  hint: { lineHeight: 18 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  counter: { textAlign: 'right', marginTop: -8, marginRight: 4 },
  clear: { marginTop: 8 },
});
