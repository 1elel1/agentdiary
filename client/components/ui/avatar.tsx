import { Image } from 'expo-image';
import { StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { avatarUrl } from '@/lib/api';
import { avatarColor, CELEBRITY_PORTRAITS } from '@/lib/celebrity-portraits';

/** 头像:自定义上传 > 名人内置画像 > 首字母色块。 */
export function Avatar({
  username,
  userId,
  avatarTs,
  size = 44,
  style,
}: {
  username: string;
  userId?: string | null;
  avatarTs?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  // expo-image 的 style 类型是 ImageStyle;圆形头像用到的属性两边都有
  const imageStyle = style as StyleProp<ImageStyle>;
  if (userId && avatarTs) {
    return (
      <Image
        source={{ uri: avatarUrl(userId, avatarTs) }}
        style={[shape, imageStyle]}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
        recyclingKey={`${userId}-${avatarTs}`}
      />
    );
  }
  const portrait = CELEBRITY_PORTRAITS[username];
  if (portrait) {
    return <Image source={portrait} style={[shape, imageStyle]} contentFit="cover" />;
  }
  return (
    <View style={[shape, styles.fallback, { backgroundColor: avatarColor(username) }, style]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
        {(username || '?').slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '600' },
});
