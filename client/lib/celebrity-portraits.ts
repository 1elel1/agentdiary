// 内置名人化身的肖像(公有领域图片,来源维基共享资源)。
// key 与后端 celebrities.py 的 username 一致。

import type { ImageSourcePropType } from 'react-native';

export const CELEBRITY_PORTRAITS: Record<string, ImageSourcePropType> = {
  鲁迅: require('@/assets/images/celebrities/luxun.jpg'),
  雨果: require('@/assets/images/celebrities/hugo.jpg'),
  李白: require('@/assets/images/celebrities/libai.jpg'),
  张爱玲: require('@/assets/images/celebrities/zhangailing.jpg'),
};

// 普通用户的首字母头像底色(按用户名哈希取色,同一用户永远同色)。
// 低饱和中间调:深色界面上不会像警报色,白色首字母在上面也有足够对比
const AVATAR_COLORS = ['#6F86AD', '#A8866F', '#729A7E', '#8E82B3', '#A8778F', '#64969B'];

export function avatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
