// 手势锁设置页:mode=set 绘制两次确认;mode=disable 验证旧图案后关闭。
// 已有图案时进入 set 模式会先要求验证旧图案。

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PatternLock } from '@/components/pattern-lock';
import { HeaderButton } from '@/components/ui/header-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settings-store';

type Step = 'verify' | 'draw' | 'confirm';

export default function PatternSetupScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { colors } = useTheme();
  const t = useT();
  const disable = mode === 'disable';
  const { lockPattern, setLockPattern } = useSettingsStore();

  const [step, setStep] = useState<Step>(lockPattern ? 'verify' : 'draw');
  const [firstDraw, setFirstDraw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hint = step === 'verify' ? t.pattern.verify : step === 'draw' ? t.pattern.draw : t.pattern.confirm;

  const onComplete = async (pattern: string) => {
    setError(null);
    if (step === 'verify') {
      if (pattern !== lockPattern) {
        haptic.error();
        setError(t.pattern.wrong);
        return;
      }
      if (disable) {
        await setLockPattern(null);
        haptic.success();
        router.back();
        return;
      }
      setStep('draw');
      return;
    }
    if (step === 'draw') {
      setFirstDraw(pattern);
      setStep('confirm');
      haptic.light();
      return;
    }
    if (pattern !== firstDraw) {
      haptic.error();
      setError(t.pattern.mismatch);
      setFirstDraw(null);
      setStep('draw');
      return;
    }
    await setLockPattern(pattern);
    haptic.success();
    router.back();
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: disable ? t.pattern.disableTitle : t.pattern.setTitle,
          headerLeft: () => <HeaderButton title={t.common.cancel} onPress={() => router.back()} />,
        }}
      />
      <View style={[styles.iconWrap, { backgroundColor: colors.tintSoft }]}>
        <IconSymbol name={disable ? 'lock.open.fill' : 'lock.fill'} size={26} color={colors.tint} />
      </View>
      <Text style={[Type.title3, styles.hint, { color: colors.text }]}>{hint}</Text>
      <Text style={[Type.footnote, styles.error, { color: error ? colors.danger : 'transparent' }]}>
        {error ?? ' '}
      </Text>
      <PatternLock onComplete={onComplete} />
      <Text style={[Type.footnote, styles.note, { color: colors.textTertiary }]}>{t.pattern.note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 28, paddingHorizontal: 24, alignItems: 'center' },
  iconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  hint: { textAlign: 'center' },
  error: { textAlign: 'center', marginTop: 6, marginBottom: 18 },
  note: { textAlign: 'center', marginTop: 32, lineHeight: 18 },
});
