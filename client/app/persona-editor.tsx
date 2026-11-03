import { useHeaderHeight } from '@react-navigation/elements';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { HeaderButton } from '@/components/ui/header-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TextArea } from '@/components/ui/text-field';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dialog } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { useProfileStore } from '@/stores/profile-store';

export default function PersonaEditorScreen() {
  const { colors } = useTheme();
  const t = useT();
  const headerHeight = useHeaderHeight();
  const userId = useAuthStore((s) => s.userId);
  const { loaded, persona, personaMaxChars, refresh, savePersona } = useProfileStore();
  const [text, setText] = useState(persona ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loaded) refresh(userId).catch(() => {});
  }, [loaded, refresh, userId]);

  // 初次进入时 store 里可能还没拉到,拉到后同步进编辑框(用户没开始打字的话)
  useEffect(() => {
    setText((t) => (t.length === 0 && persona ? persona : t));
  }, [persona]);

  const trimmed = text.trim();
  const dirty = trimmed !== (persona ?? '');
  const overLimit = trimmed.length > personaMaxChars;
  const nearLimit = trimmed.length > personaMaxChars * 0.9;

  const save = async () => {
    if (!dirty || overLimit || saving) return;
    setSaving(true);
    try {
      await savePersona(trimmed || null);
      haptic.success();
      router.back();
    } catch (e) {
      haptic.error();
      dialog.alert(t.common.saveFailed, e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const clear = async () => {
    const ok = await dialog.confirm({
      title: t.persona.clearTitle,
      message: t.persona.clearMessage,
      confirmText: t.common.clear,
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await savePersona(null);
      haptic.success();
      router.back();
    } catch (e) {
      dialog.alert(t.common.actionFailed, e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const close = async () => {
    if (dirty) {
      const ok = await dialog.confirm({ title: t.persona.discardTitle, confirmText: t.common.discard, destructive: true });
      if (!ok) return;
    }
    router.back();
  };

  const appendStarter = (starter: string) => {
    haptic.selection();
    setText((t) => {
      const base = t.trimEnd();
      return base.length === 0 ? starter : `${base}\n${starter}`;
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
      <Stack.Screen
        options={{
          title: t.persona.title,
          headerLeft: () => <HeaderButton title={t.common.cancel} onPress={close} />,
          headerRight: () => (
            <HeaderButton title={t.common.save} bold loading={saving} disabled={!dirty || overLimit} onPress={save} />
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Card tone="tint" style={styles.explain}>
          <View style={styles.explainRow}>
            <IconSymbol name="sparkles" size={18} color={colors.tint} />
            <Text style={[Type.headline, { color: colors.text }]}>{t.persona.heading}</Text>
          </View>
          <Text style={[Type.footnote, styles.explainText, { color: colors.textSecondary }]}>
            {t.persona.explain}
          </Text>
        </Card>

        {/* 引导句:点一下就把开头填进去,降低「不知道写什么」的门槛 */}
        <View style={styles.prompts}>
          {t.persona.prompts.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => appendStarter(p.starter)}
              style={({ pressed }) => [
                styles.prompt,
                { backgroundColor: colors.surface, borderColor: colors.separator, opacity: pressed ? 0.7 : 1 },
              ]}>
              <IconSymbol name="plus" size={11} color={colors.tint} weight="bold" />
              <Text style={[Type.footnote, { color: colors.text, fontWeight: '600' }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        <TextArea
          value={text}
          onChangeText={setText}
          minHeight={240}
          autoFocus={!persona}
          placeholder={t.persona.placeholder}
          error={overLimit ? t.persona.over(trimmed.length - personaMaxChars) : undefined}
        />
        <Text
          style={[
            Type.caption1,
            styles.counter,
            { color: overLimit ? colors.danger : nearLimit ? colors.warning : colors.textTertiary },
          ]}>
          {trimmed.length} / {personaMaxChars}
        </Text>

        {persona && (
          <Button title={t.persona.clear} variant="dangerSoft" fullWidth onPress={clear} style={styles.clear} disabled={saving} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  explain: { gap: 8 },
  explainRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  explainText: { lineHeight: 19 },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  counter: { textAlign: 'right', marginRight: 4, marginTop: -4 },
  clear: { marginTop: 12 },
});
