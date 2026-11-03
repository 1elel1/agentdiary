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
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { useProfileStore } from '@/stores/profile-store';

// 预设状态(微信状态式)在字典里 t.status.presets:点选即填,也可自由输入
const MAX = 50;

export default function StatusEditorScreen() {
  const { colors } = useTheme();
  const t = useT();
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
      dialog.alert(t.common.saveFailed, e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const trimmed = text.trim();

  return (
    <>
      <Stack.Screen
        options={{
          title: t.status.title,
          headerLeft: () => <HeaderButton title={t.common.cancel} onPress={() => router.back()} />,
          headerRight: () => (
            <HeaderButton title={t.status.set} bold loading={busy} disabled={!trimmed} onPress={() => save(trimmed)} />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[Type.footnote, styles.hint, { color: colors.textSecondary }]}>{t.status.hint}</Text>

        <View style={styles.presets}>
          {t.status.presets.map((p) => {
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
          placeholder={t.status.placeholder}
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
          <Button title={t.status.clear} variant="dangerSoft" fullWidth onPress={() => save(null)} disabled={busy} style={styles.clear} />
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
