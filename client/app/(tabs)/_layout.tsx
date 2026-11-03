import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { useT } from '@/lib/i18n';

// 标准 iOS 底部标签栏:三个入口,图标 + 文字,始终可见。
// 之前的「条纹划动导航」实验(bd4816d5)已移除:它把标签藏起来、
// 依赖手势,和 iOS 的导航预期相悖;需要时可从 git 历史恢复。
function TabIcon({ name, color, focused }: { name: IconSymbolName; color: string; focused: boolean }) {
  return (
    <IconSymbol name={name} size={24} color={color} weight={focused ? 'semibold' : 'regular'} />
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const t = useT();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          // Web 没有底部安全区,给标签留足高度;原生端由导航库按 inset 算
          ...(Platform.OS === 'web' ? { height: 66, paddingTop: 6, paddingBottom: 8 } : null),
        },
        // 显式 lineHeight:不写的话 Android/Web 会按 normal 算,中文标签被裁掉下半截
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
        tabBarIconStyle: { marginTop: 2 },
        sceneStyle: { backgroundColor: colors.background },
      }}
      screenListeners={{ tabPress: () => haptic.selection() }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.diary,
          tabBarIcon: ({ color, focused }) => <TabIcon name="book.fill" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t.tabs.chats,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="bubble.left.and.bubble.right.fill" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.tabs.me,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person.crop.circle.fill" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
