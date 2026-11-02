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
import { APP_VERSION } from '@/constants/app';
import { Radius, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
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
  const { status, persona, cardCount, refresh, reset } = useProfileStore();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [checking, setChecking] = useState(false);

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
      dialog.alert('头像更新失败', e instanceof Error ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
    }
  };

  const checkUpdate = async () => {
    if (checking) return;
    if (!Updates.isEnabled) {
      dialog.alert('开发模式', '当前不是发布版,无法检查 OTA 更新。');
      return;
    }
    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        const idx = await dialog.show('新版本已下载', '重启应用即可生效。', [
          { label: '稍后', style: 'cancel' },
          { label: '立即重启' },
        ]);
        if (idx === 1) await Updates.reloadAsync();
      } else {
        dialog.alert('已是最新版本', `当前 ${APP_VERSION}`);
      }
    } catch (e) {
      dialog.alert('检查更新失败', e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const confirmLogout = async () => {
    const ok = await dialog.confirm({
      title: '退出登录?',
      message: '本机的离线日记队列会保留,下次登录后继续同步。',
      confirmText: '退出',
      destructive: true,
    });
    if (!ok) return;
    await logout();
    reset();
    router.replace('/login');
  };

  const personaSubtitle = persona
    ? persona.split('\n')[0]
    : '告诉别人你希望被怎样了解,化身会据此呈现你';

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LargeHeader title="我" />

        {/* 身份卡 */}
        <View
          style={[
            styles.hero,
            { backgroundColor: colors.surface },
            cardShadow(scheme),
            isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
          ]}>
          <Pressable onPress={pickAvatar} hitSlop={6} accessibilityLabel="更换头像">
            <Avatar username={username ?? '我'} userId={userId} avatarTs={avatarTs} size={76} />
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
              {status ? `今日:${status}` : '设个今日状态'}
            </Text>
          </Pressable>
        </View>

        <ListGroup
          title="我的化身"
          footer="对外形象是写给别人看的自我介绍;人格卡片是化身从日记里学到的你。两者一起决定化身在别人面前的样子。">
          <ListRow
            icon="person.text.rectangle.fill"
            iconColor={colors.tint}
            title="对外形象"
            subtitle={personaSubtitle}
            value={persona ? undefined : '未设置'}
            onPress={() => router.push('/persona-editor')}
          />
          <ListRow
            icon="brain.head.profile"
            iconColor={colors.info}
            title="人格卡片"
            value={`${cardCount} 张`}
            onPress={() => router.push('/persona-cards')}
          />
          <ListRow
            icon="bubble.left.fill"
            iconColor={colors.success}
            title="和我的化身聊聊"
            subtitle="检验它像不像你"
            onPress={() =>
              router.push({
                pathname: '/visit/[userId]',
                params: { userId: userId ?? '', username: username ?? '', builtin: '', avatarTs: avatarTs ?? '' },
              })
            }
          />
        </ListGroup>

        <ListGroup title="偏好">
          <ListRow
            icon="paintbrush.fill"
            iconColor={colors.warning}
            title="外观"
            subtitle="日记与聊天的背景"
            onPress={() => router.push('/appearance')}
          />
          <ListRow
            icon="lock.fill"
            iconColor="#8E8E93"
            title="手势锁"
            value={lockPattern ? '已开启' : '未开启'}
            onPress={() => router.push({ pathname: '/pattern-setup', params: { mode: 'set' } })}
          />
        </ListGroup>

        <ListGroup title="账号">
          <ListRow
            icon="key.fill"
            iconColor="#5856D6"
            title="账号与安全"
            subtitle="改名、改密码、注销"
            onPress={() => router.push('/settings')}
          />
          <ListRow
            icon="arrow.clockwise"
            iconColor="#34C759"
            title={checking ? '正在检查更新…' : '检查更新'}
            value={APP_VERSION}
            onPress={checkUpdate}
            chevron={false}
          />
        </ListGroup>

        <Button
          title="退出登录"
          variant="dangerSoft"
          fullWidth
          icon="rectangle.portrait.and.arrow.right"
          onPress={confirmLogout}
        />
        <Text style={[Type.caption1, styles.version, { color: colors.textTertiary }]}>
          AgentDiary {APP_VERSION}
        </Text>
      </ScrollView>
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
