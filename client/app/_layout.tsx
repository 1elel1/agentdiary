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

  useEffect(() => {
    hydrate();
    hydrateSettings();
  }, [hydrate, hydrateSettings]);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  if (!hydrated) {
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
          <Stack.Screen name="diary-editor" options={{ presentation: 'modal', title: '写日记' }} />
          <Stack.Screen name="persona-editor" options={{ presentation: 'modal', title: '对外形象' }} />
          <Stack.Screen name="status-editor" options={{ presentation: 'modal', title: '今日状态' }} />
          <Stack.Screen name="appearance" options={{ presentation: 'modal', title: '外观' }} />
          <Stack.Screen
            name="visibility-picker"
            options={{ presentation: 'modal', title: '指定可见的人' }}
          />
          <Stack.Screen name="pattern-setup" options={{ presentation: 'modal', title: '手势锁' }} />
          <Stack.Screen name="settings" options={{ title: '账号与安全' }} />
          <Stack.Screen name="persona-cards" options={{ title: '人格卡片' }} />
          <Stack.Screen name="visit/[userId]" options={{ title: '' }} />
          <Stack.Screen name="real-chats" options={{ title: '真人聊天' }} />
        </Stack>
        <DialogHost />
        <StatusBar style={Platform.OS === 'android' ? (scheme === 'dark' ? 'light' : 'dark') : 'auto'} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
