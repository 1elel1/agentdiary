import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { SectionLabel } from '@/components/ui/large-header';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BACKGROUND_PRESETS, type BackgroundSetting } from '@/lib/backgrounds';
import { dialog } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { useSettingsStore } from '@/stores/settings-store';

function sameSetting(a: BackgroundSetting, b: BackgroundSetting): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'preset' && b.kind === 'preset') return a.id === b.id;
  if (a.kind === 'custom' && b.kind === 'custom') return a.uri === b.uri;
  return true;
}

// 选中的图片拷进应用文档目录,避免相册缓存被系统清理后背景失效
async function pickAndStoreImage(slot: 'diary' | 'chat'): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]) return null;
  const src = result.assets[0].uri;
  const ext = src.split('.').pop()?.split('?')[0] || 'jpg';
  const dest = `${FileSystem.documentDirectory}bg-${slot}.${ext}`;
  await FileSystem.copyAsync({ from: src, to: dest });
  // 加时间戳参数绕过 Image 缓存(同名文件更新后不刷新)
  return `${dest}?t=${Date.now()}`;
}

function Swatch({
  selected,
  onPress,
  label,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.swatchWrap, { opacity: pressed ? 0.8 : 1 }]}>
      <View style={[styles.swatchRing, { borderColor: selected ? colors.tint : 'transparent' }]}>
        <View style={[styles.swatch, { borderColor: colors.separator }]}>{children}</View>
      </View>
      <Text style={[Type.caption1, { color: selected ? colors.tint : colors.textSecondary, fontWeight: selected ? '600' : '400' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function BackgroundPicker({
  title,
  value,
  onChange,
  slot,
}: {
  title: string;
  value: BackgroundSetting;
  onChange: (bg: BackgroundSetting) => void;
  slot: 'diary' | 'chat';
}) {
  const { colors, scheme } = useTheme();
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await pickAndStoreImage(slot);
      if (uri) onChange({ kind: 'custom', uri });
    } catch (e) {
      dialog.alert('选图失败', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <SectionLabel>{title}</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Swatch selected={value.kind === 'default'} onPress={() => onChange({ kind: 'default' })} label="默认">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
        </Swatch>
        {BACKGROUND_PRESETS.map((p) => (
          <Swatch
            key={p.id}
            selected={sameSetting(value, { kind: 'preset', id: p.id })}
            onPress={() => onChange({ kind: 'preset', id: p.id })}
            label={p.name}>
            <LinearGradient colors={p[scheme]} style={StyleSheet.absoluteFill} />
          </Swatch>
        ))}
        <Swatch selected={value.kind === 'custom'} onPress={upload} label={value.kind === 'custom' ? '相册(换一张)' : '相册'}>
          {value.kind === 'custom' ? (
            <Image source={{ uri: value.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.uploadSwatch, { backgroundColor: colors.fill }]}>
              <IconSymbol name="photo.fill" size={22} color={colors.textTertiary} />
            </View>
          )}
        </Swatch>
      </ScrollView>
    </View>
  );
}

export default function AppearanceScreen() {
  const { diaryBg, chatBg, setDiaryBg, setChatBg, lockPattern } = useSettingsStore();
  const { colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <BackgroundPicker title="日记背景" value={diaryBg} onChange={setDiaryBg} slot="diary" />
      <BackgroundPicker title="聊天背景" value={chatBg} onChange={setChatBg} slot="chat" />
      <Text style={[Type.caption1, styles.hint, { color: colors.textTertiary }]}>
        自定义图片会加一层淡淡的遮罩来保证文字可读;更换后立即生效。
      </Text>

      <View style={styles.lockGroup}>
        <ListGroup title="私密日记手势锁" footer="手势锁只存在这台设备上,用于打开加了锁的日记。忘记图案时,重新登录即可重置。">
          <ListRow
            icon="lock.fill"
            iconColor="#8E8E93"
            title={lockPattern ? '修改图案' : '设置图案'}
            value={lockPattern ? '已开启' : '未开启'}
            onPress={() => router.push({ pathname: '/pattern-setup', params: { mode: 'set' } })}
          />
          {lockPattern ? (
            <ListRow
              icon="lock.open.fill"
              iconColor="#FF9F0A"
              title="关闭手势锁"
              onPress={() => router.push({ pathname: '/pattern-setup', params: { mode: 'disable' } })}
            />
          ) : null}
        </ListGroup>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 40 },
  section: { marginBottom: 10 },
  row: { paddingHorizontal: 20, gap: 12 },
  swatchWrap: { alignItems: 'center', gap: 6 },
  swatchRing: { borderWidth: 2, borderRadius: Radius.lg, padding: 3 },
  swatch: {
    width: 74,
    height: 104,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  uploadSwatch: { alignItems: 'center', justifyContent: 'center' },
  hint: { paddingHorizontal: 20, marginTop: 8, marginBottom: 20, lineHeight: 16 },
  lockGroup: { paddingHorizontal: 20 },
});
