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
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { useProfileStore } from '@/stores/profile-store';

type Panel = 'name' | 'password' | 'delete' | null;

export default function SettingsScreen() {
  const { colors } = useTheme();
  const t = useT();
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
      dialog.alert(t.settings.renameFailed, e instanceof Error ? e.message : String(e));
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
      dialog.alert(t.settings.passwordChanged, t.settings.passwordChangedMessage);
    } catch (e) {
      dialog.alert(t.settings.renameFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // 注销走两道关:弹层里输密码,再弹一次不可恢复的确认(自绘弹窗,三端可用)
  const confirmDeleteAccount = async () => {
    if (!delPwd || saving) return;
    setPanel(null);
    const ok = await dialog.confirm({
      title: t.settings.deleteConfirmTitle,
      message: t.settings.deleteConfirmMessage,
      confirmText: t.settings.deleteConfirm,
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
      dialog.alert(t.settings.deleteFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ListGroup title={t.settings.account}>
        <ListRow icon="person.fill" iconColor={colors.tint} title={t.settings.username} value={username ?? ''} onPress={() => open('name')} />
        <ListRow icon="key.fill" iconColor="#5856D6" title={t.settings.changePassword} onPress={() => open('password')} />
      </ListGroup>

      <ListGroup title={t.settings.data} footer={t.settings.dataFooter}>
        <ListRow icon="trash.fill" iconColor="#FF3B30" title={t.settings.deleteAccount} destructive onPress={() => open('delete')} />
      </ListGroup>

      {/* 改名 */}
      <Sheet visible={panel === 'name'} onClose={() => setPanel(null)} title={t.settings.renameTitle}>
        <View style={styles.form}>
          <TextField
            tone="fill"
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder={t.settings.renamePlaceholder}
            maxLength={20}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={saveName}
          />
          <Button title={t.common.save} fullWidth loading={saving} disabled={!nameDraft.trim() || nameDraft.trim() === username} onPress={saveName} />
        </View>
      </Sheet>

      {/* 改密 */}
      <Sheet visible={panel === 'password'} onClose={() => setPanel(null)} title={t.settings.changePassword}>
        <View style={styles.form}>
          <TextField tone="fill" value={oldPwd} onChangeText={setOldPwd} placeholder={t.settings.currentPassword} secureTextEntry autoFocus />
          <TextField tone="fill" value={newPwd} onChangeText={setNewPwd} placeholder={t.settings.newPassword} secureTextEntry onSubmitEditing={savePassword} />
          <Text style={[Type.footnote, { color: colors.textSecondary }]}>{t.settings.passwordNote}</Text>
          <Button title={t.common.save} fullWidth loading={saving} disabled={!oldPwd || newPwd.length < 6} onPress={savePassword} />
        </View>
      </Sheet>

      {/* 注销 */}
      <Sheet visible={panel === 'delete'} onClose={() => setPanel(null)} title={t.settings.deleteAccount}>
        <View style={styles.form}>
          <Text style={[Type.footnote, { color: colors.textSecondary }]}>{t.settings.deleteNote}</Text>
          <TextField tone="fill" value={delPwd} onChangeText={setDelPwd} placeholder={t.settings.currentPassword} secureTextEntry autoFocus />
          <Button title={t.settings.deleteButton} variant="danger" fullWidth loading={saving} disabled={!delPwd} onPress={confirmDeleteAccount} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  form: { gap: 12, paddingTop: 4 },
});
