import { router, usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SlashNav, type NavItem } from '@/components/slash-nav';
import { useColorScheme } from '@/hooks/use-color-scheme';

// 导航是底部的条纹条(SlashNav):静止时只是一道纹理,按下浮出标签,横划斩过即跳转。
// 右下角 + 号因此回归单一职责——只负责写日记,不再兼当导航入口。
//
// TabList 仍必须挂在 Tabs 下(display:none 隐藏):trigger 一旦不在 children 里,
// navigator 零屏幕会启动即崩(v3.1 的教训);实际跳转走 router。
const NAV_ITEMS: NavItem[] = [
  { key: '/', label: '日记' },
  { key: '/chats', label: '对话' },
  { key: '/settings', label: '设置' },
];

export default function TabLayout() {
  const scheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const dark = scheme === 'dark';
  const pathname = usePathname();

  const go = (key: string) => {
    if (key === pathname) return;
    if (key === '/settings') {
      router.push('/settings');
    } else {
      // tab 间切换:navigate 会命中 tab 路由器的 switch,replace 在
      // headless tabs 下切不动(实测)
      router.navigate(key as '/' | '/chats');
    }
  };

  return (
    // FAB 和导航条必须是 Tabs 的兄弟而非子节点:Tabs 会把非 TabList/TabSlot
    // 的子节点塞进一条 0×0 的包装链,绝对定位会整个跑出屏幕
    <View style={styles.root}>
      <Tabs style={styles.root}>
        <TabList style={styles.hiddenTabList}>
          <TabTrigger name="index" href="/" />
          <TabTrigger name="chats" href="/chats" />
        </TabList>
        <TabSlot style={styles.slot} />
      </Tabs>

      {/* 写日记。位置抬到导航条之上,避免和条纹的横划手势抢触点 */}
      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: dark ? '#f4f5f8' : '#ffffff',
            bottom: insets.bottom + 96,
          },
        ]}
        onPress={() => router.push('/diary-editor')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <SlashNav items={NAV_ITEMS} activeKey={pathname} onSelect={go} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hiddenTabList: { display: 'none' },
  slot: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 28,
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  fabText: { color: '#0b0c12', fontSize: 42, lineHeight: 48, fontWeight: '300' },
});
