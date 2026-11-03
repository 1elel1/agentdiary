import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { DialogHost } from '@/components/ui/dialog-host';
import { Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';

export const unstable_settings = {
  anchor: '(tabs)',
};

// 登录态从 SecureStore 恢复前先按住启动图,避免闪一下登录页
SplashScreen.preventAutoHideAsync().catch(() => {});

function navTheme(scheme: 'light' | 'dark'): NavTheme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Palette[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.tint,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.separator,
      notification: c.danger,
    },
  };
}

export default function RootLayout() {
  const { scheme, colors } = useTheme();
  const { hydrated, hydrate } = useAuthStore();
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  // 设置(含界面语言)也要先恢复,否则首帧会先闪一下默认语言
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const t = useT();
  const ready = hydrated && settingsHydrated;

  useEffect(() => {
    hydrate();
    hydrateSettings();
  }, [hydrate, hydrateSettings]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme(scheme)}>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTintColor: colors.tint,
            headerStyle: { backgroundColor: colors.background },
            headerTitleStyle: { color: colors.text, fontWeight: '600', fontSize: 17 },
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.background },
            // Web 上的 JS 头默认居左,统一成 iOS 的居中
            headerTitleAlign: 'center',
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="diary-editor" options={{ presentation: 'modal', title: t.screens.diaryEditor }} />
          <Stack.Screen name="persona-editor" options={{ presentation: 'modal', title: t.screens.personaEditor }} />
          <Stack.Screen name="status-editor" options={{ presentation: 'modal', title: t.screens.statusEditor }} />
          <Stack.Screen name="appearance" options={{ presentation: 'modal', title: t.screens.appearance }} />
          <Stack.Screen
            name="visibility-picker"
            options={{ presentation: 'modal', title: t.screens.visibilityPicker }}
          />
          <Stack.Screen name="pattern-setup" options={{ presentation: 'modal', title: t.screens.patternSetup }} />
          <Stack.Screen name="settings" options={{ title: t.screens.settings }} />
          <Stack.Screen name="persona-cards" options={{ title: t.screens.personaCards }} />
          <Stack.Screen name="visit/[userId]" options={{ title: '' }} />
          <Stack.Screen name="real-chats" options={{ title: t.screens.realChats }} />
        </Stack>
        <DialogHost />
        <StatusBar style={Platform.OS === 'android' ? (scheme === 'dark' ? 'light' : 'dark') : 'auto'} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
