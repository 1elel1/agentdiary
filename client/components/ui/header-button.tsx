import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 导航栏里的文字按钮:取消 / 保存 / 完成。 */
export function HeaderButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  bold = false,
  destructive = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  bold?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const color = destructive ? colors.danger : colors.tint;
  if (loading) {
    return <ActivityIndicator color={color} style={styles.button} />;
  }
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.button, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}>
      <Text style={[Type.body, { color, fontWeight: bold ? '600' : '400' }]}>{title}</Text>
    </Pressable>
  );
}

/** 对话页的标题:头像 + 名字 + 一行状态。 */
export function HeaderIdentity({
  username,
  userId,
  avatarTs,
  subtitle,
}: {
  username: string;
  userId?: string | null;
  avatarTs?: string | null;
  subtitle?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.identity}>
      <Avatar username={username} userId={userId} avatarTs={avatarTs} size={30} />
      <View>
        <Text style={[Type.headline, { color: colors.text }]} numberOfLines={1}>
          {username}
        </Text>
        {subtitle && (
          <Text style={[Type.caption1, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 4, paddingVertical: 6 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 240 },
});
