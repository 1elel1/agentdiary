import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SegmentedControl } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/stores/auth-store';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { login, register } = useAuthStore();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      haptic.success();
      router.replace('/');
    } catch (e) {
      haptic.error();
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <LinearGradient
            colors={[colors.tint, '#9F9CFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mark}>
            <IconSymbol name="book.fill" size={34} color="#fff" weight="semibold" />
          </LinearGradient>
          <Text style={[Type.title1, { color: colors.text }]}>AgentDiary</Text>
          <Text style={[Type.subhead, { color: colors.textSecondary }]}>写日记,养一个像你的化身</Text>
        </View>

        <Card style={styles.card}>
          <SegmentedControl<Mode>
            options={[
              { key: 'login', label: '登录' },
              { key: 'register', label: '注册' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
          />
          <View style={styles.fields}>
            <TextField
              tone="fill"
              icon="person.fill"
              placeholder="用户名"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              value={username}
              onChangeText={setUsername}
              returnKeyType="next"
            />
            <TextField
              tone="fill"
              icon="lock.fill"
              placeholder={mode === 'register' ? '密码(至少 6 位)' : '密码'}
              secureTextEntry={!showPassword}
              textContentType={mode === 'register' ? 'newPassword' : 'password'}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              returnKeyType="go"
              right={
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} accessibilityLabel="显示密码">
                  <IconSymbol
                    name={showPassword ? 'eye.slash.fill' : 'eye.fill'}
                    size={18}
                    color={colors.textTertiary}
                  />
                </Pressable>
              }
            />
          </View>
          {error && <Text style={[Type.footnote, styles.error, { color: colors.danger }]}>{error}</Text>}
          <Button
            title={mode === 'login' ? '登录' : '创建账号'}
            size="lg"
            fullWidth
            loading={busy}
            disabled={!username.trim() || !password}
            onPress={submit}
            style={styles.submit}
          />
        </Card>

        <View style={styles.notice}>
          <IconSymbol name="lock.fill" size={13} color={colors.textTertiary} />
          <Text style={[Type.caption1, styles.noticeText, { color: colors.textTertiary }]}>
            日记是最高敏感级数据,只用于训练你自己的化身。别人和你的化身对话时,看不到日记原文。
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 8, marginBottom: 28 },
  mark: {
    width: 76,
    height: 76,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#5E5CE6',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  card: { gap: 14, padding: 18 },
  fields: { gap: 10 },
  error: { textAlign: 'center' },
  submit: { marginTop: 2 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 28,
    paddingHorizontal: 8,
  },
  noticeText: { flex: 1, lineHeight: 17 },
});
