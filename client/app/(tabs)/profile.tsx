import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useFocusEffect } from 'expo-router';
import * as Updates from 'expo-updates';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LargeHeader } from '@/components/ui/large-header';
import { ListGroup, ListRow } from '@/components/ui/list';
import { ActionSheet } from '@/components/ui/sheet';
import { APP_VERSION } from '@/constants/app';
import { Radius, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { LANGUAGE_CODES, LANGUAGE_NAMES, useT, type LanguageSetting } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { useProfileStore } from '@/stores/profile-store';
import { useSettingsStore } from '@/stores/settings-store';

export default function ProfileScreen() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Redirect href="/login" />;
  return <Profile />;
}

function Profile() {
  const insets = useSafeAreaInsets();
  const { colors, scheme, isDark } = useTheme();
  const { username, userId, avatarTs, logout, setAvatarTs } = useAuthStore();
  const lockPattern = useSettingsStore((s) => s.lockPattern);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const t = useT();
  const { status, persona, cardCount, refresh, reset } = useProfileStore();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [langSheet, setLangSheet] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh(userId).catch(() => {});
    }, [refresh, userId]),
  );

  // 更换头像:选图(方形裁剪)→ base64 上传;服务端时间戳兼作缓存指纹
  const pickAvatar = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      const b64 = result.assets?.[0]?.base64;
      if (result.canceled || !b64) return;
      const r = await api.uploadAvatar(b64);
      await setAvatarTs(r.avatar_updated_at);
      haptic.success();
    } catch (e) {
      dialog.alert(t.profile.avatarFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
    }
  };

  const checkUpdate = async () => {
    if (checking) return;
    if (!Updates.isEnabled) {
      dialog.alert(t.profile.devMode, t.profile.devModeMessage);
      return;
    }
    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        const idx = await dialog.show(t.profile.updateReady, t.profile.updateReadyMessage, [
          { label: t.common.later, style: 'cancel' },
          { label: t.profile.restartNow },
        ]);
        if (idx === 1) await Updates.reloadAsync();
      } else {
        dialog.alert(t.profile.upToDate, t.profile.currentVersion(APP_VERSION));
      }
    } catch (e) {
      dialog.alert(t.profile.updateFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const confirmLogout = async () => {
    const ok = await dialog.confirm({
      title: t.profile.logoutTitle,
      message: t.profile.logoutMessage,
      confirmText: t.profile.logoutConfirm,
      destructive: true,
    });
    if (!ok) return;
    await logout();
    reset();
    router.replace('/login');
  };

  // 界面语言:存本机设置,化身回复语言随之改变(X-Language 请求头)
  const pickLanguage = (setting: LanguageSetting) => {
    haptic.selection();
    setLanguage(setting).catch(() => {});
  };

  const personaSubtitle = persona ? persona.split('\n')[0] : t.profile.personaHint;

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LargeHeader title={t.profile.title} />

        {/* 身份卡 */}
        <View
          style={[
            styles.hero,
            { backgroundColor: colors.surface },
            cardShadow(scheme),
            isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
          ]}>
          <Pressable onPress={pickAvatar} hitSlop={6} accessibilityLabel={t.profile.changeAvatar}>
            <Avatar username={username ?? t.profile.title} userId={userId} avatarTs={avatarTs} size={76} />
            <View style={[styles.avatarBadge, { backgroundColor: colors.tint, borderColor: colors.surface }]}>
              {avatarBusy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <IconSymbol name="camera.fill" size={12} color="#fff" weight="semibold" />
              )}
            </View>
          </Pressable>
          <Text style={[Type.title2, styles.name, { color: colors.text }]} numberOfLines={1}>
            {username}
          </Text>
          <Pressable
            onPress={() => router.push('/status-editor')}
            style={({ pressed }) => [
              styles.statusChip,
              { backgroundColor: status ? colors.tintSoft : colors.fill, opacity: pressed ? 0.7 : 1 },
            ]}>
            <IconSymbol name="face.smiling" size={14} color={status ? colors.tint : colors.textSecondary} />
            <Text
              style={[Type.footnote, { color: status ? colors.tint : colors.textSecondary, fontWeight: '600' }]}
              numberOfLines={1}>
              {status ? t.common.today(status) : t.profile.setStatus}
            </Text>
          </Pressable>
        </View>

        <ListGroup title={t.profile.myAvatar} footer={t.profile.myAvatarFooter}>
          <ListRow
            icon="person.text.rectangle.fill"
            iconColor={colors.tint}
            title={t.profile.persona}
            subtitle={personaSubtitle}
            value={persona ? undefined : t.common.notSet}
            onPress={() => router.push('/persona-editor')}
          />
          <ListRow
            icon="brain.head.profile"
            iconColor={colors.info}
            title={t.profile.cards}
            value={t.common.cardsShort(cardCount)}
            onPress={() => router.push('/persona-cards')}
          />
          <ListRow
            icon="bubble.left.fill"
            iconColor={colors.success}
            title={t.profile.chatSelf}
            subtitle={t.profile.chatSelfHint}
            onPress={() =>
              router.push({
                pathname: '/visit/[userId]',
                params: { userId: userId ?? '', username: username ?? '', builtin: '', avatarTs: avatarTs ?? '' },
              })
            }
          />
        </ListGroup>

        <ListGroup title={t.profile.preferences} footer={t.profile.languageFooter}>
          <ListRow
            icon="paintbrush.fill"
            iconColor={colors.warning}
            title={t.profile.appearance}
            subtitle={t.profile.appearanceHint}
            onPress={() => router.push('/appearance')}
          />
          <ListRow
            icon="lock.fill"
            iconColor="#8E8E93"
            title={t.profile.patternLock}
            value={lockPattern ? t.common.on : t.common.off}
            onPress={() => router.push({ pathname: '/pattern-setup', params: { mode: 'set' } })}
          />
          <ListRow
            icon="globe"
            iconColor={colors.info}
            title={t.profile.language}
            value={language === 'system' ? t.profile.languageSystem : LANGUAGE_NAMES[language]}
            onPress={() => setLangSheet(true)}
          />
        </ListGroup>

        <ListGroup title={t.profile.account}>
          <ListRow
            icon="key.fill"
            iconColor="#5856D6"
            title={t.profile.security}
            subtitle={t.profile.securityHint}
            onPress={() => router.push('/settings')}
          />
          <ListRow
            icon="arrow.clockwise"
            iconColor="#34C759"
            title={checking ? t.profile.checking : t.profile.checkUpdate}
            value={APP_VERSION}
            onPress={checkUpdate}
            chevron={false}
          />
        </ListGroup>

        <Button
          title={t.profile.logout}
          variant="dangerSoft"
          fullWidth
          icon="rectangle.portrait.and.arrow.right"
          onPress={confirmLogout}
        />
        <Text style={[Type.caption1, styles.version, { color: colors.textTertiary }]}>
          AgentDiary {APP_VERSION}
        </Text>
      </ScrollView>

      {/* 界面语言:跟随系统 + 五种语言,各语言用自称显示 */}
      <ActionSheet
        visible={langSheet}
        onClose={() => setLangSheet(false)}
        title={t.profile.languageSheetTitle}
        actions={[
          {
            label: t.profile.languageSystem,
            icon: 'globe',
            selected: language === 'system',
            onPress: () => pickLanguage('system'),
          },
          ...LANGUAGE_CODES.map((code) => ({
            label: LANGUAGE_NAMES[code],
            selected: language === code,
            onPress: () => pickLanguage(code),
          })),
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: Radius.lg,
    marginTop: 6,
    marginBottom: 24,
    gap: 10,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginTop: 4 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    maxWidth: '100%',
  },
  version: { textAlign: 'center', marginTop: 18 },
});
