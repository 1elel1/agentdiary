// 账号与安全:改名、改密码、注销。弹层式编辑,三端一致。

import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list';
import { Sheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { dialog } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/stores/auth-store';
import { useProfileStore } from '@/stores/profile-store';

type Panel = 'name' | 'password' | 'delete' | null;

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { username, logout, setUsername } = useAuthStore();
  const resetProfile = useProfileStore((s) => s.reset);
  const [panel, setPanel] = useState<Panel>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [delPwd, setDelPwd] = useState('');
  const [saving, setSaving] = useState(false);

  const open = (p: Panel) => {
    setNameDraft(username ?? '');
    setOldPwd('');
    setNewPwd('');
    setDelPwd('');
    setPanel(p);
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const r = await api.changeUsername(name);
      await setUsername(r.username);
      setPanel(null);
      haptic.success();
    } catch (e) {
      dialog.alert('修改失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!oldPwd || newPwd.length < 6 || saving) return;
    setSaving(true);
    try {
      await api.changePassword(oldPwd, newPwd);
      setPanel(null);
      haptic.success();
      dialog.alert('密码已修改', '其他设备上的登录已全部退出。');
    } catch (e) {
      dialog.alert('修改失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // 注销走两道关:弹层里输密码,再弹一次不可恢复的确认(自绘弹窗,三端可用)
  const confirmDeleteAccount = async () => {
    if (!delPwd || saving) return;
    setPanel(null);
    const ok = await dialog.confirm({
      title: '永久删除账号?',
      message: '日记、人格卡片、对外形象、化身对话记录和头像会全部删除,无法恢复。',
      confirmText: '永久删除',
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.deleteAccount(delPwd);
      setDelPwd('');
      await logout();
      resetProfile();
      router.replace('/login');
    } catch (e) {
      dialog.alert('注销失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ListGroup title="账号">
        <ListRow icon="person.fill" iconColor={colors.tint} title="账号名" value={username ?? ''} onPress={() => open('name')} />
        <ListRow icon="key.fill" iconColor="#5856D6" title="修改密码" onPress={() => open('password')} />
      </ListGroup>

      <ListGroup
        title="数据"
        footer="注销会删除账号连同全部日记、人格卡片、对话记录和头像,不可恢复。你也可以只删除单篇日记,它的衍生数据会一并删除。">
        <ListRow icon="trash.fill" iconColor="#FF3B30" title="注销账号" destructive onPress={() => open('delete')} />
      </ListGroup>

      {/* 改名 */}
      <Sheet visible={panel === 'name'} onClose={() => setPanel(null)} title="修改账号名">
        <View style={styles.form}>
          <TextField
            tone="fill"
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder="新账号名(2~20 字)"
            maxLength={20}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={saveName}
          />
          <Button title="保存" fullWidth loading={saving} disabled={!nameDraft.trim() || nameDraft.trim() === username} onPress={saveName} />
        </View>
      </Sheet>

      {/* 改密 */}
      <Sheet visible={panel === 'password'} onClose={() => setPanel(null)} title="修改密码">
        <View style={styles.form}>
          <TextField tone="fill" value={oldPwd} onChangeText={setOldPwd} placeholder="当前密码" secureTextEntry autoFocus />
          <TextField tone="fill" value={newPwd} onChangeText={setNewPwd} placeholder="新密码(至少 6 位)" secureTextEntry onSubmitEditing={savePassword} />
          <Text style={[Type.footnote, { color: colors.textSecondary }]}>修改后,其他设备的登录会全部退出。</Text>
          <Button title="保存" fullWidth loading={saving} disabled={!oldPwd || newPwd.length < 6} onPress={savePassword} />
        </View>
      </Sheet>

      {/* 注销 */}
      <Sheet visible={panel === 'delete'} onClose={() => setPanel(null)} title="注销账号">
        <View style={styles.form}>
          <Text style={[Type.footnote, { color: colors.textSecondary }]}>
            账号连同全部日记、人格卡片、对外形象、化身对话记录将被永久删除,无法恢复。输入当前密码确认。
          </Text>
          <TextField tone="fill" value={delPwd} onChangeText={setDelPwd} placeholder="当前密码" secureTextEntry autoFocus />
          <Button title="永久删除账号" variant="danger" fullWidth loading={saving} disabled={!delPwd} onPress={confirmDeleteAccount} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  form: { gap: 12, paddingTop: 4 },
});
